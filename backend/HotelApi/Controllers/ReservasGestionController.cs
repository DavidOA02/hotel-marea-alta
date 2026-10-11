using System.Linq.Expressions;
using HotelApi.Data;
using HotelApi.DTOs;
using HotelApi.Models;
using HotelApi.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace HotelApi.Controllers;

/// <summary>Reservas del panel: alta (teléfono, WhatsApp, walk-in), recepción, check-in/out y pagos.</summary>
[Route("api/gestion")]
public class ReservasGestionController : GestionControllerBase
{
    private readonly ILogger<ReservasGestionController> _log;
    public ReservasGestionController(HotelDbContext db, ILogger<ReservasGestionController> log) : base(db) => _log = log;

    internal static readonly Expression<Func<Reserva, ReservaListaDto>> ALista = r => new ReservaListaDto(
        r.Codigo, r.Estado, r.Canal, r.ClienteId,
        r.Cliente!.Nombres + " " + r.Cliente.Apellidos,
        r.Cliente.TipoDocumento + " " + r.Cliente.NumeroDocumento,
        r.Cliente.Email, "+" + r.Cliente.CodigoPais + " " + r.Cliente.Telefono, r.Cliente.Residencia,
        r.Habitacion!.TipoHabitacion!.Nombre, r.Habitacion.Numero,
        r.FechaEntrada, r.FechaSalida, r.Noches, r.Huespedes, r.Subtotal, r.Igv, r.Total,
        r.Pagos.Where(p => p.Estado == EstadosPago.Aprobado).Sum(p => p.MontoSoles),
        r.Total - r.Pagos.Where(p => p.Estado == EstadosPago.Aprobado).Sum(p => p.MontoSoles),
        r.ExoneradoIgv, r.HoraLlegada, r.Notas, r.FechaReserva, r.FechaCheckIn, r.FechaCheckOut, r.RegistradoPor);

    [HttpGet("reservas")]
    public async Task<IActionResult> Listar([FromQuery] string? estado, [FromQuery] DateOnly? desde, [FromQuery] DateOnly? hasta,
        [FromQuery] string? buscar, [FromQuery] int limite = 300, CancellationToken ct = default)
    {
        var q = Db.Reservas.AsNoTracking();
        if (!string.IsNullOrWhiteSpace(estado)) q = q.Where(r => r.Estado == estado);
        if (desde is not null) q = q.Where(r => r.FechaEntrada >= desde);
        if (hasta is not null) q = q.Where(r => r.FechaEntrada <= hasta);
        if (!string.IsNullOrWhiteSpace(buscar))
        {
            var b = buscar.Trim();
            q = q.Where(r => r.Codigo.Contains(b) || r.Cliente!.Nombres.Contains(b) || r.Cliente.Apellidos.Contains(b)
                             || r.Cliente.NumeroDocumento.Contains(b) || r.Cliente.Email.Contains(b) || r.Habitacion!.Numero == b);
        }
        return Ok(await q.OrderByDescending(r => r.FechaEntrada).ThenBy(r => r.Codigo)
            .Take(Math.Clamp(limite, 1, 1000)).Select(ALista).ToListAsync(ct));
    }

    [HttpGet("reservas/{codigo}")]
    public async Task<IActionResult> Detalle(string codigo, CancellationToken ct)
    {
        var cod = codigo.Trim().ToUpperInvariant();
        var reserva = await Db.Reservas.AsNoTracking().Where(r => r.Codigo == cod).Select(ALista).FirstOrDefaultAsync(ct);
        if (reserva is null) return Error(404, "Reserva no encontrada.");
        var pagos = await Db.Pagos.AsNoTracking().Where(p => p.Reserva!.Codigo == cod).OrderBy(p => p.FechaPago)
            .Select(PagosController.ADto).ToListAsync(ct);
        return Ok(new { reserva, pagos });
    }

    /// <summary>Registra una reserva desde el panel (teléfono, WhatsApp o recepción / walk-in).</summary>
    [HttpPost("reservas")]
    public async Task<IActionResult> Crear([FromBody] CrearReservaPanelDto dto, [FromServices] ReservaService servicio, CancellationToken ct)
    {
        DatosCliente? datos = null;
        if (dto.ClienteId is null)
        {
            if (dto.Cliente is null) return Error(400, "Elige un cliente existente o registra uno nuevo.", "clienteId");
            datos = ReservaService.Normalizar(new DatosCliente(dto.Cliente.Nombres, dto.Cliente.Apellidos, dto.Cliente.TipoDocumento,
                dto.Cliente.NumeroDocumento, dto.Cliente.Email, dto.Cliente.CodigoPais, dto.Cliente.Telefono));
            var (msg, campo) = ReservaService.ValidarCliente(datos, dto.Residencia);
            if (msg is not null) return Error(400, msg, campo);
        }

        var r = await servicio.CrearAsync(new SolicitudReserva(
            dto.TipoHabitacion.Trim().ToLowerInvariant(), dto.HabitacionId, dto.FechaEntrada, dto.FechaSalida, dto.Huespedes,
            dto.Residencia, dto.ClienteId, datos, dto.Canal, dto.HoraLlegada, dto.Notas,
            dto.Cliente?.AceptaPublicidad ?? false, UsuarioNombre, dto.CheckInInmediato), ct);
        if (!r.Ok) return Error(r.Status, r.Mensaje!, r.Campo);

        var x = r.Reserva!;
        return StatusCode(201, new
        {
            codigo = x.Codigo, estado = x.Estado, habitacion = r.HabitacionNumero, tipo = r.TipoNombre, total = x.Total,
            mensaje = x.Estado == EstadosReserva.CheckIn
                ? $"Reserva {x.Codigo} creada y check-in registrado en la habitación {r.HabitacionNumero}."
                : $"Reserva {x.Codigo} creada. Habitación asignada: {r.HabitacionNumero}."
        });
    }

    /// <summary>Tablero de recepción: llegadas y salidas de hoy, huéspedes en el hotel.</summary>
    [HttpGet("recepcion")]
    public async Task<IActionResult> Recepcion(CancellationToken ct)
    {
        var hoy = HoraPeru.Hoy;
        var llegadas = await Db.Reservas.AsNoTracking()
            .Where(r => r.Estado == EstadosReserva.Confirmada && r.FechaEntrada <= hoy && r.FechaSalida > hoy)
            .OrderBy(r => r.HoraLlegada).ThenBy(r => r.Habitacion!.Numero).Select(ALista).ToListAsync(ct);
        var enCasa = await Db.Reservas.AsNoTracking()
            .Where(r => r.Estado == EstadosReserva.CheckIn)
            .OrderBy(r => r.FechaSalida).ThenBy(r => r.Habitacion!.Numero).Select(ALista).ToListAsync(ct);
        var limpieza = await Db.Habitaciones.AsNoTracking()
            .Where(h => h.EstadoLimpieza == EstadosLimpieza.Sucia && h.Estado == EstadosHabitacion.Operativa)
            .OrderBy(h => h.Numero).Select(h => new { h.Id, h.Numero, Tipo = h.TipoHabitacion!.Nombre }).ToListAsync(ct);
        return Ok(new
        {
            hoy,
            llegadas,
            salidas = enCasa.Where(r => r.FechaSalida <= hoy).ToList(),
            enCasa = enCasa.Where(r => r.FechaSalida > hoy).ToList(),
            limpieza
        });
    }

    [HttpPost("reservas/{codigo}/checkin")]
    public async Task<IActionResult> CheckIn(string codigo, CancellationToken ct)
    {
        var r = await Buscar(codigo, ct);
        if (r is null) return Error(404, "Reserva no encontrada.");
        if (r.Estado != EstadosReserva.Confirmada) return Error(409, $"La reserva está «{r.Estado}»; solo se hace check-in a reservas confirmadas.");
        var hoy = HoraPeru.Hoy;
        if (r.FechaEntrada > hoy) return Error(409, $"La llegada está programada para el {r.FechaEntrada:dd/MM/yyyy}.");
        if (r.FechaSalida <= hoy) return Error(409, "La fecha de salida ya pasó; marca la reserva como No show.");

        r.Estado = EstadosReserva.CheckIn;
        r.FechaCheckIn = HoraPeru.Ahora;
        await Db.SaveChangesAsync(ct);
        _log.LogInformation("Check-in {Codigo} por {Usuario}", r.Codigo, UsuarioNombre);
        var advertencia = r.Habitacion!.EstadoLimpieza == EstadosLimpieza.Sucia ? $"La habitación {r.Habitacion.Numero} figura como sucia." : null;
        return Ok(new { codigo = r.Codigo, estado = r.Estado, mensaje = $"Check-in registrado: habitación {r.Habitacion.Numero}.", advertencia });
    }

    [HttpPost("reservas/{codigo}/checkout")]
    public async Task<IActionResult> CheckOut(string codigo, [FromBody] CheckOutDto? dto, CancellationToken ct)
    {
        var r = await Buscar(codigo, ct);
        if (r is null) return Error(404, "Reserva no encontrada.");
        if (r.Estado != EstadosReserva.CheckIn) return Error(409, "Solo se hace check-out a huéspedes que están en el hotel.");
        var saldo = r.Total - r.Pagos.Where(p => p.Estado == EstadosPago.Aprobado).Sum(p => p.MontoSoles);
        if (saldo > 0.01m && !(EsAdmin && dto?.ForzarConSaldo == true))
            return Error(409, $"Hay un saldo pendiente de S/ {saldo:N2}. Registra el pago antes del check-out.", "saldo");

        r.Estado = EstadosReserva.CheckOut;
        r.FechaCheckOut = HoraPeru.Ahora;
        r.Habitacion!.EstadoLimpieza = EstadosLimpieza.Sucia;
        await Db.SaveChangesAsync(ct);
        _log.LogInformation("Check-out {Codigo} por {Usuario}", r.Codigo, UsuarioNombre);
        return Ok(new { codigo = r.Codigo, estado = r.Estado, mensaje = $"Check-out registrado. La habitación {r.Habitacion.Numero} pasó a limpieza." });
    }

    [HttpPost("reservas/{codigo}/cancelar")]
    public async Task<IActionResult> Cancelar(string codigo, CancellationToken ct)
    {
        var r = await Buscar(codigo, ct);
        if (r is null) return Error(404, "Reserva no encontrada.");
        if (r.Estado != EstadosReserva.Confirmada) return Error(409, $"Solo se cancelan reservas confirmadas (estado actual: «{r.Estado}»).");
        r.Estado = EstadosReserva.Cancelada;
        r.FechaCancelacion = HoraPeru.Ahora;
        await Db.SaveChangesAsync(ct);
        _log.LogInformation("Reserva {Codigo} cancelada por {Usuario}", r.Codigo, UsuarioNombre);
        return Ok(new { codigo = r.Codigo, estado = r.Estado, mensaje = $"Reserva {r.Codigo} cancelada." });
    }

    [HttpPost("reservas/{codigo}/noshow")]
    public async Task<IActionResult> NoShow(string codigo, CancellationToken ct)
    {
        var r = await Buscar(codigo, ct);
        if (r is null) return Error(404, "Reserva no encontrada.");
        if (r.Estado != EstadosReserva.Confirmada) return Error(409, "Solo se marca No show en reservas confirmadas.");
        if (r.FechaEntrada > HoraPeru.Hoy) return Error(409, "Solo se puede marcar No show desde el día de llegada.");
        r.Estado = EstadosReserva.NoShow;
        await Db.SaveChangesAsync(ct);
        return Ok(new { codigo = r.Codigo, estado = r.Estado, mensaje = $"Reserva {r.Codigo} marcada como No show." });
    }

    [HttpPost("reservas/{codigo}/pagos")]
    public async Task<IActionResult> RegistrarPago(string codigo, [FromBody] RegistrarPagoDto dto, CancellationToken ct)
    {
        var r = await Buscar(codigo, ct);
        if (r is null) return Error(404, "Reserva no encontrada.");
        if (r.Estado is EstadosReserva.Cancelada or EstadosReserva.NoShow)
            return Error(409, $"No se registran pagos en reservas «{r.Estado}».");
        if (dto.Moneda == "USD" && dto.TipoCambio is null)
            return Error(400, "Indica el tipo de cambio para pagos en dólares.", "tipoCambio");

        var montoSoles = dto.Moneda == "USD"
            ? Math.Round(dto.Monto * dto.TipoCambio!.Value, 2, MidpointRounding.AwayFromZero)
            : dto.Monto;
        var pagado = r.Pagos.Where(p => p.Estado == EstadosPago.Aprobado).Sum(p => p.MontoSoles);
        var saldo = r.Total - pagado;
        if (montoSoles > saldo + 0.01m)
            return Error(409, $"El pago (S/ {montoSoles:N2}) supera el saldo pendiente (S/ {saldo:N2}).", "monto");

        r.Pagos.Add(new Pago
        {
            Monto = dto.Monto, Moneda = dto.Moneda, TipoCambio = dto.Moneda == "USD" ? dto.TipoCambio : null,
            MontoSoles = montoSoles, Metodo = dto.Metodo,
            Referencia = string.IsNullOrWhiteSpace(dto.Referencia) ? null : dto.Referencia.Trim(),
            Estado = EstadosPago.Aprobado, FechaPago = HoraPeru.Ahora, RegistradoPor = UsuarioNombre
        });
        await Db.SaveChangesAsync(ct);
        pagado += montoSoles;
        return Ok(new { codigo = r.Codigo, pagado, saldo = r.Total - pagado, mensaje = $"Pago de S/ {montoSoles:N2} registrado." });
    }

    private Task<Reserva?> Buscar(string codigo, CancellationToken ct)
    {
        var cod = codigo.Trim().ToUpperInvariant();
        return Db.Reservas.Include(r => r.Pagos).Include(r => r.Habitacion).FirstOrDefaultAsync(r => r.Codigo == cod, ct);
    }
}
