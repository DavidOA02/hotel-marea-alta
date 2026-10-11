using System.Linq.Expressions;
using HotelApi.Data;
using HotelApi.DTOs;
using HotelApi.Models;
using HotelApi.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace HotelApi.Controllers;

/// <summary>Caja: pagos recibidos y anulaciones.</summary>
[Route("api/gestion/pagos")]
public class PagosController : GestionControllerBase
{
    public PagosController(HotelDbContext db) : base(db) { }

    internal static readonly Expression<Func<Pago, PagoDto>> ADto = p => new PagoDto(
        p.Id, p.Reserva!.Codigo, p.Reserva.Cliente!.Nombres + " " + p.Reserva.Cliente.Apellidos,
        p.Monto, p.Moneda, p.TipoCambio, p.MontoSoles, p.Metodo, p.Referencia, p.Estado, p.FechaPago,
        p.RegistradoPor, p.MotivoAnulacion);

    /// <summary>Pagos en un rango de fechas (por defecto, hoy) con totales por método.</summary>
    [HttpGet]
    public async Task<IActionResult> Listar([FromQuery] DateOnly? desde, [FromQuery] DateOnly? hasta, [FromQuery] string? metodo,
        CancellationToken ct)
    {
        var d = desde ?? HoraPeru.Hoy;
        var h = hasta ?? d;
        if (h < d) return Error(400, "La fecha final debe ser posterior a la inicial.", "hasta");
        var inicio = d.ToDateTime(TimeOnly.MinValue);
        var fin = h.AddDays(1).ToDateTime(TimeOnly.MinValue);

        var q = Db.Pagos.AsNoTracking().Where(p => p.FechaPago >= inicio && p.FechaPago < fin);
        if (!string.IsNullOrWhiteSpace(metodo)) q = q.Where(p => p.Metodo == metodo);
        var pagos = await q.OrderByDescending(p => p.FechaPago).Select(ADto).ToListAsync(ct);

        var aprobados = pagos.Where(p => p.Estado == EstadosPago.Aprobado).ToList();
        return Ok(new
        {
            desde = d, hasta = h,
            total = aprobados.Sum(p => p.MontoSoles),
            cantidad = aprobados.Count,
            porMetodo = aprobados.GroupBy(p => p.Metodo)
                .Select(g => new { metodo = g.Key, monto = g.Sum(p => p.MontoSoles), cantidad = g.Count() })
                .OrderByDescending(x => x.monto),
            pagos
        });
    }

    [HttpPost("{id:int}/anular")]
    [Authorize(Roles = Roles.Administrador)]
    public async Task<IActionResult> Anular(int id, [FromBody] AnularPagoDto dto, CancellationToken ct)
    {
        var p = await Db.Pagos.Include(x => x.Reserva).FirstOrDefaultAsync(x => x.Id == id, ct);
        if (p is null) return Error(404, "Pago no encontrado.");
        if (p.Estado == EstadosPago.Anulado) return Error(409, "El pago ya está anulado.");
        if (p.Reserva!.Estado == EstadosReserva.CheckOut) return Error(409, "No se anulan pagos de estadías cerradas (check-out).");
        p.Estado = EstadosPago.Anulado;
        p.MotivoAnulacion = $"{dto.Motivo.Trim()} — {UsuarioNombre}";
        await Db.SaveChangesAsync(ct);
        return Ok(new { p.Id, mensaje = "Pago anulado." });
    }
}
