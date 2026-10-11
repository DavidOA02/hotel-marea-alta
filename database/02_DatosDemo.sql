/* =====================================================================
   HOTEL MAREA ALTA — DATOS DE DEMOSTRACIÓN (opcional)
   ---------------------------------------------------------------------
   Genera ~15 meses de actividad ficticia (12 meses atrás y 3 hacia
   adelante) para practicar con el panel de administración y Power BI:
   clientes, reservas sin cruces de fechas, pagos y reclamaciones.

   Ejecutar DESPUÉS de 01_HotelMareaAlta.sql. NO usar en producción.
   ===================================================================== */
USE HotelMareaAlta;
GO
SET NOCOUNT ON;

IF EXISTS (SELECT 1 FROM dbo.Reservas)
BEGIN
    RAISERROR(N'La tabla Reservas ya tiene datos. Ejecuta primero 01_HotelMareaAlta.sql para empezar limpio.', 16, 1);
    RETURN;
END;

/* ---------- 1. Clientes ficticios ---------- */
DECLARE @Nombres TABLE (i INT IDENTITY(1,1), Valor NVARCHAR(40));
INSERT INTO @Nombres (Valor) VALUES
 (N'Lucia'),(N'Mateo'),(N'Valeria'),(N'Diego'),(N'Camila'),(N'Andres'),(N'Sofia'),(N'Jorge'),(N'Daniela'),(N'Carlos'),
 (N'Fernanda'),(N'Renato'),(N'Ximena'),(N'Gonzalo'),(N'Mariana'),(N'Rodrigo'),(N'Alessandra'),(N'Piero'),(N'Claudia'),(N'Sebastian');
DECLARE @Apellidos TABLE (i INT IDENTITY(1,1), Valor NVARCHAR(40));
INSERT INTO @Apellidos (Valor) VALUES
 (N'Quispe'),(N'Flores'),(N'Rojas'),(N'Garcia'),(N'Huaman'),(N'Torres'),(N'Mendoza'),(N'Vargas'),(N'Castillo'),(N'Ramos'),
 (N'Chavez'),(N'Salazar'),(N'Paredes'),(N'Gutierrez'),(N'Smith'),(N'Muller'),(N'Rossi'),(N'Silva'),(N'Fernandez'),(N'Lopez');

DECLARE @k INT = 1, @nom NVARCHAR(40), @ape NVARCHAR(40), @ext BIT, @pais NVARCHAR(4);
WHILE @k <= 150
BEGIN
    SET @nom = (SELECT Valor FROM @Nombres   WHERE i = 1 + ABS(CHECKSUM(NEWID())) % 20);
    SET @ape = (SELECT Valor FROM @Apellidos WHERE i = 1 + ABS(CHECKSUM(NEWID())) % 20);
    SET @ext = CASE WHEN ABS(CHECKSUM(NEWID())) % 100 < 22 THEN 1 ELSE 0 END;   -- ~22 % extranjeros
    SET @pais = CASE WHEN @ext = 0 THEN N'51' ELSE CHOOSE(1 + ABS(CHECKSUM(NEWID())) % 5, N'1', N'56', N'54', N'34', N'49') END;

    INSERT INTO dbo.Clientes (Nombres, Apellidos, TipoDocumento, NumeroDocumento, Email, CodigoPais, Telefono, Residencia, AceptaPublicidad, FechaRegistro)
    VALUES (@nom, @ape,
            CASE WHEN @ext = 1 THEN N'PAS' ELSE N'DNI' END,
            CASE WHEN @ext = 1 THEN CONCAT(N'PA', RIGHT(CONCAT(N'000000', @k), 7)) ELSE CAST(40000000 + @k * 37 AS NVARCHAR(12)) END,
            LOWER(CONCAT(@nom, N'.', @ape, @k, N'@correo.com')),
            @pais,
            CASE WHEN @ext = 0 THEN CONCAT(N'9', RIGHT(CONCAT(N'00000000', 10000000 + @k * 4513), 8)) ELSE CONCAT(N'555', RIGHT(CONCAT(N'0000000', @k * 911), 7)) END,
            CASE WHEN @ext = 1 THEN N'EXT' ELSE N'PE' END,
            CASE WHEN ABS(CHECKSUM(NEWID())) % 100 < 40 THEN 1 ELSE 0 END,
            DATEADD(DAY, -ABS(CHECKSUM(NEWID())) % 400, SYSDATETIME()));
    SET @k += 1;
END;

/* ---------- 2. Reservas (sin cruces por habitación) ---------- */
DECLARE @hoy DATE = CAST(SYSDATETIME() AS DATE);
DECLARE @inicio DATE = DATEADD(MONTH, -12, @hoy), @fin DATE = DATEADD(MONTH, 3, @hoy);
DECLARE @HabId INT, @Precio DECIMAL(10,2), @Cap INT;
DECLARE @d DATE, @entrada DATE, @salida DATE, @noches INT, @gap INT, @mes INT, @r INT;
DECLARE @cli INT, @resid NVARCHAR(3), @exon BIT, @bruto DECIMAL(10,2), @sub DECIMAL(10,2), @igv DECIMAL(10,2), @total DECIMAL(10,2);
DECLARE @estado NVARCHAR(20), @canal NVARCHAR(20), @fres DATETIME2(0), @rid INT, @metodo NVARCHAR(20);

DECLARE cHab CURSOR LOCAL FAST_FORWARD FOR
    SELECT h.Id, t.PrecioNoche, t.Capacidad
    FROM dbo.Habitaciones h JOIN dbo.TiposHabitacion t ON t.Id = h.TipoHabitacionId;
OPEN cHab;
FETCH NEXT FROM cHab INTO @HabId, @Precio, @Cap;

WHILE @@FETCH_STATUS = 0
BEGIN
    SET @d = DATEADD(DAY, ABS(CHECKSUM(NEWID())) % 5, @inicio);
    WHILE @d < @fin
    BEGIN
        SET @mes = MONTH(@d);
        -- Temporada alta (verano y Fiestas Patrias): menos días libres entre huéspedes
        SET @gap = CASE WHEN @mes IN (1, 2, 3, 12) OR (@mes = 7 AND DAY(@d) >= 20) THEN ABS(CHECKSUM(NEWID())) % 2
                        WHEN DATEDIFF(DAY, '19000101', @d) % 7 >= 4 THEN ABS(CHECKSUM(NEWID())) % 3      -- viernes a domingo
                        ELSE ABS(CHECKSUM(NEWID())) % 6 END;
        SET @entrada = DATEADD(DAY, @gap, @d);
        IF @entrada >= @fin BREAK;
        SET @noches = 1 + ABS(CHECKSUM(NEWID())) % 4;
        SET @salida = DATEADD(DAY, @noches, @entrada);

        SELECT TOP (1) @cli = Id, @resid = Residencia FROM dbo.Clientes ORDER BY NEWID();
        SET @exon  = CASE WHEN @resid = N'EXT' THEN 1 ELSE 0 END;
        SET @bruto = @Precio * @noches;
        SET @sub   = ROUND(@bruto / 1.18, 2);
        SET @igv   = CASE WHEN @exon = 1 THEN 0 ELSE @bruto - @sub END;
        SET @total = @sub + @igv;

        SET @fres = DATEADD(MINUTE, ABS(CHECKSUM(NEWID())) % 1440,
                    CAST(DATEADD(DAY, -(1 + ABS(CHECKSUM(NEWID())) % 45), @entrada) AS DATETIME2(0)));
        IF @fres > SYSDATETIME() SET @fres = DATEADD(HOUR, -(1 + ABS(CHECKSUM(NEWID())) % 72), SYSDATETIME());

        SET @r = ABS(CHECKSUM(NEWID())) % 100;
        SET @estado = CASE
            WHEN @salida <= @hoy  THEN CASE WHEN @r < 6 THEN N'Cancelada' WHEN @r < 9 THEN N'NoShow' ELSE N'CheckOut' END
            WHEN @entrada <= @hoy THEN N'CheckIn'
            ELSE CASE WHEN @r < 8 THEN N'Cancelada' ELSE N'Confirmada' END END;
        SET @canal = CHOOSE(1 + ABS(CHECKSUM(NEWID())) % 10, N'Web', N'Web', N'Web', N'Web', N'Web', N'Web', N'WhatsApp', N'WhatsApp', N'WhatsApp', N'Telefono');

        INSERT INTO dbo.Reservas (Codigo, ClienteId, HabitacionId, FechaEntrada, FechaSalida, Noches, Huespedes,
                                  ExoneradoIgv, Subtotal, Igv, Total, Estado, Canal, FechaReserva, FechaCancelacion,
                                  FechaCheckIn, FechaCheckOut, RegistradoPor)
        VALUES (CONCAT(N'TMP', LEFT(REPLACE(CONVERT(NVARCHAR(36), NEWID()), N'-', N''), 14)),
                @cli, @HabId, @entrada, @salida, @noches, 1 + ABS(CHECKSUM(NEWID())) % @Cap,
                @exon, @sub, @igv, @total, @estado, @canal, @fres,
                CASE WHEN @estado = N'Cancelada' THEN DATEADD(DAY, 1, @fres) END,
                CASE WHEN @estado IN (N'CheckIn', N'CheckOut') THEN DATEADD(HOUR, 15, CAST(@entrada AS DATETIME2(0))) END,
                CASE WHEN @estado = N'CheckOut' THEN DATEADD(HOUR, 11, CAST(@salida AS DATETIME2(0))) END,
                CASE WHEN @canal = N'Web' THEN NULL ELSE N'Recepción' END);
        SET @rid = SCOPE_IDENTITY();

        -- Pagos: estadías realizadas pagadas al 100 %; en curso, 50 %
        IF @estado IN (N'CheckOut', N'CheckIn')
        BEGIN
            SET @metodo = CHOOSE(1 + ABS(CHECKSUM(NEWID())) % 6, N'Tarjeta', N'Tarjeta', N'Yape', N'Plin', N'Transferencia', N'Efectivo');
            INSERT INTO dbo.Pagos (ReservaId, Monto, Moneda, MontoSoles, Metodo, Estado, FechaPago, RegistradoPor)
            VALUES (@rid,
                    CASE WHEN @estado = N'CheckIn' THEN ROUND(@total / 2, 2) ELSE @total END, N'PEN',
                    CASE WHEN @estado = N'CheckIn' THEN ROUND(@total / 2, 2) ELSE @total END,
                    @metodo, N'Aprobado', DATEADD(HOUR, 15, CAST(@entrada AS DATETIME2(0))), N'Recepción');
        END;

        SET @d = @salida;
    END;
    FETCH NEXT FROM cHab INTO @HabId, @Precio, @Cap;
END;
CLOSE cHab;
DEALLOCATE cHab;

-- Código público definitivo: MA + año (2 dígitos) + Id
UPDATE dbo.Reservas
SET Codigo = CONCAT(N'MA', RIGHT(CAST(YEAR(FechaReserva) AS NVARCHAR(4)), 2), RIGHT(CONCAT(N'00000', Id), 5))
WHERE Codigo LIKE N'TMP%';

/* ---------- 3. Reclamaciones de ejemplo ---------- */
DECLARE @anio INT = YEAR(@hoy);
INSERT INTO dbo.Reclamaciones (Numero, Anio, Correlativo, Fecha, Tipo, NombreCompleto, TipoDocumento, NumeroDocumento,
    Domicilio, Telefono, Email, BienTipo, MontoReclamado, DescripcionBien, Detalle, Pedido, Estado,
    FechaLimiteRespuesta, Respuesta, FechaRespuesta)
VALUES
 (CONCAT(N'00001-', @anio), @anio, 1, DATEADD(DAY, -40, SYSDATETIME()), N'Reclamo', N'Carlos Ramos', N'DNI', N'40000111',
  N'Av. Arequipa 1200, Lima', N'987111222', N'carlos.ramos@correo.com', N'Servicio', 180.00,
  N'Hospedaje en Habitación Duna', N'El aire acondicionado no funcionó la primera noche.', N'Devolución de una noche.',
  N'Respondido', DATEADD(DAY, -19, @hoy), N'Lamentamos lo ocurrido. Se devolvió el importe de una noche a su tarjeta.', DATEADD(DAY, -35, SYSDATETIME())),
 (CONCAT(N'00002-', @anio), @anio, 2, DATEADD(DAY, -6, SYSDATETIME()), N'Queja', N'Mariana Torres', N'DNI', N'40000222',
  N'Calle Los Pinos 45, Ica', N'986333444', N'mariana.torres@correo.com', N'Servicio', NULL,
  N'Atención en recepción', N'Demora de 40 minutos en el check-in.', N'Mejorar los tiempos de atención.',
  N'Pendiente', DATEADD(DAY, 15, @hoy), NULL, NULL);

-- Habitaciones con salida reciente quedan pendientes de limpieza
UPDATE h SET EstadoLimpieza = N'Sucia'
FROM dbo.Habitaciones h
WHERE EXISTS (SELECT 1 FROM dbo.Reservas r WHERE r.HabitacionId = h.Id AND r.Estado = N'CheckOut' AND r.FechaSalida = @hoy);

/* ---------- 4. Suscriptores ---------- */
INSERT INTO dbo.Suscriptores (Email)
SELECT TOP (40) Email FROM dbo.Clientes WHERE AceptaPublicidad = 1 ORDER BY Id;

/* ---------- Resumen ---------- */
SELECT EstadoReserva, COUNT(*) AS Reservas, SUM(Total) AS Total
FROM dbo.vw_ReservasPowerBI GROUP BY EstadoReserva ORDER BY Reservas DESC;
