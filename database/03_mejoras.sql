-- =====================================================================
--  HOTEL MAREA ALTA — Mejoras (se puede ejecutar varias veces sin perder datos)
--  · Bitácora de auditoría (solo inserción)
--  · Correos automáticos (bandeja de salida con reintentos)
--  · Cambio de habitación de una reserva en curso
--  · Pagos en línea (Niubiz, Culqi, Mercado Pago o pasarela simulada)
--  · Facturación electrónica SUNAT mediante un OSE (boletas, facturas y notas de crédito)
--  · Devoluciones de dinero (pasarela o manuales)
--  · Recordatorio antes de la llegada y encuesta tras el check-out
--  · Caja por turnos y arqueo
--  Lo aplican «npm run db», «npm run db:demo» y, sobre una base existente,
--  «npm run db:migrar». Ejecutar DESPUÉS de 01_esquema.sql.
-- =====================================================================
SET client_encoding = 'UTF8';
SET client_min_messages = warning;

ALTER TABLE clientes ADD COLUMN IF NOT EXISTS idioma varchar(2) CHECK (idioma IN ('es','en'));
ALTER TABLE reclamaciones ADD COLUMN IF NOT EXISTS idioma varchar(2) NOT NULL DEFAULT 'es' CHECK (idioma IN ('es','en'));

-- ---------------------------------------------------------------------
-- 1. Bitácora de auditoría: quién hizo qué, cuándo y desde qué IP
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS bitacora (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  fecha        timestamptz   NOT NULL DEFAULT now(),
  usuario_id   int           REFERENCES usuarios(id),          -- NULL = huésped (web), pasarela o sistema
  usuario      varchar(150)  NOT NULL,
  accion       varchar(40)   NOT NULL,                         -- reserva.crear, pago.anular, usuario.editar…
  entidad      varchar(20)   NOT NULL,                         -- reserva, habitacion, cliente, usuario…
  entidad_id   varchar(40),                                    -- código de reserva, id, N.° de hoja…
  descripcion  varchar(500)  NOT NULL,
  datos        jsonb,                                          -- detalle: cambios (antes → después), montos…
  ip           varchar(45)
);
CREATE INDEX IF NOT EXISTS ix_bitacora_fecha   ON bitacora (fecha DESC);
CREATE INDEX IF NOT EXISTS ix_bitacora_entidad ON bitacora (entidad, entidad_id);
CREATE INDEX IF NOT EXISTS ix_bitacora_usuario ON bitacora (usuario_id, fecha DESC);

-- Nadie (ni la propia API) puede modificar o borrar registros de la bitácora
CREATE OR REPLACE FUNCTION bitacora_inmutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'La bitácora de auditoría no se puede modificar ni borrar.';
END $$;
DROP TRIGGER IF EXISTS tr_bitacora_inmutable ON bitacora;
CREATE TRIGGER tr_bitacora_inmutable BEFORE UPDATE OR DELETE ON bitacora
  FOR EACH ROW EXECUTE FUNCTION bitacora_inmutable();
DROP TRIGGER IF EXISTS tr_bitacora_sin_truncate ON bitacora;
CREATE TRIGGER tr_bitacora_sin_truncate BEFORE TRUNCATE ON bitacora
  FOR EACH STATEMENT EXECUTE FUNCTION bitacora_inmutable();

-- ---------------------------------------------------------------------
-- 2. Correos: se guardan en la misma transacción que la operación y un
--    proceso de la API los envía (con reintentos) por SMTP
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS correos (
  id               int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tipo             varchar(30)   NOT NULL,   -- confirmacion, cancelacion, pago, reclamo_constancia, reclamo_respuesta, comprobante
  para             varchar(150)  NOT NULL,
  asunto           varchar(200)  NOT NULL,
  html             text          NOT NULL,
  texto            text          NOT NULL,
  reserva_id       int           REFERENCES reservas(id),
  reclamacion_id   int           REFERENCES reclamaciones(id),
  estado           varchar(10)   NOT NULL DEFAULT 'Pendiente' CHECK (estado IN ('Pendiente','Enviado','Simulado','Fallido')),
  intentos         int           NOT NULL DEFAULT 0,
  proximo_intento  timestamptz   NOT NULL DEFAULT now(),
  error            varchar(500),
  id_mensaje       varchar(250),             -- Message-ID devuelto por el servidor SMTP
  fecha_creacion   timestamptz   NOT NULL DEFAULT now(),
  fecha_envio      timestamptz
);
CREATE INDEX IF NOT EXISTS ix_correos_pendientes  ON correos (proximo_intento) WHERE estado = 'Pendiente';
CREATE INDEX IF NOT EXISTS ix_correos_reserva     ON correos (reserva_id);
CREATE INDEX IF NOT EXISTS ix_correos_reclamacion ON correos (reclamacion_id);

-- ---------------------------------------------------------------------
-- 3. Cambio de habitación. Si el huésped ya está en el hotel, la nueva
--    habitación se ocupa desde «habitacion_desde» (NULL = desde la llegada).
--    La restricción anti-cruces solo considera ese tramo: las noches ya
--    pasadas en la habitación anterior no bloquean a la nueva.
-- ---------------------------------------------------------------------
ALTER TABLE reservas ADD COLUMN IF NOT EXISTS habitacion_desde date;
ALTER TABLE reservas DROP CONSTRAINT IF EXISTS ck_habitacion_desde;
ALTER TABLE reservas ADD CONSTRAINT ck_habitacion_desde
  CHECK (habitacion_desde IS NULL OR (habitacion_desde > fecha_entrada AND habitacion_desde < fecha_salida));
ALTER TABLE reservas DROP CONSTRAINT IF EXISTS sin_reservas_cruzadas;
ALTER TABLE reservas ADD CONSTRAINT sin_reservas_cruzadas EXCLUDE USING gist (
  habitacion_id WITH =, daterange(coalesce(habitacion_desde, fecha_entrada), fecha_salida, '[)') WITH &&
) WHERE (estado IN ('Confirmada','CheckIn'));

CREATE TABLE IF NOT EXISTS cambios_habitacion (
  id                      int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  reserva_id              int           NOT NULL REFERENCES reservas(id),
  habitacion_anterior_id  int           NOT NULL REFERENCES habitaciones(id),
  habitacion_nueva_id     int           NOT NULL REFERENCES habitaciones(id),
  desde                   date          NOT NULL,
  tarifa                  varchar(10)   NOT NULL CHECK (tarifa IN ('Mantener','Recalcular')),
  total_anterior          numeric(10,2) NOT NULL,
  total_nuevo             numeric(10,2) NOT NULL,
  motivo                  varchar(200)  NOT NULL,
  registrado_por          varchar(100)  NOT NULL,
  fecha                   timestamptz   NOT NULL DEFAULT now(),
  CHECK (habitacion_anterior_id <> habitacion_nueva_id)
);
CREATE INDEX IF NOT EXISTS ix_cambios_reserva ON cambios_habitacion (reserva_id);

-- ---------------------------------------------------------------------
-- 4. Pagos en línea. Cada intento es una «orden»: el monto lo fija la API
--    (saldo de la reserva) y el pago se registra una sola vez aunque la
--    pasarela avise varias veces.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ordenes_pago (
  id                  uuid          PRIMARY KEY DEFAULT gen_random_uuid(),   -- público pero imposible de adivinar
  numero              bigint        GENERATED ALWAYS AS IDENTITY UNIQUE,     -- N.° de pedido (purchaseNumber de Niubiz)
  reserva_id          int           NOT NULL REFERENCES reservas(id),
  pasarela            varchar(20)   NOT NULL CHECK (pasarela IN ('Simulada','Culqi','MercadoPago','Niubiz')),
  monto               numeric(10,2) NOT NULL CHECK (monto > 0),
  moneda              varchar(3)    NOT NULL DEFAULT 'PEN' CHECK (moneda = 'PEN'),
  email               varchar(150)  NOT NULL,
  estado              varchar(10)   NOT NULL DEFAULT 'Pendiente' CHECK (estado IN ('Pendiente','Aprobado','Rechazado')),
  datos_checkout      jsonb,        -- lo que necesita el navegador: sessionKey de Niubiz, URL de Mercado Pago…
  referencia_externa  varchar(100), -- id del cargo, del pago o de la transacción en la pasarela
  respuesta           jsonb,        -- respuesta resumida de la pasarela (nunca datos completos de tarjeta)
  mensaje             varchar(300),
  pago_id             int           UNIQUE REFERENCES pagos(id),
  fecha_creacion      timestamptz   NOT NULL DEFAULT now(),
  expira              timestamptz   NOT NULL DEFAULT now() + interval '30 minutes',
  fecha_resultado     timestamptz
);
CREATE INDEX IF NOT EXISTS ix_ordenes_reserva ON ordenes_pago (reserva_id);
ALTER TABLE pagos ADD COLUMN IF NOT EXISTS pasarela varchar(20);

-- ---------------------------------------------------------------------
-- 5. Facturación electrónica: boletas (03) y facturas (01) con correlativo
--    por serie sin huecos. El OSE/PSE valida y envía a SUNAT.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS series_comprobante (
  serie   varchar(4)  PRIMARY KEY CHECK (serie ~ '^[FB][A-Z0-9]{3}$'),
  tipo    varchar(2)  NOT NULL CONSTRAINT ck_series_tipo CHECK (tipo IN ('01','03','07','08')),
  ultimo  int         NOT NULL DEFAULT 0 CHECK (ultimo >= 0)
);

CREATE TABLE IF NOT EXISTS comprobantes (
  id                 int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  reserva_id         int           NOT NULL REFERENCES reservas(id),
  tipo               varchar(2)    NOT NULL CONSTRAINT ck_comprobantes_tipo CHECK (tipo IN ('01','03','07','08')),   -- catálogo 01: 01 factura, 03 boleta, 07 crédito, 08 débito
  referencia_id      int           REFERENCES comprobantes(id),                -- nota de crédito: comprobante que modifica
  motivo_nota        varchar(2),                                               -- catálogo 09: 01 anulación, 02 error en el RUC, 06 devolución total, 09 disminución en el valor
  sustento           varchar(250),
  serie              varchar(4)    NOT NULL REFERENCES series_comprobante(serie),
  numero             int           NOT NULL,
  fecha_emision      date          NOT NULL,
  tipo_operacion     varchar(4)    NOT NULL,                                    -- catálogo 51: 0101 venta interna, 0202 exportación de hospedaje
  cliente_tipo_doc   varchar(1)    NOT NULL,                                    -- catálogo 06: 1 DNI, 4 CE, 6 RUC, 7 pasaporte
  cliente_num_doc    varchar(15)   NOT NULL,
  cliente_nombre     varchar(200)  NOT NULL,
  cliente_direccion  varchar(200),
  cliente_email      varchar(150),
  moneda             varchar(3)    NOT NULL DEFAULT 'PEN',
  gravada            numeric(10,2) NOT NULL DEFAULT 0,
  exportacion        numeric(10,2) NOT NULL DEFAULT 0,
  igv                numeric(10,2) NOT NULL DEFAULT 0,
  total              numeric(10,2) NOT NULL CHECK (total > 0),
  items              jsonb         NOT NULL,
  proveedor          varchar(20)   NOT NULL,                                    -- Simulado, Nubefact…
  estado             varchar(10)   NOT NULL DEFAULT 'Pendiente' CHECK (estado IN ('Pendiente','Aceptado','Observado','Rechazado','Anulado')),
  mensaje            varchar(500),
  hash               varchar(100),
  cadena_qr          varchar(500),
  enlace_pdf         varchar(400),
  enlace_xml         varchar(400),
  enlace_cdr         varchar(400),
  respuesta          jsonb,
  intentos           int           NOT NULL DEFAULT 0,
  registrado_por     varchar(100),
  fecha_registro     timestamptz   NOT NULL DEFAULT now(),
  fecha_envio        timestamptz,
  motivo_anulacion   varchar(200),
  fecha_anulacion    timestamptz,
  UNIQUE (serie, numero),
  CHECK (total = gravada + exportacion + igv),
  CONSTRAINT ck_nota_referencia CHECK ((tipo IN ('07','08')) = (referencia_id IS NOT NULL AND motivo_nota IS NOT NULL))
);

-- Bases creadas antes de las notas de crédito
ALTER TABLE comprobantes ADD COLUMN IF NOT EXISTS referencia_id int REFERENCES comprobantes(id);
ALTER TABLE comprobantes ADD COLUMN IF NOT EXISTS motivo_nota varchar(2);
ALTER TABLE comprobantes ADD COLUMN IF NOT EXISTS sustento varchar(250);
-- Comprobante neutralizado por una nota de crédito total (sigue válido en SUNAT; la nota lo resta en el registro de ventas)
ALTER TABLE comprobantes ADD COLUMN IF NOT EXISTS anulado_con_nota_id int REFERENCES comprobantes(id);
ALTER TABLE comprobantes DROP CONSTRAINT IF EXISTS comprobantes_tipo_check;
ALTER TABLE comprobantes DROP CONSTRAINT IF EXISTS ck_comprobantes_tipo;
ALTER TABLE comprobantes ADD CONSTRAINT ck_comprobantes_tipo CHECK (tipo IN ('01','03','07','08'));
ALTER TABLE comprobantes DROP CONSTRAINT IF EXISTS ck_nota_referencia;
ALTER TABLE comprobantes ADD CONSTRAINT ck_nota_referencia CHECK ((tipo IN ('07','08')) = (referencia_id IS NOT NULL AND motivo_nota IS NOT NULL));
ALTER TABLE series_comprobante DROP CONSTRAINT IF EXISTS series_comprobante_tipo_check;
ALTER TABLE series_comprobante DROP CONSTRAINT IF EXISTS ck_series_tipo;
ALTER TABLE series_comprobante ADD CONSTRAINT ck_series_tipo CHECK (tipo IN ('01','03','07','08'));

CREATE INDEX IF NOT EXISTS ix_comprobantes_reserva    ON comprobantes (reserva_id);
CREATE INDEX IF NOT EXISTS ix_comprobantes_fecha      ON comprobantes (fecha_emision);
CREATE INDEX IF NOT EXISTS ix_comprobantes_referencia ON comprobantes (referencia_id);
-- Una reserva tiene como máximo una boleta o factura vigente (no cuentan notas de crédito, rechazados, anulados ni los neutralizados por nota de crédito)
DROP INDEX IF EXISTS ux_comprobante_vigente;
CREATE UNIQUE INDEX ux_comprobante_vigente ON comprobantes (reserva_id)
  WHERE estado NOT IN ('Rechazado','Anulado') AND tipo IN ('01','03') AND anulado_con_nota_id IS NULL;

-- Registro de ventas para Power BI (las notas de crédito restan en total_neto)
DROP VIEW IF EXISTS vw_comprobantes_powerbi;
CREATE VIEW vw_comprobantes_powerbi AS
SELECT c.id AS comprobante_id, CASE c.tipo WHEN '01' THEN 'Factura' WHEN '03' THEN 'Boleta' WHEN '08' THEN 'Nota de débito' ELSE 'Nota de crédito' END AS tipo, c.serie, c.numero,
       c.serie || '-' || c.numero AS comprobante, c.fecha_emision, c.tipo_operacion, c.cliente_tipo_doc, c.cliente_num_doc,
       c.cliente_nombre, c.gravada, c.exportacion, c.igv, c.total, c.estado, c.proveedor, r.codigo AS codigo_reserva,
       ref.serie || '-' || ref.numero AS modifica, c.motivo_nota,
       CASE WHEN c.tipo = '07' THEN -c.total ELSE c.total END AS total_neto
FROM comprobantes c JOIN reservas r ON r.id = c.reserva_id LEFT JOIN comprobantes ref ON ref.id = c.referencia_id;

-- ---------------------------------------------------------------------
-- 6. Devoluciones de dinero (por la pasarela o registradas a mano)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS devoluciones (
  id                  int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  pago_id             int           NOT NULL REFERENCES pagos(id),
  reserva_id          int           NOT NULL REFERENCES reservas(id),
  monto               numeric(10,2) NOT NULL CHECK (monto > 0),                 -- soles
  motivo              varchar(200)  NOT NULL,
  reduce_total        boolean       NOT NULL DEFAULT false,                    -- descuento o noches no usadas
  medio               varchar(10)   NOT NULL CHECK (medio IN ('Pasarela','Manual')),
  pasarela            varchar(20),
  estado              varchar(10)   NOT NULL DEFAULT 'Pendiente' CHECK (estado IN ('Pendiente','Completada','Fallida')),
  referencia_externa  varchar(100),
  respuesta           jsonb,
  mensaje             varchar(300),
  registrado_por      varchar(100)  NOT NULL,
  fecha               timestamptz   NOT NULL DEFAULT now(),
  fecha_resultado     timestamptz
);
CREATE INDEX IF NOT EXISTS ix_devoluciones_pago    ON devoluciones (pago_id);
CREATE INDEX IF NOT EXISTS ix_devoluciones_reserva ON devoluciones (reserva_id);

-- Evita volver a registrar una devolución Niubiz si se perdió la respuesta HTTP.
ALTER TABLE devoluciones ADD COLUMN IF NOT EXISTS solicitud_enviada boolean NOT NULL DEFAULT false;
CREATE UNIQUE INDEX IF NOT EXISTS ux_devolucion_niubiz_codigo ON devoluciones(referencia_externa)
  WHERE pasarela = 'Niubiz' AND medio = 'Pasarela' AND referencia_externa IS NOT NULL;

CREATE TABLE IF NOT EXISTS consumos (
  id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  reserva_id int NOT NULL REFERENCES reservas(id),
  categoria varchar(20) NOT NULL CHECK (categoria IN ('Restaurante','Bar','Tour','Minibar','LateCheckout','Otro')),
  descripcion varchar(200) NOT NULL,
  cantidad int NOT NULL CHECK (cantidad BETWEEN 1 AND 1000),
  precio_unitario numeric(10,2) NOT NULL CHECK (precio_unitario > 0),
  subtotal numeric(10,2) NOT NULL CHECK (subtotal >= 0),
  igv numeric(10,2) NOT NULL CHECK (igv >= 0),
  total numeric(10,2) NOT NULL CHECK (total > 0 AND total = subtotal + igv),
  comprobante_id int REFERENCES comprobantes(id),
  estado varchar(10) NOT NULL DEFAULT 'Activo' CHECK (estado IN ('Activo','Anulado')),
  registrado_por varchar(100) NOT NULL,
  fecha timestamptz NOT NULL DEFAULT now(),
  motivo_anulacion varchar(200)
);
CREATE INDEX IF NOT EXISTS ix_consumos_reserva ON consumos(reserva_id);

-- Lo pagado de una reserva en un solo lugar: pagos aprobados menos devoluciones completadas
CREATE OR REPLACE FUNCTION pagado_neto(p_reserva int) RETURNS numeric LANGUAGE sql STABLE AS $$
  SELECT coalesce((SELECT sum(monto_soles) FROM pagos WHERE reserva_id = p_reserva AND estado = 'Aprobado'), 0)
       - coalesce((SELECT sum(monto) FROM devoluciones WHERE reserva_id = p_reserva AND estado = 'Completada'), 0)
$$;

CREATE OR REPLACE VIEW vw_reservas_powerbi AS
SELECT r.id AS reserva_id, r.codigo, r.fecha_reserva, r.fecha_reserva::date AS fecha_reserva_dia,
       r.fecha_entrada, r.fecha_salida, r.noches, r.huespedes,
       r.fecha_entrada - r.fecha_reserva::date AS dias_anticipacion,
       r.estado AS estado_reserva, (r.estado NOT IN ('Cancelada','NoShow'))::int AS es_efectiva,
       r.canal, CASE c.residencia WHEN 'EXT' THEN 'Extranjero' ELSE 'Residente' END AS residencia,
       r.exonerado_igv, r.subtotal, r.igv, r.total, round(r.total / nullif(r.noches, 0), 2) AS tarifa_promedio_noche,
       pagado_neto(r.id) AS pagado, r.total - pagado_neto(r.id) AS saldo,
       c.id AS cliente_id, c.nombres || ' ' || c.apellidos AS cliente, c.tipo_documento, c.codigo_pais,
       h.numero AS habitacion, h.piso, t.nombre AS tipo_habitacion, t.precio_noche AS tarifa_lista
FROM reservas r
JOIN clientes c ON c.id = r.cliente_id
JOIN habitaciones h ON h.id = r.habitacion_id
JOIN tipos_habitacion t ON t.id = h.tipo_habitacion_id;

-- ---------------------------------------------------------------------
-- 7. Correos programados: recordatorio antes de la llegada y encuesta tras el check-out
-- ---------------------------------------------------------------------
-- Como máximo un recordatorio y una encuesta por reserva, aunque el proceso corra en varias instancias
CREATE UNIQUE INDEX IF NOT EXISTS ux_correos_programados ON correos (reserva_id, tipo) WHERE tipo IN ('recordatorio','encuesta');

CREATE TABLE IF NOT EXISTS encuestas (
  id               int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  reserva_id       int           NOT NULL UNIQUE REFERENCES reservas(id),
  token            uuid          NOT NULL UNIQUE DEFAULT gen_random_uuid(),   -- enlace del correo, imposible de adivinar
  fecha_envio      timestamptz   NOT NULL DEFAULT now(),
  calificacion     int           CHECK (calificacion BETWEEN 1 AND 5),
  recomendacion    int           CHECK (recomendacion BETWEEN 0 AND 10),     -- base del NPS
  comentario       varchar(1000),
  fecha_respuesta  timestamptz,
  CHECK ((fecha_respuesta IS NULL) = (calificacion IS NULL))
);

-- ---------------------------------------------------------------------
-- 8. Caja por turnos y arqueo. Cada usuario abre su turno con un fondo
--    inicial en efectivo; lo que cobra o devuelve en efectivo queda en su
--    turno. Al cerrar cuenta la caja (arqueo) y se guardan lo esperado, lo
--    contado y la diferencia (+ sobrante, − faltante). Un arqueo cerrado
--    no se modifica: el administrador solo puede marcarlo como revisado.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS turnos_caja (
  id                  int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  usuario_id          int           NOT NULL REFERENCES usuarios(id),
  usuario             varchar(100)  NOT NULL,
  estado              varchar(10)   NOT NULL DEFAULT 'Abierto' CHECK (estado IN ('Abierto','Cerrado')),
  fondo_inicial       numeric(10,2) NOT NULL CHECK (fondo_inicial >= 0),            -- soles en efectivo al abrir
  nota_apertura       varchar(200),
  fecha_apertura      timestamptz   NOT NULL DEFAULT now(),
  fecha_cierre        timestamptz,
  cerrado_por         varchar(100),
  esperado_soles      numeric(10,2),                                                -- según el sistema al cerrar
  esperado_dolares    numeric(10,2),
  contado_soles       numeric(10,2) CHECK (contado_soles >= 0),
  contado_dolares     numeric(10,2) CHECK (contado_dolares >= 0),
  diferencia_soles    numeric(10,2) GENERATED ALWAYS AS (contado_soles - esperado_soles) STORED,
  diferencia_dolares  numeric(10,2) GENERATED ALWAYS AS (contado_dolares - esperado_dolares) STORED,
  denominaciones      jsonb,                                                        -- billetes y monedas contados: {"200": 1, "0.5": 4}
  observaciones       varchar(500),
  revisado_por        varchar(100),
  fecha_revision      timestamptz,
  nota_revision       varchar(300),
  CONSTRAINT ck_turno_cierre CHECK ((estado = 'Cerrado') = (fecha_cierre IS NOT NULL AND cerrado_por IS NOT NULL AND esperado_soles IS NOT NULL
    AND esperado_dolares IS NOT NULL AND contado_soles IS NOT NULL AND contado_dolares IS NOT NULL)),
  CONSTRAINT ck_turno_fechas CHECK (fecha_cierre IS NULL OR fecha_cierre >= fecha_apertura),
  CONSTRAINT ck_turno_revision CHECK ((fecha_revision IS NULL) = (revisado_por IS NULL) AND (fecha_revision IS NULL OR estado = 'Cerrado'))
);
-- Un solo turno abierto por usuario
CREATE UNIQUE INDEX IF NOT EXISTS ux_turno_abierto ON turnos_caja (usuario_id) WHERE estado = 'Abierto';
CREATE INDEX IF NOT EXISTS ix_turnos_apertura ON turnos_caja (fecha_apertura DESC);

CREATE TABLE IF NOT EXISTS movimientos_caja (
  id              int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  turno_id        int           NOT NULL REFERENCES turnos_caja(id),
  tipo            varchar(10)   NOT NULL CHECK (tipo IN ('Ingreso','Retiro')),     -- sencillo recibido, depósito en la caja fuerte…
  moneda          varchar(3)    NOT NULL DEFAULT 'PEN' CHECK (moneda IN ('PEN','USD')),
  monto           numeric(10,2) NOT NULL CHECK (monto > 0),
  motivo          varchar(200)  NOT NULL,
  registrado_por  varchar(100)  NOT NULL,
  fecha           timestamptz   NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_movimientos_turno ON movimientos_caja (turno_id);

-- Pagos y devoluciones registrados en el panel (los de la pasarela no tienen turno)
ALTER TABLE pagos ADD COLUMN IF NOT EXISTS turno_id int REFERENCES turnos_caja(id);
ALTER TABLE devoluciones ADD COLUMN IF NOT EXISTS turno_id int REFERENCES turnos_caja(id);
CREATE INDEX IF NOT EXISTS ix_pagos_turno ON pagos (turno_id) WHERE turno_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_devoluciones_turno ON devoluciones (turno_id) WHERE turno_id IS NOT NULL;

-- Solo se registra dinero en un turno abierto. FOR SHARE espera a un cierre en curso y luego ve el turno ya cerrado.
CREATE OR REPLACE FUNCTION exigir_turno_abierto() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM 1 FROM turnos_caja WHERE id = NEW.turno_id AND estado = 'Abierto' FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'El turno de caja % ya está cerrado.', NEW.turno_id USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS tr_pagos_turno_abierto ON pagos;
CREATE TRIGGER tr_pagos_turno_abierto BEFORE INSERT ON pagos
  FOR EACH ROW WHEN (NEW.turno_id IS NOT NULL) EXECUTE FUNCTION exigir_turno_abierto();
DROP TRIGGER IF EXISTS tr_devoluciones_turno_abierto ON devoluciones;
CREATE TRIGGER tr_devoluciones_turno_abierto BEFORE INSERT ON devoluciones
  FOR EACH ROW WHEN (NEW.turno_id IS NOT NULL) EXECUTE FUNCTION exigir_turno_abierto();
DROP TRIGGER IF EXISTS tr_movimientos_turno_abierto ON movimientos_caja;
CREATE TRIGGER tr_movimientos_turno_abierto BEFORE INSERT ON movimientos_caja
  FOR EACH ROW EXECUTE FUNCTION exigir_turno_abierto();

-- Un arqueo cerrado no cambia: solo se le agrega una vez la revisión del administrador. Nada se borra.
CREATE OR REPLACE FUNCTION turno_caja_inmutable() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  revision text[] := ARRAY['revisado_por','fecha_revision','nota_revision','diferencia_soles','diferencia_dolares'];
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Los turnos de caja no se borran.'; END IF;
  IF OLD.estado = 'Cerrado' AND (OLD.fecha_revision IS NOT NULL OR (to_jsonb(NEW) - revision) IS DISTINCT FROM (to_jsonb(OLD) - revision)) THEN
    RAISE EXCEPTION 'El arqueo del turno % ya está cerrado y no se puede modificar.', OLD.id;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS tr_turno_caja_inmutable ON turnos_caja;
CREATE TRIGGER tr_turno_caja_inmutable BEFORE UPDATE OR DELETE ON turnos_caja
  FOR EACH ROW EXECUTE FUNCTION turno_caja_inmutable();

-- Los movimientos de caja tampoco se corrigen: se registra el movimiento inverso
CREATE OR REPLACE FUNCTION movimiento_caja_inmutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Los movimientos de caja no se modifican ni se borran: registra el movimiento inverso.';
END $$;
DROP TRIGGER IF EXISTS tr_movimiento_caja_inmutable ON movimientos_caja;
CREATE TRIGGER tr_movimiento_caja_inmutable BEFORE UPDATE OR DELETE ON movimientos_caja
  FOR EACH ROW EXECUTE FUNCTION movimiento_caja_inmutable();

-- Power BI: pagos con su turno y un resumen por turno (arqueo y cobros)
CREATE OR REPLACE VIEW vw_pagos_powerbi AS
SELECT p.id AS pago_id, p.fecha_pago, p.fecha_pago::date AS fecha_pago_dia, p.metodo, p.moneda, p.monto, p.tipo_cambio,
       p.monto_soles, p.estado AS estado_pago, r.codigo AS codigo_reserva, t.nombre AS tipo_habitacion, p.turno_id
FROM pagos p JOIN reservas r ON r.id = p.reserva_id JOIN habitaciones h ON h.id = r.habitacion_id
JOIN tipos_habitacion t ON t.id = h.tipo_habitacion_id;

DROP VIEW IF EXISTS vw_turnos_caja_powerbi;
CREATE VIEW vw_turnos_caja_powerbi AS
SELECT t.id AS turno_id, t.usuario, t.estado, t.fecha_apertura, (t.fecha_apertura AT TIME ZONE 'America/Lima')::date AS fecha_apertura_dia,
       t.fecha_cierre, round(extract(epoch FROM coalesce(t.fecha_cierre, now()) - t.fecha_apertura) / 3600, 1) AS horas_abierto,
       t.fondo_inicial, t.esperado_soles, t.contado_soles, t.diferencia_soles, t.esperado_dolares, t.contado_dolares, t.diferencia_dolares,
       coalesce(p.cobrado, 0) AS cobrado_soles, coalesce(p.efectivo, 0) AS cobrado_efectivo_soles, coalesce(p.cantidad, 0) AS pagos,
       (t.revisado_por IS NOT NULL) AS revisado
FROM turnos_caja t
LEFT JOIN (SELECT turno_id, sum(monto_soles) AS cobrado, sum(monto_soles) FILTER (WHERE metodo = 'Efectivo') AS efectivo, count(*) AS cantidad
           FROM pagos WHERE estado = 'Aprobado' AND turno_id IS NOT NULL GROUP BY turno_id) p ON p.turno_id = t.id;
