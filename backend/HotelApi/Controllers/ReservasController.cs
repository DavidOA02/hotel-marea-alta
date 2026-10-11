using HotelApi.Data;
using HotelApi.DTOs;
using HotelApi.Models;
using HotelApi.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;

namespace HotelApi.Controllers;

[ApiController]
[Route("api/reservas")]
[Produces("application/json")]
public class ReservasController : ControllerBase
{
    /// <summary>Horas mínimas antes de la llegada (15:00) para cancelar sin costo.</summary>
    public const int HorasCancelacion = 72;
    private static readonly TimeOnly HoraCheckIn = new(15, 0);

    private readonly HotelDbContext _db;
    private readonly ILogger<ReservasController> _log;


    public ReservasController(HotelDbContext db, ILogger<ReservasController> log)
    {
        _db = db;
        _log = log;
    }

    /// <summary>Registra una reserva y asigna automáticamente una habitación libre.</summary>
    /// <remarks>El precio se calcula en el servidor (nunca se confía en el total enviado por el navegador).</remarks>
    [HttpPost]
    [EnableRateLimiting("formularios")]
    [ProducesResponseType(typeof(ReservaCreadaDto), StatusCodes.Status201Created)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status409Conflict)]
    public async Task<IActionResult> Crear([FromBody] CrearReservaDto dto, [FromServices] ReservaService servicio, CancellationToken ct)
    {
        var cliente = ReservaService.Normalizar(new DatosCliente(
            dto.Nombres, dto.Apellidos, dto.TipoDocumento, dto.NumeroDocumento, dto.Email, dto.CodigoPais, dto.Telefono));
        var (error, campo) = ReservaService.ValidarCliente(cliente, dto.Residencia);
        if (error is not null) return BadRequest(new { mensaje = error, campo });
        if (!dto.AceptaPrivacidad)
            return BadRequest(new { mensaje = "Debes aceptar la Política de privacidad para continuar.", campo = "aceptaPrivacidad" });

        var r = await servicio.CrearAsync(new SolicitudReserva(
            dto.TipoHabitacion.Trim().ToLowerInvariant(), null, dto.FechaEntrada, dto.FechaSalida, dto.Huespedes,
            dto.Residencia, null, cliente, dto.Canal, dto.HoraLlegada, dto.Notas, dto.AceptaPublicidad, null), ct);
        if (!r.Ok) return StatusCode(r.Status, new { mensaje = r.Mensaje, campo = r.Campo });

        var x = r.Reserva!;
        var respuesta = new ReservaCreadaDto(
            x.Codigo, x.Estado, r.TipoNombre!, r.HabitacionNumero!, x.FechaEntrada, x.FechaSalida, x.Noches, x.Huespedes,
            x.Subtotal, x.Igv, x.Total, x.ExoneradoIgv, "Reserva confirmada. Te enviaremos los detalles a tu correo.");
        return CreatedAtAction(nameof(Consultar), new { codigo = x.Codigo }, respuesta);
    }

    /// <summary>Consulta pública de una reserva con su código y el correo del titular.</summary>
    [HttpGet("{codigo}")]
    [EnableRateLimiting("formularios")]
    [ProducesResponseType(typeof(ReservaPublicaDto), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> Consultar(string codigo, [FromQuery] string? email, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(email))
            return BadRequest(new { mensaje = "Escribe el correo con el que hiciste la reserva.", campo = "email" });

        var r = await BuscarAsync(codigo, email, ct);
        if (r is null) return NotFound(new { mensaje = "No encontramos una reserva con ese código y correo." });

        var (puede, motivo) = PoliticaCancelacion(r.Estado, r.FechaEntrada);
        return Ok(new ReservaPublicaDto(
            r.Codigo, r.Estado, r.Titular, r.Tipo, r.Habitacion, r.FechaEntrada, r.FechaSalida, r.Noches, r.Huespedes,
            r.Subtotal, r.Igv, r.Total, r.ExoneradoIgv, r.Pagado, r.FechaReserva, puede, motivo));
    }

    /// <summary>Cancela una reserva (hasta 72 horas antes de la llegada).</summary>
    [HttpPost("{codigo}/cancelar")]
    [EnableRateLimiting("formularios")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    [ProducesResponseType(StatusCodes.Status409Conflict)]
    public async Task<IActionResult> Cancelar(string codigo, [FromBody] CancelarReservaDto dto, CancellationToken ct)
    {
        var cod = codigo.Trim().ToUpperInvariant();
        var email = dto.Email.Trim().ToLowerInvariant();
        var reserva = await _db.Reservas.FirstOrDefaultAsync(r => r.Codigo == cod && r.Cliente!.Email == email, ct);
        if (reserva is null) return NotFound(new { mensaje = "No encontramos una reserva con ese código y correo." });

        var (puede, motivo) = PoliticaCancelacion(reserva.Estado, reserva.FechaEntrada);
        if (!puede) return Conflict(new { mensaje = motivo });

        reserva.Estado = EstadosReserva.Cancelada;
        reserva.FechaCancelacion = HoraPeru.Ahora;
        await _db.SaveChangesAsync(ct);
        _log.LogInformation("Reserva {Codigo} cancelada por el huésped", reserva.Codigo);
        return Ok(new { codigo = reserva.Codigo, estado = reserva.Estado, mensaje = "Tu reserva fue cancelada sin costo." });
    }

    // ------------------------------------------------------------------

    private sealed record ReservaVista(
        string Codigo, string Estado, string Titular, string Tipo, string Habitacion, DateOnly FechaEntrada, DateOnly FechaSalida,
        int Noches, int Huespedes, decimal Subtotal, decimal Igv, decimal Total, bool ExoneradoIgv, decimal Pagado, DateTime FechaReserva);

    private Task<ReservaVista?> BuscarAsync(string codigo, string email, CancellationToken ct)
    {
        var cod = codigo.Trim().ToUpperInvariant();
        var mail = email.Trim().ToLowerInvariant();
        return _db.Reservas.AsNoTracking()
            .Where(r => r.Codigo == cod && r.Cliente!.Email == mail)
            .Select(r => new ReservaVista(
                r.Codigo, r.Estado, r.Cliente!.Nombres + " " + r.Cliente.Apellidos,
                r.Habitacion!.TipoHabitacion!.Nombre, r.Habitacion.Numero,
                r.FechaEntrada, r.FechaSalida, r.Noches, r.Huespedes,
                r.Subtotal, r.Igv, r.Total, r.ExoneradoIgv,
                r.Pagos.Where(p => p.Estado == EstadosPago.Aprobado).Sum(p => p.MontoSoles),
                r.FechaReserva))
            .FirstOrDefaultAsync(ct);
    }

    public static (bool Puede, string? Motivo) PoliticaCancelacion(string estado, DateOnly entrada)
    {
        if (estado != EstadosReserva.Confirmada)
            return (false, $"La reserva está en estado «{estado}» y ya no puede cancelarse en línea.");
        var horas = (entrada.ToDateTime(HoraCheckIn) - HoraPeru.Ahora).TotalHours;
        if (horas < HorasCancelacion)
            return (false, "Faltan menos de 72 horas para tu llegada. Escríbenos por WhatsApp y te ayudamos.");
        return (true, null);
    }
}
