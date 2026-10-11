using HotelApi.Data;
using HotelApi.DTOs;
using HotelApi.Models;
using HotelApi.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;

namespace HotelApi.Controllers;

/// <summary>Boletín de ofertas.</summary>
[ApiController]
[Route("api/suscriptores")]
[Produces("application/json")]
public class SuscriptoresController : ControllerBase
{
    private readonly HotelDbContext _db;
    public SuscriptoresController(HotelDbContext db) => _db = db;

    [HttpPost]
    [EnableRateLimiting("formularios")]
    public async Task<IActionResult> Suscribir([FromBody] SuscripcionDto dto, CancellationToken ct)
    {
        var email = dto.Email.Trim().ToLowerInvariant();
        var existente = await _db.Suscriptores.FirstOrDefaultAsync(s => s.Email == email, ct);
        if (existente is null)
            _db.Suscriptores.Add(new Suscriptor { Email = email, FechaRegistro = HoraPeru.Ahora, Activo = true });
        else
            existente.Activo = true;

        await _db.SaveChangesAsync(ct);
        return Ok(new { mensaje = "¡Gracias! Te enviaremos nuestras ofertas exclusivas." });
    }
}
