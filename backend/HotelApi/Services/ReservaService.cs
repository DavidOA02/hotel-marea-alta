using System.Data;
using HotelApi.Data;
using HotelApi.Models;
using Microsoft.EntityFrameworkCore;

namespace HotelApi.Services;

public record DatosCliente(string Nombres, string Apellidos, string TipoDocumento, string NumeroDocumento,
    string Email, string CodigoPais, string Telefono);

public record SolicitudReserva(
    string TipoHabitacion, int? HabitacionId, DateOnly FechaEntrada, DateOnly FechaSalida, int Huespedes,
    string Residencia, int? ClienteId, DatosCliente? Cliente, string Canal, string? HoraLlegada, string? Notas,
    bool AceptaPublicidad, string? RegistradoPor, bool CheckInInmediato = false);

public record ResultadoReserva(Reserva? Reserva, string? TipoNombre, string? HabitacionNumero,
    int Status, string? Mensaje, string? Campo)
{
    public bool Ok => Reserva is not null;
    public static ResultadoReserva Falla(int status, string mensaje, string? campo = null) => new(null, null, null, status, mensaje, campo);
}

/// <summary>
/// Lógica única para registrar reservas (web y panel): valida fechas, documentos
/// e IGV, asigna una habitación libre dentro de una transacción serializable y
/// calcula el total en el servidor.
/// </summary>
public class ReservaService
{
    private readonly HotelDbContext _db;
    private readonly ILogger<ReservaService> _log;

    public ReservaService(HotelDbContext db, ILogger<ReservaService> log)
    {
        _db = db;
        _log = log;
    }

    public static DatosCliente Normalizar(DatosCliente c) => c with
    {
        Nombres = c.Nombres.Trim(),
        Apellidos = c.Apellidos.Trim(),
        TipoDocumento = c.TipoDocumento.Trim().ToUpperInvariant(),
        NumeroDocumento = c.NumeroDocumento.Trim().ToUpperInvariant(),
        Email = c.Email.Trim().ToLowerInvariant(),
        CodigoPais = c.CodigoPais.Trim(),
        Telefono = new string(c.Telefono.Where(char.IsDigit).ToArray())
    };

    /// <summary>Valida los datos de un cliente. Devuelve (mensaje, campo) o (null, null).</summary>
    public static (string? Mensaje, string? Campo) ValidarCliente(DatosCliente c, string residencia)
    {
        if (string.IsNullOrWhiteSpace(c.Nombres)) return ("Escribe los nombres.", "nombres");
        if (string.IsNullOrWhiteSpace(c.Apellidos)) return ("Escribe los apellidos.", "apellidos");
        if (residencia == "EXT" && c.TipoDocumento != "PAS")
            return ("Para la exoneración de IGV se requiere pasaporte.", "tipoDocumento");
        var doc = Documentos.Validar(c.TipoDocumento, c.NumeroDocumento);
        if (doc is not null || c.TipoDocumento == "RUC") return (doc ?? "Tipo de documento no válido.", "numeroDocumento");
        if (c.CodigoPais == "51" && !(c.Telefono.Length == 9 && c.Telefono[0] == '9'))
            return ("El celular debe tener 9 dígitos y empezar con 9.", "telefono");
        if (c.Telefono.Length is < 6 or > 15) return ("Escribe un número de teléfono válido.", "telefono");
        if (!c.Email.Contains('@') || c.Email.Length > 150) return ("Escribe un correo válido.", "email");
        return (null, null);
    }

    public async Task<ResultadoReserva> CrearAsync(SolicitudReserva s, CancellationToken ct)
    {
        var fechas = Disponibilidad.ValidarFechas(s.FechaEntrada, s.FechaSalida);
        if (fechas.Mensaje is not null) return ResultadoReserva.Falla(400, fechas.Mensaje, fechas.Campo);
        if (s.CheckInInmediato && s.FechaEntrada != HoraPeru.Hoy)
            return ResultadoReserva.Falla(400, "El check-in inmediato solo es posible si la llegada es hoy.", "fechaEntrada");

        var tipo = await _db.TiposHabitacion.AsNoTracking()
            .FirstOrDefaultAsync(t => t.Codigo == s.TipoHabitacion && t.Activo, ct);
        if (tipo is null) return ResultadoReserva.Falla(400, "El tipo de habitación no existe.", "tipoHabitacion");
        if (s.Huespedes < 1 || s.Huespedes > tipo.Capacidad)
            return ResultadoReserva.Falla(400, $"{tipo.Nombre} admite hasta {tipo.Capacidad} huéspedes. Elige otra habitación o reduce el número.", "huespedes");

        try
        {
            // Serializable: evita que dos personas reserven la misma habitación a la vez
            await using var tx = await _db.Database.BeginTransactionAsync(IsolationLevel.Serializable, ct);

            Habitacion? habitacion;
            if (s.HabitacionId is int hid)
            {
                habitacion = await Disponibilidad.Libres(_db, s.FechaEntrada, s.FechaSalida)
                    .FirstOrDefaultAsync(h => h.Id == hid && h.TipoHabitacionId == tipo.Id, ct);
                if (habitacion is null)
                    return ResultadoReserva.Falla(409, "Esa habitación no está libre para esas fechas o no corresponde al tipo elegido.", "habitacionId");
            }
            else
            {
                habitacion = await Disponibilidad.PrimeraLibreAsync(_db, tipo.Id, s.FechaEntrada, s.FechaSalida, ct);
                if (habitacion is null)
                    return ResultadoReserva.Falla(409, $"No quedan habitaciones {tipo.Nombre} para esas fechas. Prueba otras fechas u otro tipo de habitación.", "fechaEntrada");
            }

            var ahora = HoraPeru.Ahora;
            Cliente? cliente;
            if (s.ClienteId is int cid)
            {
                cliente = await _db.Clientes.FirstOrDefaultAsync(c => c.Id == cid, ct);
                if (cliente is null) return ResultadoReserva.Falla(404, "Cliente no encontrado.", "clienteId");
                if (s.Residencia == "EXT" && cliente.TipoDocumento != "PAS")
                    return ResultadoReserva.Falla(400, "Para la exoneración de IGV el cliente debe estar registrado con pasaporte.", "residencia");
                cliente.Residencia = s.Residencia;
            }
            else
            {
                var d = s.Cliente!;
                cliente = await _db.Clientes.FirstOrDefaultAsync(
                    c => c.TipoDocumento == d.TipoDocumento && c.NumeroDocumento == d.NumeroDocumento, ct);
                if (cliente is null)
                {
                    cliente = new Cliente { TipoDocumento = d.TipoDocumento, NumeroDocumento = d.NumeroDocumento, FechaRegistro = ahora };
                    _db.Clientes.Add(cliente);
                }
                cliente.Nombres = d.Nombres;
                cliente.Apellidos = d.Apellidos;
                cliente.Email = d.Email;
                cliente.CodigoPais = d.CodigoPais;
                cliente.Telefono = d.Telefono;
                cliente.Residencia = s.Residencia;
                cliente.AceptaPublicidad = cliente.AceptaPublicidad || s.AceptaPublicidad;
            }

            var noches = s.FechaSalida.DayNumber - s.FechaEntrada.DayNumber;
            var cot = Tarifas.Calcular(tipo.PrecioNoche, noches, exonerado: s.Residencia == "EXT");

            var reserva = new Reserva
            {
                Codigo = "TMP" + Guid.NewGuid().ToString("N")[..12],
                Cliente = cliente,
                HabitacionId = habitacion.Id,
                FechaEntrada = s.FechaEntrada,
                FechaSalida = s.FechaSalida,
                Noches = noches,
                Huespedes = s.Huespedes,
                HoraLlegada = string.IsNullOrWhiteSpace(s.HoraLlegada) ? null : s.HoraLlegada.Trim(),
                Notas = string.IsNullOrWhiteSpace(s.Notas) ? null : s.Notas.Trim(),
                ExoneradoIgv = cot.ExoneradoIgv,
                Subtotal = cot.Subtotal,
                Igv = cot.Igv,
                Total = cot.Total,
                Estado = s.CheckInInmediato ? EstadosReserva.CheckIn : EstadosReserva.Confirmada,
                FechaCheckIn = s.CheckInInmediato ? ahora : null,
                Canal = s.Canal,
                FechaReserva = ahora,
                RegistradoPor = s.RegistradoPor
            };
            _db.Reservas.Add(reserva);
            await _db.SaveChangesAsync(ct);

            // Código público: MA + año + correlativo (p. ej. MA2600042)
            reserva.Codigo = $"MA{ahora:yy}{reserva.Id:D5}";
            await _db.SaveChangesAsync(ct);
            await tx.CommitAsync(ct);

            _log.LogInformation("Reserva {Codigo} ({Canal}) {Tipo} {Habitacion} del {Entrada} al {Salida}",
                reserva.Codigo, reserva.Canal, tipo.Nombre, habitacion.Numero, reserva.FechaEntrada, reserva.FechaSalida);
            return new ResultadoReserva(reserva, tipo.Nombre, habitacion.Numero, 201, null, null);
        }
        catch (Exception ex) when (ex is DbUpdateException || ex.GetType().Name == "SqlException")
        {
            _log.LogWarning(ex, "No se pudo registrar la reserva");
            return ResultadoReserva.Falla(409, "Otra persona estaba reservando la misma habitación. Inténtalo de nuevo en unos segundos.");
        }
    }
}
