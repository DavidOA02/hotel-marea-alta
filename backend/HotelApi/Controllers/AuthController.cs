using System.Security.Claims;
using HotelApi.Data;
using HotelApi.DTOs;
using HotelApi.Models;
using HotelApi.Security;
using HotelApi.Services;
using Microsoft.AspNetCore.Authentication.BearerToken;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace HotelApi.Controllers;

/// <summary>Inicio de sesión del panel (token Bearer de ASP.NET Core).</summary>
[ApiController]
[Route("api/auth")]
[Produces("application/json")]
public class AuthController : ControllerBase
{
    private const int MaxIntentos = 5;
    private static readonly TimeSpan Bloqueo = TimeSpan.FromMinutes(15);

    private readonly HotelDbContext _db;
    private readonly ILogger<AuthController> _log;

    public AuthController(HotelDbContext db, ILogger<AuthController> log)
    {
        _db = db;
        _log = log;
    }

    /// <summary>Devuelve { tokenType, accessToken, expiresIn, refreshToken }.</summary>
    [HttpPost("login")]
    [AllowAnonymous]
    [EnableRateLimiting("login")]
    public async Task<IActionResult> Login([FromBody] LoginDto dto, CancellationToken ct)
    {
        var email = dto.Email.Trim().ToLowerInvariant();
        var u = await _db.Usuarios.FirstOrDefaultAsync(x => x.Email == email, ct);
        var ahora = HoraPeru.Ahora;

        if (u?.BloqueadoHasta is DateTime hasta && hasta > ahora)
        {
            var minutos = Math.Max(1, (int)Math.Ceiling((hasta - ahora).TotalMinutes));
            return StatusCode(StatusCodes.Status423Locked, new { mensaje = $"Cuenta bloqueada por intentos fallidos. Inténtalo en {minutos} min." });
        }

        if (u is null || !u.Activo || !Claves.Verificar(dto.Clave, u.ClaveHash))
        {
            if (u is not null)
            {
                u.IntentosFallidos++;
                if (u.IntentosFallidos >= MaxIntentos)
                {
                    u.BloqueadoHasta = ahora.Add(Bloqueo);
                    u.IntentosFallidos = 0;
                    _log.LogWarning("Usuario {Email} bloqueado por intentos fallidos", u.Email);
                }
                await _db.SaveChangesAsync(ct);
            }
            return Unauthorized(new { mensaje = "Correo o contraseña incorrectos." });
        }

        u.IntentosFallidos = 0;
        u.BloqueadoHasta = null;
        u.UltimoAcceso = ahora;
        await _db.SaveChangesAsync(ct);
        _log.LogInformation("Inicio de sesión: {Email} ({Rol})", u.Email, u.Rol);
        return SignIn(Principal(u), BearerTokenDefaults.AuthenticationScheme);
    }

    /// <summary>Datos del usuario de la sesión.</summary>
    [HttpGet("yo")]
    [Authorize]
    [UsuarioVigente]
    public async Task<IActionResult> Yo(CancellationToken ct)
    {
        var id = int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
        var u = await _db.Usuarios.AsNoTracking().FirstAsync(x => x.Id == id, ct);
        return Ok(UsuariosController.ADto(u));
    }

    /// <summary>Cambia la contraseña propia y devuelve un token nuevo.</summary>
    [HttpPost("cambiar-clave")]
    [Authorize]
    [UsuarioVigente]
    public async Task<IActionResult> CambiarClave([FromBody] CambiarClaveDto dto, CancellationToken ct)
    {
        var id = int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
        var u = await _db.Usuarios.FirstAsync(x => x.Id == id, ct);
        if (!Claves.Verificar(dto.ClaveActual, u.ClaveHash))
            return BadRequest(new { mensaje = "La contraseña actual no es correcta.", campo = "claveActual" });
        var debil = Claves.ValidarFortaleza(dto.ClaveNueva);
        if (debil is not null) return BadRequest(new { mensaje = debil, campo = "claveNueva" });
        if (dto.ClaveNueva == dto.ClaveActual)
            return BadRequest(new { mensaje = "La nueva contraseña debe ser distinta de la actual.", campo = "claveNueva" });

        u.ClaveHash = Claves.Hash(dto.ClaveNueva);
        u.DebeCambiarClave = false;
        await _db.SaveChangesAsync(ct);
        return SignIn(Principal(u), BearerTokenDefaults.AuthenticationScheme);
    }

    /// <summary>
    /// Renueva la sesión con el refreshToken (sin volver a pedir la contraseña).
    /// Falla si el usuario fue desactivado o cambió su contraseña o rol.
    /// </summary>
    [HttpPost("renovar")]
    [AllowAnonymous]
    [EnableRateLimiting("login")]
    public async Task<IActionResult> Renovar([FromBody] RenovarDto dto,
        [FromServices] IOptionsMonitor<BearerTokenOptions> opciones, CancellationToken ct)
    {
        var protector = opciones.Get(BearerTokenDefaults.AuthenticationScheme).RefreshTokenProtector;
        var ticket = protector.Unprotect(dto.RefreshToken);
        if (ticket?.Properties?.ExpiresUtc is not { } expira || DateTimeOffset.UtcNow >= expira)
            return Unauthorized(new { mensaje = "La sesión expiró. Ingresa de nuevo." });

        var id = int.TryParse(ticket.Principal.FindFirstValue(ClaimTypes.NameIdentifier), out var n) ? n : 0;
        var u = await _db.Usuarios.FirstOrDefaultAsync(x => x.Id == id, ct);
        if (u is null || !u.Activo || Claves.Sello(u) != ticket.Principal.FindFirstValue(UsuarioVigenteAttribute.ClaimSello))
            return Unauthorized(new { mensaje = "Tu sesión ya no es válida. Ingresa de nuevo." });

        return SignIn(Principal(u), BearerTokenDefaults.AuthenticationScheme);
    }

    internal static ClaimsPrincipal Principal(Usuario u) => new(new ClaimsIdentity(new[]
    {
        new Claim(ClaimTypes.NameIdentifier, u.Id.ToString()),
        new Claim(ClaimTypes.Name, u.Nombre),
        new Claim(ClaimTypes.Email, u.Email),
        new Claim(ClaimTypes.Role, u.Rol),
        new Claim(UsuarioVigenteAttribute.ClaimSello, Claves.Sello(u))
    }, BearerTokenDefaults.AuthenticationScheme));
}
