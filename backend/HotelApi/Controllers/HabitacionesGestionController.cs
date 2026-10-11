using HotelApi.Data;
using HotelApi.DTOs;
using HotelApi.Models;
using HotelApi.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace HotelApi.Controllers;

/// <summary>Habitaciones (CRUD, estado y limpieza) y tipos de habitación con tarifas.</summary>
[Route("api/gestion")]
public class HabitacionesGestionController : GestionControllerBase
{
    public HabitacionesGestionController(HotelDbContext db) : base(db) { }

    /// <summary>Habitaciones con su situación de hoy (libre, ocupada, llegada, salida, mantenimiento).</summary>
    [HttpGet("habitaciones")]
    public async Task<IActionResult> Habitaciones(CancellationToken ct)
    {
        var hoy = HoraPeru.Hoy;
        var habitaciones = await Db.Habitaciones.AsNoTracking()
            .OrderBy(h => h.Piso).ThenBy(h => h.Numero)
            .Select(h => new
            {
                h.Id, h.Numero, h.Piso, h.TipoHabitacionId, TipoCodigo = h.TipoHabitacion!.Codigo, Tipo = h.TipoHabitacion.Nombre,
                h.TipoHabitacion.Capacidad, h.TipoHabitacion.PrecioNoche, h.Estado, h.EstadoLimpieza, h.Notas,
                TotalReservas = h.Reservas.Count()
            })
            .ToListAsync(ct);

        // Reservas vigentes o futuras (para saber quién está y quién llega)
        var reservas = await Db.Reservas.AsNoTracking()
            .Where(r => (r.Estado == EstadosReserva.Confirmada || r.Estado == EstadosReserva.CheckIn) && r.FechaSalida >= hoy)
            .OrderBy(r => r.FechaEntrada)
            .Select(r => new { r.HabitacionId, r.Codigo, r.Estado, r.FechaEntrada, r.FechaSalida, Huesped = r.Cliente!.Nombres + " " + r.Cliente.Apellidos })
            .ToListAsync(ct);

        var resultado = habitaciones.Select(h =>
        {
            var propias = reservas.Where(r => r.HabitacionId == h.Id).ToList();
            var enCasa = propias.FirstOrDefault(r => r.Estado == EstadosReserva.CheckIn);
            var llegaHoy = propias.FirstOrDefault(r => r.Estado == EstadosReserva.Confirmada && r.FechaEntrada <= hoy && r.FechaSalida > hoy);
            var proxima = propias.FirstOrDefault(r => r.Estado == EstadosReserva.Confirmada && r.FechaEntrada > hoy);

            string situacion = enCasa is not null ? (enCasa.FechaSalida <= hoy ? "Salida hoy" : "Ocupada")
                : llegaHoy is not null ? "Llegada hoy"
                : h.Estado == EstadosHabitacion.Mantenimiento ? "Mantenimiento"
                : h.Estado == EstadosHabitacion.FueraDeServicio ? "Fuera de servicio"
                : "Libre";
            var actual = enCasa ?? llegaHoy;
            return new HabitacionGestionDto(h.Id, h.Numero, h.Piso, h.TipoHabitacionId, h.TipoCodigo, h.Tipo, h.Capacidad, h.PrecioNoche,
                h.Estado, h.EstadoLimpieza, h.Notas, situacion, actual?.Huesped, actual?.Codigo, actual?.FechaSalida,
                proxima?.FechaEntrada, h.TotalReservas);
        });
        return Ok(resultado);
    }

    [HttpPost("habitaciones")]
    [Authorize(Roles = Roles.Administrador)]
    public async Task<IActionResult> CrearHabitacion([FromBody] GuardarHabitacionDto dto, CancellationToken ct)
    {
        var tipo = await Db.TiposHabitacion.FirstOrDefaultAsync(t => t.Codigo == dto.TipoHabitacion, ct);
        if (tipo is null) return Error(400, "El tipo de habitación no existe.", "tipoHabitacion");
        var numero = dto.Numero.Trim().ToUpperInvariant();
        if (await Db.Habitaciones.AnyAsync(h => h.Numero == numero, ct)) return Error(409, $"Ya existe la habitación {numero}.", "numero");

        var h = new Habitacion { Numero = numero, Piso = dto.Piso, TipoHabitacionId = tipo.Id, Estado = dto.Estado,
            EstadoLimpieza = EstadosLimpieza.Limpia, Notas = Limpio(dto.Notas) };
        Db.Habitaciones.Add(h);
        await Db.SaveChangesAsync(ct);
        return StatusCode(201, new { h.Id, h.Numero, mensaje = $"Habitación {h.Numero} creada." });
    }

    [HttpPut("habitaciones/{id:int}")]
    [Authorize(Roles = Roles.Administrador)]
    public async Task<IActionResult> EditarHabitacion(int id, [FromBody] GuardarHabitacionDto dto, CancellationToken ct)
    {
        var h = await Db.Habitaciones.FirstOrDefaultAsync(x => x.Id == id, ct);
        if (h is null) return Error(404, "Habitación no encontrada.");
        var tipo = await Db.TiposHabitacion.FirstOrDefaultAsync(t => t.Codigo == dto.TipoHabitacion, ct);
        if (tipo is null) return Error(400, "El tipo de habitación no existe.", "tipoHabitacion");
        var numero = dto.Numero.Trim().ToUpperInvariant();
        if (await Db.Habitaciones.AnyAsync(x => x.Numero == numero && x.Id != id, ct)) return Error(409, $"Ya existe la habitación {numero}.", "numero");

        var hoy = HoraPeru.Hoy;
        var activas = await Db.Reservas.CountAsync(r => r.HabitacionId == id &&
            (r.Estado == EstadosReserva.Confirmada || r.Estado == EstadosReserva.CheckIn) && r.FechaSalida > hoy, ct);
        if (tipo.Id != h.TipoHabitacionId && activas > 0)
            return Error(409, "No se puede cambiar el tipo: la habitación tiene reservas vigentes o futuras.", "tipoHabitacion");

        h.Numero = numero;
        h.Piso = dto.Piso;
        h.TipoHabitacionId = tipo.Id;
        h.Estado = dto.Estado;
        h.Notas = Limpio(dto.Notas);
        await Db.SaveChangesAsync(ct);

        string? advertencia = dto.Estado != EstadosHabitacion.Operativa && activas > 0
            ? $"Atención: la habitación tiene {activas} reserva(s) vigentes o futuras. Reasígnalas si no estará disponible."
            : null;
        return Ok(new { h.Id, h.Numero, mensaje = $"Habitación {h.Numero} actualizada.", advertencia });
    }

    [HttpDelete("habitaciones/{id:int}")]
    [Authorize(Roles = Roles.Administrador)]
    public async Task<IActionResult> EliminarHabitacion(int id, CancellationToken ct)
    {
        var h = await Db.Habitaciones.FirstOrDefaultAsync(x => x.Id == id, ct);
        if (h is null) return Error(404, "Habitación no encontrada.");
        if (await Db.Reservas.AnyAsync(r => r.HabitacionId == id, ct))
            return Error(409, "La habitación tiene historial de reservas. Cámbiala a «Fuera de servicio» en lugar de eliminarla.");
        Db.Habitaciones.Remove(h);
        await Db.SaveChangesAsync(ct);
        return Ok(new { mensaje = $"Habitación {h.Numero} eliminada." });
    }

    /// <summary>Housekeeping: marca la habitación como limpia o sucia.</summary>
    [HttpPatch("habitaciones/{id:int}/limpieza")]
    public async Task<IActionResult> Limpieza(int id, [FromBody] CambiarLimpiezaDto dto, CancellationToken ct)
    {
        var h = await Db.Habitaciones.FirstOrDefaultAsync(x => x.Id == id, ct);
        if (h is null) return Error(404, "Habitación no encontrada.");
        h.EstadoLimpieza = dto.EstadoLimpieza;
        await Db.SaveChangesAsync(ct);
        return Ok(new { h.Id, h.Numero, h.EstadoLimpieza });
    }

    // ------------------------- Tipos y tarifas -------------------------

    [HttpGet("tipos")]
    public async Task<IActionResult> Tipos(CancellationToken ct) =>
        Ok(await Db.TiposHabitacion.AsNoTracking().OrderBy(t => t.PrecioNoche)
            .Select(t => new
            {
                t.Id, t.Codigo, t.Nombre, t.Descripcion, t.Capacidad, t.MetrosCuadrados, t.PrecioNoche, t.Activo,
                Habitaciones = t.Habitaciones.Count(),
                Operativas = t.Habitaciones.Count(h => h.Estado == EstadosHabitacion.Operativa)
            }).ToListAsync(ct));

    [HttpPost("tipos")]
    [Authorize(Roles = Roles.Administrador)]
    public async Task<IActionResult> CrearTipo([FromBody] GuardarTipoDto dto, CancellationToken ct)
    {
        if (await Db.TiposHabitacion.AnyAsync(t => t.Codigo == dto.Codigo, ct)) return Error(409, "Ya existe un tipo con ese código.", "codigo");
        var t = new TipoHabitacion();
        Copiar(dto, t);
        Db.TiposHabitacion.Add(t);
        await Db.SaveChangesAsync(ct);
        return StatusCode(201, new { t.Id, t.Codigo, mensaje = $"Tipo «{t.Nombre}» creado." });
    }

    [HttpPut("tipos/{id:int}")]
    [Authorize(Roles = Roles.Administrador)]
    public async Task<IActionResult> EditarTipo(int id, [FromBody] GuardarTipoDto dto, CancellationToken ct)
    {
        var t = await Db.TiposHabitacion.FirstOrDefaultAsync(x => x.Id == id, ct);
        if (t is null) return Error(404, "Tipo no encontrado.");
        if (await Db.TiposHabitacion.AnyAsync(x => x.Codigo == dto.Codigo && x.Id != id, ct)) return Error(409, "Ya existe un tipo con ese código.", "codigo");
        Copiar(dto, t);
        await Db.SaveChangesAsync(ct);
        return Ok(new { t.Id, t.Codigo, mensaje = $"Tipo «{t.Nombre}» actualizado. La nueva tarifa se aplica a las reservas que se hagan desde ahora." });
    }

    private static void Copiar(GuardarTipoDto d, TipoHabitacion t)
    {
        t.Codigo = d.Codigo.Trim();
        t.Nombre = d.Nombre.Trim();
        t.Descripcion = Limpio(d.Descripcion);
        t.Capacidad = d.Capacidad;
        t.MetrosCuadrados = d.MetrosCuadrados;
        t.PrecioNoche = Math.Round(d.PrecioNoche, 2);
        t.Activo = d.Activo;
    }

    private static string? Limpio(string? s) => string.IsNullOrWhiteSpace(s) ? null : s.Trim();
}
