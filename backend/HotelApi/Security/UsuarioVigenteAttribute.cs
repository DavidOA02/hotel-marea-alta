using System.Security.Claims;
using HotelApi.Data;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;
using Microsoft.EntityFrameworkCore;

namespace HotelApi.Security;

/// <summary>
/// Comprueba en cada petición que el usuario del token sigue activo y que su
/// contraseña, rol o estado no cambiaron (sello). Así, desactivar un usuario o
/// cambiar su clave cierra sus sesiones al instante.
/// </summary>
[AttributeUsage(AttributeTargets.Class | AttributeTargets.Method)]
public sealed class UsuarioVigenteAttribute : Attribute, IAsyncAuthorizationFilter
{
    public const string ClaimSello = "sello";

    public async Task OnAuthorizationAsync(AuthorizationFilterContext context)
    {
        var user = context.HttpContext.User;
        if (user.Identity?.IsAuthenticated != true) return;   // [Authorize] responde 401

        var id = int.TryParse(user.FindFirstValue(ClaimTypes.NameIdentifier), out var n) ? n : 0;
        var sello = user.FindFirstValue(ClaimSello);
        var db = context.HttpContext.RequestServices.GetRequiredService<HotelDbContext>();
        var usuario = await db.Usuarios.AsNoTracking().FirstOrDefaultAsync(u => u.Id == id);

        if (usuario is null || !usuario.Activo || Claves.Sello(usuario) != sello)
            context.Result = new UnauthorizedObjectResult(new { mensaje = "Tu sesión ya no es válida. Ingresa de nuevo." });
    }
}
