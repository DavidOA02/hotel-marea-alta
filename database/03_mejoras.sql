-- =====================================================================
--  HOTEL MAREA ALTA — Mejoras (se puede ejecutar varias veces sin perder datos)
--  · Bitácora de auditoría (solo inserción)
--  · Correos automáticos (bandeja de salida con reintentos)
--  · Cambio de habitación de una reserva en curso
--  · Pagos en línea (Niubiz, Culqi, Mercado Pago o pasarela simulada)
--  · Facturación electrónica SUNAT mediante un OSE
--  Lo aplican «npm run db», «npm run db:demo» y, sobre una base existente,
--  «npm run db:migrar». Ejecutar DESPUÉS de 01_esquema.sql.
-- =====================================================================
SET client_encoding = 'UTF8';
SET client_min_messages = warning;

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
  tipo    varchar(2)  NOT NULL CHECK (tipo IN ('01','03')),
  ultimo  int         NOT NULL DEFAULT 0 CHECK (ultimo >= 0)
);

CREATE TABLE IF NOT EXISTS comprobantes (
  id                 int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  reserva_id         int           NOT NULL REFERENCES reservas(id),
  tipo               varchar(2)    NOT NULL CHECK (tipo IN ('01','03')),       -- catálogo 01: 01 factura, 03 boleta
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
  CHECK (total = gravada + exportacion + igv)
);
CREATE INDEX IF NOT EXISTS ix_comprobantes_reserva ON comprobantes (reserva_id);
CREATE INDEX IF NOT EXISTS ix_comprobantes_fecha   ON comprobantes (fecha_emision);
-- Una reserva tiene como máximo un comprobante vigente (los rechazados o anulados no cuentan)
CREATE UNIQUE INDEX IF NOT EXISTS ux_comprobante_vigente ON comprobantes (reserva_id) WHERE estado NOT IN ('Rechazado','Anulado');

-- Registro de ventas para Power BI
CREATE OR REPLACE VIEW vw_comprobantes_powerbi AS
SELECT c.id AS comprobante_id, CASE c.tipo WHEN '01' THEN 'Factura' ELSE 'Boleta' END AS tipo, c.serie, c.numero,
       c.serie || '-' || c.numero AS comprobante, c.fecha_emision, c.tipo_operacion, c.cliente_tipo_doc, c.cliente_num_doc,
       c.cliente_nombre, c.gravada, c.exportacion, c.igv, c.total, c.estado, c.proveedor, r.codigo AS codigo_reserva
FROM comprobantes c JOIN reservas r ON r.id = c.reserva_id;
