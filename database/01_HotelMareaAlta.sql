/* =====================================================================
   HOTEL MAREA ALTA · PARACAS — Base de datos (Microsoft SQL Server)
   ---------------------------------------------------------------------
   Ejecutar completo en SQL Server Management Studio (SSMS) o en
   Azure Data Studio / extensión "SQL Server (mssql)" de VS Code.
   Requiere SQL Server 2016 o superior (incluye Express y LocalDB).

   Crea: tablas, restricciones, datos iniciales (tipos, 24 habitaciones y
   usuarios del panel), tabla Calendario y vistas para Power BI.

   Usuarios iniciales del panel (deben cambiar la contraseña al ingresar):
     admin@mareaalta.pe       / Admin2026!       (Administrador)
     recepcion@mareaalta.pe   / Recepcion2026!   (Recepcionista)
   El script se puede volver a ejecutar: borra y recrea los objetos.
   ¡OJO! Volver a ejecutarlo BORRA las reservas existentes.
   ===================================================================== */

IF DB_ID(N'HotelMareaAlta') IS NULL
    CREATE DATABASE HotelMareaAlta COLLATE Modern_Spanish_CI_AS;
GO

USE HotelMareaAlta;
GO

/* ---------- Limpieza (orden inverso a las dependencias) ---------- */
DROP VIEW  IF EXISTS dbo.vw_ReclamacionesPowerBI;
DROP VIEW  IF EXISTS dbo.vw_PagosPowerBI;
DROP VIEW  IF EXISTS dbo.vw_OcupacionDiaria;
DROP VIEW  IF EXISTS dbo.vw_ReservasPowerBI;
DROP TABLE IF EXISTS dbo.Pagos;
DROP TABLE IF EXISTS dbo.Reservas;
DROP TABLE IF EXISTS dbo.Habitaciones;
DROP TABLE IF EXISTS dbo.TiposHabitacion;
DROP TABLE IF EXISTS dbo.Clientes;
DROP TABLE IF EXISTS dbo.Reclamaciones;
DROP TABLE IF EXISTS dbo.Suscriptores;
DROP TABLE IF EXISTS dbo.Calendario;
DROP TABLE IF EXISTS dbo.Usuarios;
GO

/* =====================================================================
   1. TABLAS
   ===================================================================== */

CREATE TABLE dbo.TiposHabitacion (
    Id               INT IDENTITY(1,1) CONSTRAINT PK_TiposHabitacion PRIMARY KEY,
    Codigo           NVARCHAR(20)  NOT NULL CONSTRAINT UQ_TiposHabitacion_Codigo UNIQUE,
    Nombre           NVARCHAR(60)  NOT NULL,
    Descripcion      NVARCHAR(300) NULL,
    Capacidad        INT           NOT NULL CONSTRAINT CK_TiposHabitacion_Capacidad CHECK (Capacidad BETWEEN 1 AND 8),
    MetrosCuadrados  INT           NOT NULL,
    PrecioNoche      DECIMAL(10,2) NOT NULL CONSTRAINT CK_TiposHabitacion_Precio CHECK (PrecioNoche > 0), -- soles, IGV incluido
    Activo           BIT           NOT NULL CONSTRAINT DF_TiposHabitacion_Activo DEFAULT (1)
);

CREATE TABLE dbo.Habitaciones (
    Id                INT IDENTITY(1,1) CONSTRAINT PK_Habitaciones PRIMARY KEY,
    Numero            NVARCHAR(10) NOT NULL CONSTRAINT UQ_Habitaciones_Numero UNIQUE,
    Piso              INT          NOT NULL,
    TipoHabitacionId  INT          NOT NULL CONSTRAINT FK_Habitaciones_Tipos REFERENCES dbo.TiposHabitacion(Id),
    Estado            NVARCHAR(20) NOT NULL CONSTRAINT DF_Habitaciones_Estado DEFAULT (N'Operativa')
                      CONSTRAINT CK_Habitaciones_Estado CHECK (Estado IN (N'Operativa', N'Mantenimiento', N'FueraDeServicio')),
    EstadoLimpieza    NVARCHAR(10) NOT NULL CONSTRAINT DF_Habitaciones_Limpieza DEFAULT (N'Limpia')
                      CONSTRAINT CK_Habitaciones_Limpieza CHECK (EstadoLimpieza IN (N'Limpia', N'Sucia')),
    Notas             NVARCHAR(300) NULL
);

CREATE TABLE dbo.Clientes (
    Id                INT IDENTITY(1,1) CONSTRAINT PK_Clientes PRIMARY KEY,
    Nombres           NVARCHAR(80)  NOT NULL,
    Apellidos         NVARCHAR(80)  NOT NULL,
    TipoDocumento     NVARCHAR(3)   NOT NULL CONSTRAINT CK_Clientes_TipoDoc CHECK (TipoDocumento IN (N'DNI', N'CE', N'PAS')),
    NumeroDocumento   NVARCHAR(12)  NOT NULL,
    Email             NVARCHAR(150) NOT NULL,
    CodigoPais        NVARCHAR(4)   NOT NULL CONSTRAINT DF_Clientes_CodigoPais DEFAULT (N'51'),
    Telefono          NVARCHAR(15)  NOT NULL,
    Residencia        NVARCHAR(3)   NOT NULL CONSTRAINT CK_Clientes_Residencia CHECK (Residencia IN (N'PE', N'EXT')),
    AceptaPublicidad  BIT           NOT NULL CONSTRAINT DF_Clientes_Publicidad DEFAULT (0),
    Notas             NVARCHAR(500) NULL,
    FechaRegistro     DATETIME2(0)  NOT NULL CONSTRAINT DF_Clientes_FechaRegistro DEFAULT (SYSDATETIME()),
    CONSTRAINT UQ_Clientes_Documento UNIQUE (TipoDocumento, NumeroDocumento)
);
CREATE INDEX IX_Clientes_Email ON dbo.Clientes (Email);

CREATE TABLE dbo.Reservas (
    Id                INT IDENTITY(1,1) CONSTRAINT PK_Reservas PRIMARY KEY,
    Codigo            NVARCHAR(20)  NOT NULL CONSTRAINT UQ_Reservas_Codigo UNIQUE,
    ClienteId         INT           NOT NULL CONSTRAINT FK_Reservas_Clientes REFERENCES dbo.Clientes(Id),
    HabitacionId      INT           NOT NULL CONSTRAINT FK_Reservas_Habitaciones REFERENCES dbo.Habitaciones(Id),
    FechaEntrada      DATE          NOT NULL,
    FechaSalida       DATE          NOT NULL,
    Noches            INT           NOT NULL,
    Huespedes         INT           NOT NULL CONSTRAINT CK_Reservas_Huespedes CHECK (Huespedes BETWEEN 1 AND 8),
    HoraLlegada       NVARCHAR(30)  NULL,
    Notas             NVARCHAR(500) NULL,
    ExoneradoIgv      BIT           NOT NULL CONSTRAINT DF_Reservas_Exonerado DEFAULT (0),
    Subtotal          DECIMAL(10,2) NOT NULL,   -- valor de venta (sin IGV)
    Igv               DECIMAL(10,2) NOT NULL,   -- 18 % o 0 si exonerado
    Total             DECIMAL(10,2) NOT NULL,
    Estado            NVARCHAR(20)  NOT NULL CONSTRAINT DF_Reservas_Estado DEFAULT (N'Confirmada')
                      CONSTRAINT CK_Reservas_Estado CHECK (Estado IN (N'Confirmada', N'CheckIn', N'CheckOut', N'Cancelada', N'NoShow')),
    Canal             NVARCHAR(20)  NOT NULL CONSTRAINT DF_Reservas_Canal DEFAULT (N'Web')
                      CONSTRAINT CK_Reservas_Canal CHECK (Canal IN (N'Web', N'WhatsApp', N'Telefono', N'Recepcion')),
    FechaReserva      DATETIME2(0)  NOT NULL CONSTRAINT DF_Reservas_FechaReserva DEFAULT (SYSDATETIME()),
    FechaCancelacion  DATETIME2(0)  NULL,
    FechaCheckIn      DATETIME2(0)  NULL,
    FechaCheckOut     DATETIME2(0)  NULL,
    RegistradoPor     NVARCHAR(100) NULL,      -- usuario del panel (NULL = web)
    CONSTRAINT CK_Reservas_Fechas  CHECK (FechaSalida > FechaEntrada),
    CONSTRAINT CK_Reservas_Noches  CHECK (Noches = DATEDIFF(DAY, FechaEntrada, FechaSalida)),
    CONSTRAINT CK_Reservas_Montos  CHECK (Subtotal >= 0 AND Igv >= 0 AND Total = Subtotal + Igv)
);
-- Búsqueda rápida de cruces de fechas por habitación
CREATE INDEX IX_Reservas_Habitacion_Fechas ON dbo.Reservas (HabitacionId, FechaEntrada, FechaSalida) INCLUDE (Estado);
CREATE INDEX IX_Reservas_FechaEntrada ON dbo.Reservas (FechaEntrada) INCLUDE (Estado, Total, Noches);
CREATE INDEX IX_Reservas_Cliente ON dbo.Reservas (ClienteId);
CREATE INDEX IX_Reservas_Estado ON dbo.Reservas (Estado, FechaSalida);

CREATE TABLE dbo.Pagos (
    Id           INT IDENTITY(1,1) CONSTRAINT PK_Pagos PRIMARY KEY,
    ReservaId    INT           NOT NULL CONSTRAINT FK_Pagos_Reservas REFERENCES dbo.Reservas(Id),
    Monto        DECIMAL(10,2) NOT NULL CONSTRAINT CK_Pagos_Monto CHECK (Monto > 0),
    Moneda       NVARCHAR(3)   NOT NULL CONSTRAINT DF_Pagos_Moneda DEFAULT (N'PEN') CONSTRAINT CK_Pagos_Moneda CHECK (Moneda IN (N'PEN', N'USD')),
    TipoCambio   DECIMAL(6,3)  NULL,
    MontoSoles   DECIMAL(10,2) NOT NULL,
    Metodo       NVARCHAR(20)  NOT NULL CONSTRAINT CK_Pagos_Metodo CHECK (Metodo IN (N'Tarjeta', N'Yape', N'Plin', N'Transferencia', N'Efectivo')),
    Referencia   NVARCHAR(60)  NULL,
    Estado       NVARCHAR(20)  NOT NULL CONSTRAINT DF_Pagos_Estado DEFAULT (N'Aprobado')
                 CONSTRAINT CK_Pagos_Estado CHECK (Estado IN (N'Aprobado', N'Anulado')),
    FechaPago    DATETIME2(0)  NOT NULL CONSTRAINT DF_Pagos_Fecha DEFAULT (SYSDATETIME()),
    RegistradoPor    NVARCHAR(100) NULL,
    MotivoAnulacion  NVARCHAR(200) NULL,
    CONSTRAINT CK_Pagos_TipoCambio CHECK (Moneda = N'PEN' OR TipoCambio IS NOT NULL)
);
CREATE INDEX IX_Pagos_Reserva ON dbo.Pagos (ReservaId);
CREATE INDEX IX_Pagos_Fecha ON dbo.Pagos (FechaPago) INCLUDE (Estado, MontoSoles, Metodo);

CREATE TABLE dbo.Reclamaciones (
    Id                    INT IDENTITY(1,1) CONSTRAINT PK_Reclamaciones PRIMARY KEY,
    Numero                NVARCHAR(12)   NOT NULL CONSTRAINT UQ_Reclamaciones_Numero UNIQUE,  -- 00001-2026
    Anio                  INT            NOT NULL,
    Correlativo           INT            NOT NULL,
    Fecha                 DATETIME2(0)   NOT NULL,
    Tipo                  NVARCHAR(10)   NOT NULL CONSTRAINT CK_Reclamaciones_Tipo CHECK (Tipo IN (N'Reclamo', N'Queja')),
    NombreCompleto        NVARCHAR(160)  NOT NULL,
    TipoDocumento         NVARCHAR(3)    NOT NULL,
    NumeroDocumento       NVARCHAR(12)   NOT NULL,
    Domicilio             NVARCHAR(200)  NOT NULL,
    Telefono              NVARCHAR(20)   NOT NULL,
    Email                 NVARCHAR(150)  NOT NULL,
    EsMenor               BIT            NOT NULL CONSTRAINT DF_Reclamaciones_EsMenor DEFAULT (0),
    Apoderado             NVARCHAR(160)  NULL,
    BienTipo              NVARCHAR(10)   NOT NULL CONSTRAINT CK_Reclamaciones_Bien CHECK (BienTipo IN (N'Producto', N'Servicio')),
    MontoReclamado        DECIMAL(10,2)  NULL,
    CodigoReserva         NVARCHAR(20)   NULL,
    DescripcionBien       NVARCHAR(300)  NOT NULL,
    Detalle               NVARCHAR(2000) NOT NULL,
    Pedido                NVARCHAR(1000) NOT NULL,
    Estado                NVARCHAR(12)   NOT NULL CONSTRAINT DF_Reclamaciones_Estado DEFAULT (N'Pendiente')
                          CONSTRAINT CK_Reclamaciones_Estado CHECK (Estado IN (N'Pendiente', N'Respondido')),
    FechaLimiteRespuesta  DATE           NOT NULL,
    Respuesta             NVARCHAR(2000) NULL,
    FechaRespuesta        DATETIME2(0)   NULL,
    CONSTRAINT UQ_Reclamaciones_Correlativo UNIQUE (Anio, Correlativo)
);

CREATE TABLE dbo.Suscriptores (
    Id             INT IDENTITY(1,1) CONSTRAINT PK_Suscriptores PRIMARY KEY,
    Email          NVARCHAR(150) NOT NULL CONSTRAINT UQ_Suscriptores_Email UNIQUE,
    FechaRegistro  DATETIME2(0)  NOT NULL CONSTRAINT DF_Suscriptores_Fecha DEFAULT (SYSDATETIME()),
    Activo         BIT           NOT NULL CONSTRAINT DF_Suscriptores_Activo DEFAULT (1)
);

/* Usuarios del panel de gestión (contraseñas con PBKDF2-SHA256) */
CREATE TABLE dbo.Usuarios (
    Id                INT IDENTITY(1,1) CONSTRAINT PK_Usuarios PRIMARY KEY,
    Nombre            NVARCHAR(100) NOT NULL,
    Email             NVARCHAR(150) NOT NULL CONSTRAINT UQ_Usuarios_Email UNIQUE,
    Rol               NVARCHAR(20)  NOT NULL CONSTRAINT CK_Usuarios_Rol CHECK (Rol IN (N'Administrador', N'Recepcionista')),
    ClaveHash         NVARCHAR(200) NOT NULL,
    Activo            BIT           NOT NULL CONSTRAINT DF_Usuarios_Activo DEFAULT (1),
    DebeCambiarClave  BIT           NOT NULL CONSTRAINT DF_Usuarios_Cambiar DEFAULT (1),
    IntentosFallidos  INT           NOT NULL CONSTRAINT DF_Usuarios_Intentos DEFAULT (0),
    BloqueadoHasta    DATETIME2(0)  NULL,
    UltimoAcceso      DATETIME2(0)  NULL,
    FechaCreacion     DATETIME2(0)  NOT NULL CONSTRAINT DF_Usuarios_Fecha DEFAULT (SYSDATETIME())
);

/* Tabla de fechas para Power BI (ocupación diaria y filtros por mes/temporada) */
CREATE TABLE dbo.Calendario (
    Fecha          DATE         NOT NULL CONSTRAINT PK_Calendario PRIMARY KEY,
    Anio           INT          NOT NULL,
    Mes            INT          NOT NULL,
    NombreMes      NVARCHAR(12) NOT NULL,
    AnioMes        NVARCHAR(7)  NOT NULL,   -- 2026-10
    Trimestre      INT          NOT NULL,
    DiaSemana      INT          NOT NULL,   -- 1 = lunes ... 7 = domingo
    NombreDia      NVARCHAR(10) NOT NULL,
    EsFinDeSemana  BIT          NOT NULL,
    Temporada      NVARCHAR(30) NOT NULL
);
GO

/* =====================================================================
   2. DATOS INICIALES
   ===================================================================== */

INSERT INTO dbo.TiposHabitacion (Codigo, Nombre, Descripcion, Capacidad, MetrosCuadrados, PrecioNoche) VALUES
(N'duna',      N'Habitación Duna',      N'Planta baja con terraza privada hacia el jardín de buganvillas. Cama queen.',            2, 28,  450.00),
(N'horizonte', N'Habitación Horizonte', N'Segundo piso con balcón frente a la bahía y ventanal de piso a techo. Cama king.',      3, 34,  650.00),
(N'pleamar',   N'Suite Pleamar',        N'Suite principal con terraza, tina exterior, sala independiente y vista a la bahía.',   4, 58, 1090.00);

-- 24 habitaciones: 10 Duna (piso 1), 10 Horizonte (piso 2), 4 Suites Pleamar (piso 3)
;WITH n AS (SELECT TOP (10) ROW_NUMBER() OVER (ORDER BY (SELECT NULL)) AS i FROM sys.all_objects)
INSERT INTO dbo.Habitaciones (Numero, Piso, TipoHabitacionId)
SELECT CONCAT(t.Piso, RIGHT(CONCAT('0', n.i), 2)), t.Piso, t.Id
FROM n
CROSS APPLY (SELECT Id, CASE Codigo WHEN N'duna' THEN 1 WHEN N'horizonte' THEN 2 ELSE 3 END AS Piso,
                    CASE Codigo WHEN N'pleamar' THEN 4 ELSE 10 END AS Cantidad
             FROM dbo.TiposHabitacion) t
WHERE n.i <= t.Cantidad;

-- Usuarios iniciales: cambian la contraseña en su primer ingreso
INSERT INTO dbo.Usuarios (Nombre, Email, Rol, ClaveHash, DebeCambiarClave) VALUES
(N'Administrador', N'admin@mareaalta.pe',     N'Administrador', N'PBKDF2-SHA256$100000$yqPiouVbz+TnnRzEpj1b0Q==$n288Xx2NaXWRNgQoXVciaXwF/g64Q/EdHa+BxFRh/hc=', 1),
(N'Recepción',     N'recepcion@mareaalta.pe', N'Recepcionista', N'PBKDF2-SHA256$100000$C1Ko2Dg4peLgjhDf5FPoEw==$AwjUDgJS7KpaLhhvfeEWLVPg/CRGb5fAB8Wn9JW8nNw=', 1);

-- Calendario 2024–2028
;WITH n AS (
    SELECT TOP (DATEDIFF(DAY, '20240101', '20281231') + 1)
           ROW_NUMBER() OVER (ORDER BY (SELECT NULL)) - 1 AS i
    FROM sys.all_objects a CROSS JOIN sys.all_objects b
)
INSERT INTO dbo.Calendario (Fecha, Anio, Mes, NombreMes, AnioMes, Trimestre, DiaSemana, NombreDia, EsFinDeSemana, Temporada)
SELECT d.Fecha,
       YEAR(d.Fecha),
       MONTH(d.Fecha),
       CHOOSE(MONTH(d.Fecha), N'Enero', N'Febrero', N'Marzo', N'Abril', N'Mayo', N'Junio', N'Julio',
                              N'Agosto', N'Septiembre', N'Octubre', N'Noviembre', N'Diciembre'),
       CONVERT(NVARCHAR(7), d.Fecha, 126),
       DATEPART(QUARTER, d.Fecha),
       w.DiaSemana,
       CHOOSE(w.DiaSemana, N'Lunes', N'Martes', N'Miércoles', N'Jueves', N'Viernes', N'Sábado', N'Domingo'),
       CASE WHEN w.DiaSemana IN (6, 7) THEN 1 ELSE 0 END,
       CASE
           WHEN MONTH(d.Fecha) IN (1, 2, 3) OR (MONTH(d.Fecha) = 12 AND DAY(d.Fecha) >= 15) THEN N'Alta (verano)'
           WHEN MONTH(d.Fecha) = 7 AND DAY(d.Fecha) >= 25 THEN N'Alta (Fiestas Patrias)'
           ELSE N'Regular'
       END
FROM n
CROSS APPLY (SELECT DATEADD(DAY, n.i, CAST('20240101' AS DATE)) AS Fecha) d
-- 1900-01-01 fue lunes: cálculo independiente de SET DATEFIRST
CROSS APPLY (SELECT (DATEDIFF(DAY, '19000101', d.Fecha) % 7) + 1 AS DiaSemana) w;
GO

/* =====================================================================
   3. VISTAS PARA POWER BI
   ===================================================================== */

-- Una fila por reserva, con datos del cliente, habitación y pagos
CREATE VIEW dbo.vw_ReservasPowerBI AS
SELECT
    r.Id                                         AS ReservaId,
    r.Codigo,
    r.FechaReserva,
    CAST(r.FechaReserva AS DATE)                 AS FechaReservaDia,
    r.FechaEntrada,
    r.FechaSalida,
    r.Noches,
    r.Huespedes,
    DATEDIFF(DAY, CAST(r.FechaReserva AS DATE), r.FechaEntrada) AS DiasAnticipacion,
    r.Estado                                     AS EstadoReserva,
    CASE WHEN r.Estado IN (N'Cancelada', N'NoShow') THEN 0 ELSE 1 END AS EsEfectiva,
    r.Canal,
    CASE c.Residencia WHEN N'EXT' THEN N'Extranjero' ELSE N'Residente' END AS Residencia,
    r.ExoneradoIgv,
    r.Subtotal,
    r.Igv,
    r.Total,
    CAST(r.Total / NULLIF(r.Noches, 0) AS DECIMAL(10,2)) AS TarifaPromedioNoche,
    ISNULL(p.Pagado, 0)                          AS Pagado,
    r.Total - ISNULL(p.Pagado, 0)                AS Saldo,
    c.Id                                         AS ClienteId,
    CONCAT(c.Nombres, N' ', c.Apellidos)         AS Cliente,
    c.TipoDocumento,
    c.CodigoPais,
    h.Numero                                     AS Habitacion,
    h.Piso,
    t.Nombre                                     AS TipoHabitacion,
    t.PrecioNoche                                AS TarifaLista
FROM dbo.Reservas r
JOIN dbo.Clientes c         ON c.Id = r.ClienteId
JOIN dbo.Habitaciones h     ON h.Id = r.HabitacionId
JOIN dbo.TiposHabitacion t  ON t.Id = h.TipoHabitacionId
LEFT JOIN (
    SELECT ReservaId, SUM(MontoSoles) AS Pagado
    FROM dbo.Pagos WHERE Estado = N'Aprobado'
    GROUP BY ReservaId
) p ON p.ReservaId = r.Id;
GO

-- Una fila por día y tipo de habitación: base para Ocupación %, ADR y RevPAR
CREATE VIEW dbo.vw_OcupacionDiaria AS
SELECT
    c.Fecha,
    c.Anio,
    c.Mes,
    c.NombreMes,
    c.AnioMes,
    c.NombreDia,
    c.EsFinDeSemana,
    c.Temporada,
    t.Nombre                                     AS TipoHabitacion,
    inv.Habitaciones                             AS HabitacionesDisponibles,
    COUNT(r.Id)                                  AS HabitacionesOcupadas,
    CAST(ISNULL(SUM(r.Total / NULLIF(r.Noches, 0)), 0) AS DECIMAL(12,2)) AS IngresoHabitaciones
FROM dbo.Calendario c
CROSS JOIN dbo.TiposHabitacion t
CROSS APPLY (SELECT COUNT(*) AS Habitaciones FROM dbo.Habitaciones h0
             WHERE h0.TipoHabitacionId = t.Id AND h0.Estado = N'Operativa') inv
LEFT JOIN dbo.Habitaciones h ON h.TipoHabitacionId = t.Id
LEFT JOIN dbo.Reservas r
       ON r.HabitacionId = h.Id
      AND r.Estado IN (N'Confirmada', N'CheckIn', N'CheckOut')
      AND c.Fecha >= r.FechaEntrada
      AND c.Fecha <  r.FechaSalida
WHERE c.Fecha >= '20250101'
  AND c.Fecha <= DATEADD(MONTH, 6, CAST(SYSDATETIME() AS DATE))
GROUP BY c.Fecha, c.Anio, c.Mes, c.NombreMes, c.AnioMes, c.NombreDia, c.EsFinDeSemana, c.Temporada,
         t.Nombre, inv.Habitaciones;
GO

CREATE VIEW dbo.vw_PagosPowerBI AS
SELECT
    p.Id            AS PagoId,
    p.FechaPago,
    CAST(p.FechaPago AS DATE) AS FechaPagoDia,
    p.Metodo,
    p.Moneda,
    p.Monto,
    p.TipoCambio,
    p.MontoSoles,
    p.Estado        AS EstadoPago,
    r.Codigo        AS CodigoReserva,
    t.Nombre        AS TipoHabitacion
FROM dbo.Pagos p
JOIN dbo.Reservas r        ON r.Id = p.ReservaId
JOIN dbo.Habitaciones h    ON h.Id = r.HabitacionId
JOIN dbo.TiposHabitacion t ON t.Id = h.TipoHabitacionId;
GO

CREATE VIEW dbo.vw_ReclamacionesPowerBI AS
SELECT
    Numero,
    Fecha,
    CAST(Fecha AS DATE) AS FechaDia,
    Tipo,
    BienTipo,
    MontoReclamado,
    Estado,
    FechaLimiteRespuesta,
    FechaRespuesta,
    CASE WHEN FechaRespuesta IS NOT NULL
         THEN DATEDIFF(DAY, CAST(Fecha AS DATE), CAST(FechaRespuesta AS DATE)) END AS DiasEnResponder,
    CASE WHEN Estado = N'Pendiente' AND FechaLimiteRespuesta < CAST(SYSDATETIME() AS DATE) THEN 1
         WHEN Estado = N'Respondido' AND CAST(FechaRespuesta AS DATE) > FechaLimiteRespuesta THEN 1
         ELSE 0 END AS FueraDePlazo
FROM dbo.Reclamaciones;
GO

/* ---------- Verificación ---------- */
SELECT t.Nombre, COUNT(h.Id) AS Habitaciones, t.PrecioNoche
FROM dbo.TiposHabitacion t JOIN dbo.Habitaciones h ON h.TipoHabitacionId = t.Id
GROUP BY t.Nombre, t.PrecioNoche ORDER BY t.PrecioNoche;
