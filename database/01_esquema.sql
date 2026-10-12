-- =====================================================================
--  HOTEL MAREA ALTA · PARACAS — Base de datos PostgreSQL (14 o superior)
--  Crea tablas, restricciones, datos iniciales, calendario y vistas
--  para Power BI. Se puede volver a ejecutar: BORRA los datos existentes.
--
--  Usuarios iniciales del panel (cambian la contraseña al ingresar):
--    admin@mareaalta.pe     / Admin2026!      (Administrador)
--    recepcion@mareaalta.pe / Recepcion2026!  (Recepcionista)
-- =====================================================================
SET client_encoding = 'UTF8';
SET client_min_messages = warning;
CREATE EXTENSION IF NOT EXISTS btree_gist;   -- para impedir reservas cruzadas

DROP VIEW  IF EXISTS vw_mantenimiento_powerbi, vw_turnos_caja_powerbi, vw_comprobantes_powerbi, vw_reclamaciones_powerbi, vw_pagos_powerbi, vw_ocupacion_diaria, vw_reservas_powerbi CASCADE;
DROP TABLE IF EXISTS bitacora, correos, encuestas, consumos, devoluciones, movimientos_caja, turnos_caja, mantenimientos, limpiezas, cambios_habitacion, ordenes_pago, comprobantes, series_comprobante CASCADE;   -- de 03_mejoras.sql
DROP TABLE IF EXISTS pagos, reservas, habitaciones, tipos_habitacion, clientes, reclamaciones, suscriptores, usuarios, calendario CASCADE;

-- ---------------------------------------------------------------------
-- 1. Tablas
-- ---------------------------------------------------------------------
CREATE TABLE tipos_habitacion (
  id                int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  codigo            varchar(20)   NOT NULL UNIQUE,
  nombre            varchar(60)   NOT NULL,
  descripcion       varchar(300),
  capacidad         int           NOT NULL CHECK (capacidad BETWEEN 1 AND 8),
  metros_cuadrados  int           NOT NULL,
  precio_noche      numeric(10,2) NOT NULL CHECK (precio_noche > 0),   -- soles, IGV incluido
  activo            boolean       NOT NULL DEFAULT true
);

CREATE TABLE habitaciones (
  id                  int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  numero              varchar(10)  NOT NULL UNIQUE,
  piso                int          NOT NULL,
  tipo_habitacion_id  int          NOT NULL REFERENCES tipos_habitacion(id),
  estado              varchar(20)  NOT NULL DEFAULT 'Operativa' CHECK (estado IN ('Operativa','Mantenimiento','FueraDeServicio')),
  estado_limpieza     varchar(10)  NOT NULL DEFAULT 'Limpia'    CHECK (estado_limpieza IN ('Limpia','Sucia')),
  notas               varchar(300)
);

CREATE TABLE clientes (
  id                 int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nombres            varchar(80)  NOT NULL,
  apellidos          varchar(80)  NOT NULL,
  tipo_documento     varchar(3)   NOT NULL CHECK (tipo_documento IN ('DNI','CE','PAS')),
  numero_documento   varchar(12)  NOT NULL,
  email              varchar(150) NOT NULL,
  codigo_pais        varchar(4)   NOT NULL DEFAULT '51',
  telefono           varchar(15)  NOT NULL,
  residencia         varchar(3)   NOT NULL CHECK (residencia IN ('PE','EXT')),
  acepta_publicidad  boolean      NOT NULL DEFAULT false,
  notas              varchar(500),
  fecha_registro     timestamptz  NOT NULL DEFAULT now(),
  UNIQUE (tipo_documento, numero_documento)
);
CREATE INDEX ix_clientes_email ON clientes (lower(email));

CREATE TABLE reservas (
  id                 int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  codigo             varchar(20)   NOT NULL UNIQUE,
  cliente_id         int           NOT NULL REFERENCES clientes(id),
  habitacion_id      int           NOT NULL REFERENCES habitaciones(id),
  fecha_entrada      date          NOT NULL,
  fecha_salida       date          NOT NULL,
  noches             int           GENERATED ALWAYS AS (fecha_salida - fecha_entrada) STORED,
  huespedes          int           NOT NULL CHECK (huespedes BETWEEN 1 AND 8),
  hora_llegada       varchar(30),
  notas              varchar(500),
  exonerado_igv      boolean       NOT NULL DEFAULT false,
  subtotal           numeric(10,2) NOT NULL CHECK (subtotal >= 0),   -- valor de venta (sin IGV)
  igv                numeric(10,2) NOT NULL CHECK (igv >= 0),
  total              numeric(10,2) NOT NULL,
  estado             varchar(20)   NOT NULL DEFAULT 'Confirmada' CHECK (estado IN ('Confirmada','CheckIn','CheckOut','Cancelada','NoShow')),
  canal              varchar(20)   NOT NULL DEFAULT 'Web' CHECK (canal IN ('Web','WhatsApp','Telefono','Recepcion')),
  fecha_reserva      timestamptz   NOT NULL DEFAULT now(),
  fecha_cancelacion  timestamptz,
  fecha_check_in     timestamptz,
  fecha_check_out    timestamptz,
  registrado_por     varchar(100),                                   -- usuario del panel (NULL = web)
  CHECK (fecha_salida > fecha_entrada),
  CHECK (total = subtotal + igv),
  -- Ninguna habitación puede tener dos reservas activas que se crucen (la fecha de salida queda libre)
  CONSTRAINT sin_reservas_cruzadas EXCLUDE USING gist (
    habitacion_id WITH =, daterange(fecha_entrada, fecha_salida, '[)') WITH &&
  ) WHERE (estado IN ('Confirmada','CheckIn'))
);
CREATE INDEX ix_reservas_entrada ON reservas (fecha_entrada);
CREATE INDEX ix_reservas_cliente ON reservas (cliente_id);
CREATE INDEX ix_reservas_estado ON reservas (estado, fecha_salida);

CREATE TABLE pagos (
  id                int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  reserva_id        int           NOT NULL REFERENCES reservas(id),
  monto             numeric(10,2) NOT NULL CHECK (monto > 0),
  moneda            varchar(3)    NOT NULL DEFAULT 'PEN' CHECK (moneda IN ('PEN','USD')),
  tipo_cambio       numeric(6,3),
  monto_soles       numeric(10,2) NOT NULL,
  metodo            varchar(20)   NOT NULL CHECK (metodo IN ('Tarjeta','Yape','Plin','Transferencia','Efectivo')),
  referencia        varchar(60),
  estado            varchar(20)   NOT NULL DEFAULT 'Aprobado' CHECK (estado IN ('Aprobado','Anulado')),
  fecha_pago        timestamptz   NOT NULL DEFAULT now(),
  registrado_por    varchar(100),
  motivo_anulacion  varchar(200),
  CHECK (moneda = 'PEN' OR tipo_cambio IS NOT NULL)
);
CREATE INDEX ix_pagos_reserva ON pagos (reserva_id);
CREATE INDEX ix_pagos_fecha ON pagos (fecha_pago);

CREATE TABLE reclamaciones (
  id                      int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  numero                  varchar(12)    NOT NULL UNIQUE,      -- 00001-2026
  anio                    int            NOT NULL,
  correlativo             int            NOT NULL,
  fecha                   timestamptz    NOT NULL DEFAULT now(),
  tipo                    varchar(10)    NOT NULL CHECK (tipo IN ('Reclamo','Queja')),
  nombre_completo         varchar(160)   NOT NULL,
  tipo_documento          varchar(3)     NOT NULL,
  numero_documento        varchar(12)    NOT NULL,
  domicilio               varchar(200)   NOT NULL,
  telefono                varchar(20)    NOT NULL,
  email                   varchar(150)   NOT NULL,
  es_menor                boolean        NOT NULL DEFAULT false,
  apoderado               varchar(160),
  bien_tipo               varchar(10)    NOT NULL CHECK (bien_tipo IN ('Producto','Servicio')),
  monto_reclamado         numeric(10,2),
  codigo_reserva          varchar(20),
  descripcion_bien        varchar(300)   NOT NULL,
  detalle                 varchar(2000)  NOT NULL,
  pedido                  varchar(1000)  NOT NULL,
  estado                  varchar(12)    NOT NULL DEFAULT 'Pendiente' CHECK (estado IN ('Pendiente','Respondido')),
  fecha_limite_respuesta  date           NOT NULL,
  respuesta               varchar(2000),
  fecha_respuesta         timestamptz,
  UNIQUE (anio, correlativo)
);

CREATE TABLE suscriptores (
  id              int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email           varchar(150) NOT NULL UNIQUE,
  fecha_registro  timestamptz  NOT NULL DEFAULT now(),
  activo          boolean      NOT NULL DEFAULT true
);

CREATE TABLE usuarios (
  id                  int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nombre              varchar(100) NOT NULL,
  email               varchar(150) NOT NULL UNIQUE,
  rol                 varchar(20)  NOT NULL CHECK (rol IN ('Administrador','Recepcionista')),
  clave_hash          varchar(200) NOT NULL,               -- PBKDF2-SHA256
  activo              boolean      NOT NULL DEFAULT true,
  debe_cambiar_clave  boolean      NOT NULL DEFAULT true,
  intentos_fallidos   int          NOT NULL DEFAULT 0,
  bloqueado_hasta     timestamptz,
  ultimo_acceso       timestamptz,
  fecha_creacion      timestamptz  NOT NULL DEFAULT now()
);

CREATE TABLE calendario (
  fecha            date PRIMARY KEY,
  anio             int NOT NULL,
  mes              int NOT NULL,
  nombre_mes       varchar(12) NOT NULL,
  anio_mes         varchar(7)  NOT NULL,
  trimestre        int NOT NULL,
  dia_semana       int NOT NULL,          -- 1 = lunes … 7 = domingo
  nombre_dia       varchar(10) NOT NULL,
  es_fin_de_semana boolean NOT NULL,
  temporada        varchar(30) NOT NULL
);

-- ---------------------------------------------------------------------
-- 2. Datos iniciales
-- ---------------------------------------------------------------------
INSERT INTO tipos_habitacion (codigo, nombre, descripcion, capacidad, metros_cuadrados, precio_noche) VALUES
 ('duna',      'Habitación Duna',      'Planta baja con terraza privada hacia el jardín de buganvillas. Cama queen.',          2, 28,  450.00),
 ('horizonte', 'Habitación Horizonte', 'Segundo piso con balcón frente a la bahía y ventanal de piso a techo. Cama king.',    3, 34,  650.00),
 ('pleamar',   'Suite Pleamar',        'Suite principal con terraza, tina exterior, sala independiente y vista a la bahía.', 4, 58, 1090.00);

-- 24 habitaciones: 10 Duna (piso 1), 10 Horizonte (piso 2), 4 Suites Pleamar (piso 3)
INSERT INTO habitaciones (numero, piso, tipo_habitacion_id)
SELECT t.piso || lpad(n::text, 2, '0'), t.piso, t.id
FROM (SELECT id, CASE codigo WHEN 'duna' THEN 1 WHEN 'horizonte' THEN 2 ELSE 3 END AS piso,
             CASE codigo WHEN 'pleamar' THEN 4 ELSE 10 END AS cantidad FROM tipos_habitacion) t
CROSS JOIN generate_series(1, 10) n
WHERE n <= t.cantidad
ORDER BY t.piso, n;

INSERT INTO usuarios (nombre, email, rol, clave_hash, debe_cambiar_clave) VALUES
 ('Administrador', 'admin@mareaalta.pe',     'Administrador', 'PBKDF2-SHA256$100000$yqPiouVbz+TnnRzEpj1b0Q==$n288Xx2NaXWRNgQoXVciaXwF/g64Q/EdHa+BxFRh/hc=', true),
 ('Recepción',     'recepcion@mareaalta.pe', 'Recepcionista', 'PBKDF2-SHA256$100000$C1Ko2Dg4peLgjhDf5FPoEw==$AwjUDgJS7KpaLhhvfeEWLVPg/CRGb5fAB8Wn9JW8nNw=', true);

INSERT INTO calendario
SELECT d::date, extract(year FROM d)::int, extract(month FROM d)::int,
       (ARRAY['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'])[extract(month FROM d)::int],
       to_char(d, 'YYYY-MM'), extract(quarter FROM d)::int, extract(isodow FROM d)::int,
       (ARRAY['Lunes','Martes','Miércoles','Jueves','Viernes','Sábado','Domingo'])[extract(isodow FROM d)::int],
       extract(isodow FROM d) IN (6, 7),
       CASE WHEN extract(month FROM d) IN (1,2,3) OR (extract(month FROM d) = 12 AND extract(day FROM d) >= 15) THEN 'Alta (verano)'
            WHEN extract(month FROM d) = 7 AND extract(day FROM d) >= 25 THEN 'Alta (Fiestas Patrias)'
            ELSE 'Regular' END
FROM generate_series('2024-01-01'::date, '2028-12-31'::date, interval '1 day') d;

-- ---------------------------------------------------------------------
-- 3. Vistas para Power BI
-- ---------------------------------------------------------------------
CREATE VIEW vw_reservas_powerbi AS
SELECT r.id AS reserva_id, r.codigo, r.fecha_reserva, r.fecha_reserva::date AS fecha_reserva_dia,
       r.fecha_entrada, r.fecha_salida, r.noches, r.huespedes,
       r.fecha_entrada - r.fecha_reserva::date AS dias_anticipacion,
       r.estado AS estado_reserva, (r.estado NOT IN ('Cancelada','NoShow'))::int AS es_efectiva,
       r.canal, CASE c.residencia WHEN 'EXT' THEN 'Extranjero' ELSE 'Residente' END AS residencia,
       r.exonerado_igv, r.subtotal, r.igv, r.total, round(r.total / nullif(r.noches, 0), 2) AS tarifa_promedio_noche,
       coalesce(p.pagado, 0) AS pagado, r.total - coalesce(p.pagado, 0) AS saldo,
       c.id AS cliente_id, c.nombres || ' ' || c.apellidos AS cliente, c.tipo_documento, c.codigo_pais,
       h.numero AS habitacion, h.piso, t.nombre AS tipo_habitacion, t.precio_noche AS tarifa_lista
FROM reservas r
JOIN clientes c ON c.id = r.cliente_id
JOIN habitaciones h ON h.id = r.habitacion_id
JOIN tipos_habitacion t ON t.id = h.tipo_habitacion_id
LEFT JOIN (SELECT reserva_id, sum(monto_soles) AS pagado FROM pagos WHERE estado = 'Aprobado' GROUP BY reserva_id) p ON p.reserva_id = r.id;

CREATE VIEW vw_ocupacion_diaria AS
SELECT c.fecha, c.anio, c.mes, c.nombre_mes, c.anio_mes, c.nombre_dia, c.es_fin_de_semana, c.temporada,
       t.nombre AS tipo_habitacion,
       (SELECT count(*) FROM habitaciones h0 WHERE h0.tipo_habitacion_id = t.id AND h0.estado = 'Operativa') AS habitaciones_disponibles,
       count(r.id) AS habitaciones_ocupadas,
       coalesce(round(sum(r.total / nullif(r.noches, 0)), 2), 0) AS ingreso_habitaciones
FROM calendario c
CROSS JOIN tipos_habitacion t
LEFT JOIN habitaciones h ON h.tipo_habitacion_id = t.id
LEFT JOIN reservas r ON r.habitacion_id = h.id AND r.estado IN ('Confirmada','CheckIn','CheckOut')
                     AND c.fecha >= r.fecha_entrada AND c.fecha < r.fecha_salida
WHERE c.fecha BETWEEN '2025-01-01' AND current_date + interval '6 months'
GROUP BY c.fecha, c.anio, c.mes, c.nombre_mes, c.anio_mes, c.nombre_dia, c.es_fin_de_semana, c.temporada, t.id, t.nombre;

CREATE VIEW vw_pagos_powerbi AS
SELECT p.id AS pago_id, p.fecha_pago, p.fecha_pago::date AS fecha_pago_dia, p.metodo, p.moneda, p.monto, p.tipo_cambio,
       p.monto_soles, p.estado AS estado_pago, r.codigo AS codigo_reserva, t.nombre AS tipo_habitacion
FROM pagos p JOIN reservas r ON r.id = p.reserva_id JOIN habitaciones h ON h.id = r.habitacion_id
JOIN tipos_habitacion t ON t.id = h.tipo_habitacion_id;

CREATE VIEW vw_reclamaciones_powerbi AS
SELECT numero, fecha, fecha::date AS fecha_dia, tipo, bien_tipo, monto_reclamado, estado, fecha_limite_respuesta, fecha_respuesta,
       CASE WHEN fecha_respuesta IS NOT NULL THEN fecha_respuesta::date - fecha::date END AS dias_en_responder,
       CASE WHEN estado = 'Pendiente' AND fecha_limite_respuesta < current_date THEN 1
            WHEN estado = 'Respondido' AND fecha_respuesta::date > fecha_limite_respuesta THEN 1 ELSE 0 END AS fuera_de_plazo
FROM reclamaciones;

SELECT t.nombre, count(h.id) AS habitaciones, t.precio_noche
FROM tipos_habitacion t JOIN habitaciones h ON h.tipo_habitacion_id = t.id GROUP BY t.nombre, t.precio_noche ORDER BY t.precio_noche;
