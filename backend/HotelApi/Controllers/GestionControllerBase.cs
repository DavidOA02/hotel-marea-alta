using System.Security.Claims;
using HotelApi.Data;
using HotelApi.Security;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace HotelApi.Controllers;

/// <summary>Base de los controladores del panel: requiere sesión válida.</summary>
[ApiController]
[Authorize]
[UsuarioVigente]
[Produces("application/json")]
public abstract class GestionControllerBase : ControllerBase
{
    protected readonly HotelDbContext Db;
    protected GestionControllerBase(HotelDbContext db) => Db = db;

    protected int UsuarioId => int.TryParse(User.FindFirstValue(ClaimTypes.NameIdentifier), out var id) ? id : 0;
    protected string UsuarioNombre => User.FindFirstValue(ClaimTypes.Name) ?? "Sistema";
    protected bool EsAdmin => User.IsInRole(Models.Roles.Administrador);

    protected IActionResult Error(int status, string mensaje, string? campo = null) =>
        StatusCode(status, new { mensaje, campo });
}
