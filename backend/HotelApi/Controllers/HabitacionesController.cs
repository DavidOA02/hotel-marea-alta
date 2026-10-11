using HotelApi.Data;
using HotelApi.DTOs;
using HotelApi.Models;
using HotelApi.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace HotelApi.Controllers;

[ApiController]
[Produces("application/json")]
public class HabitacionesController : ControllerBase
{
    private readonly HotelDbContext _db;
    public HabitacionesController(HotelDbContext db) => _db = db;

    /// <summary>Tipos de habitación con tarifa vigente (IGV incluido).</summary>
    [HttpGet("api/habitaciones/tipos")]
    [ProducesResponseType(typeof(IEnumerable<TipoHabitacionDto>), StatusCodes.Status200OK)]
    public async Task<IActionResult> Tipos(CancellationToken ct)
    {
        var tipos = await _db.TiposHabitacion.AsNoTracking()
            .Where(t => t.Activo)
            .OrderBy(t => t.PrecioNoche)
            .Select(t => new TipoHabitacionDto(
                t.Codigo, t.Nombre, t.Descripcion, t.Capacidad, t.MetrosCuadrados, t.PrecioNoche,
                t.Habitaciones.Count(h => h.Estado == EstadosHabitacion.Operativa)))
            .ToListAsync(ct);
        return Ok(tipos);
    }

    /// <summary>Habitaciones libres por tipo y cotización para un rango de fechas.</summary>
    /// <param name="entrada">Fecha de llegada (AAAA-MM-DD).</param>
    /// <param name="salida">Fecha de salida (AAAA-MM-DD).</param>
    /// <param name="huespedes">Número de huéspedes.</param>
    [HttpGet("api/disponibilidad")]
    [ProducesResponseType(typeof(IEnumerable<DisponibilidadDto>), StatusCodes.Status200OK)]
    public async Task<IActionResult> Disponible([FromQuery] DateOnly entrada, [FromQuery] DateOnly salida,
        [FromQuery] int huespedes = 1, CancellationToken ct = default)
    {
        var (error, campo) = Services.Disponibilidad.ValidarFechas(entrada, salida);
        if (error is not null) return BadRequest(new { mensaje = error, campo });

        var libresPorTipo = await Services.Disponibilidad.Libres(_db, entrada, salida)
            .GroupBy(h => h.TipoHabitacionId)
            .Select(g => new { TipoId = g.Key, Cantidad = g.Count() })
            .ToListAsync(ct);

        var tipos = await _db.TiposHabitacion.AsNoTracking()
            .Where(t => t.Activo).OrderBy(t => t.PrecioNoche).ToListAsync(ct);

        var noches = salida.DayNumber - entrada.DayNumber;
        var resultado = tipos.Select(t =>
        {
            var libres = t.Capacidad >= huespedes ? libresPorTipo.FirstOrDefault(x => x.TipoId == t.Id)?.Cantidad ?? 0 : 0;
            var q = Tarifas.Calcular(t.PrecioNoche, noches, exonerado: false);
            return new DisponibilidadDto(t.Codigo, t.Nombre, t.Capacidad, t.PrecioNoche, libres, noches, q.Subtotal, q.Igv, q.Total);
        });
        return Ok(resultado);
    }
}
