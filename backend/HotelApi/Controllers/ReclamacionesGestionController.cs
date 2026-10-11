using HotelApi.Data;
using HotelApi.DTOs;
using HotelApi.Models;
using HotelApi.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace HotelApi.Controllers;

/// <summary>Libro de Reclamaciones y boletín desde el panel.</summary>
[Route("api/gestion")]
public class ReclamacionesGestionController : GestionControllerBase
{
    public ReclamacionesGestionController(HotelDbContext db) : base(db) { }

    [HttpGet("reclamaciones")]
    public async Task<IActionResult> Listar([FromQuery] string? estado, CancellationToken ct)
    {
        var q = Db.Reclamaciones.AsNoTracking();
        if (!string.IsNullOrWhiteSpace(estado)) q = q.Where(r => r.Estado == estado);
        return Ok(await q.OrderByDescending(r => r.Fecha).Take(500).ToListAsync(ct));
    }

    [HttpPatch("reclamaciones/{numero}/respuesta")]
    [Authorize(Roles = Roles.Administrador)]
    public async Task<IActionResult> Responder(string numero, [FromBody] ResponderReclamacionDto dto, CancellationToken ct)
    {
        var hoja = await Db.Reclamaciones.FirstOrDefaultAsync(r => r.Numero == numero, ct);
        if (hoja is null) return Error(404, "Hoja de reclamación no encontrada.");
        if (hoja.Estado == "Respondido") return Error(409, "La hoja ya fue respondida.");
        hoja.Respuesta = dto.Respuesta.Trim();
        hoja.Estado = "Respondido";
        hoja.FechaRespuesta = HoraPeru.Ahora;
        await Db.SaveChangesAsync(ct);
        return Ok(new { numero = hoja.Numero, estado = hoja.Estado, mensaje = "Respuesta registrada. Envíala al correo del consumidor." });
    }

    [HttpGet("suscriptores")]
    [Authorize(Roles = Roles.Administrador)]
    public async Task<IActionResult> Suscriptores(CancellationToken ct) =>
        Ok(await Db.Suscriptores.AsNoTracking().Where(s => s.Activo).OrderByDescending(s => s.FechaRegistro)
            .Select(s => new { s.Email, s.FechaRegistro }).ToListAsync(ct));
}
