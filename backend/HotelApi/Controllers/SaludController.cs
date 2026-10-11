using HotelApi.Data;
using HotelApi.Services;
using Microsoft.AspNetCore.Mvc;

namespace HotelApi.Controllers;

/// <summary>Comprobación de estado. El frontend la usa para saber si la API está disponible.</summary>
[ApiController]
[Route("api/salud")]
public class SaludController : ControllerBase
{
    private readonly HotelDbContext _db;
    public SaludController(HotelDbContext db) => _db = db;

    [HttpGet]
    public async Task<IActionResult> Get(CancellationToken ct)
    {
        var baseDatos = await _db.Database.CanConnectAsync(ct);
        var cuerpo = new { estado = baseDatos ? "ok" : "sin-base-de-datos", hora = HoraPeru.Ahora };
        return baseDatos ? Ok(cuerpo) : StatusCode(StatusCodes.Status503ServiceUnavailable, cuerpo);
    }
}
