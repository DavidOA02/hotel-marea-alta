using HotelApi.Data;
using HotelApi.DTOs;
using HotelApi.Models;
using HotelApi.Security;
using HotelApi.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace HotelApi.Controllers;

/// <summary>Gestión de usuarios del panel (solo administradores).</summary>
[Route("api/gestion/usuarios")]
[Authorize(Roles = Roles.Administrador)]
public class UsuariosController : GestionControllerBase
{
    public UsuariosController(HotelDbContext db) : base(db) { }

    internal static UsuarioDto ADto(Usuario u) =>
        new(u.Id, u.Nombre, u.Email, u.Rol, u.Activo, u.DebeCambiarClave, u.UltimoAcceso, u.FechaCreacion);

    [HttpGet]
    public async Task<IActionResult> Listar(CancellationToken ct)
    {
        var lista = await Db.Usuarios.AsNoTracking().OrderBy(u => u.Rol).ThenBy(u => u.Nombre).ToListAsync(ct);
        return Ok(lista.Select(ADto));
    }

    [HttpPost]
    public async Task<IActionResult> Crear([FromBody] GuardarUsuarioDto dto, CancellationToken ct)
    {
        var email = dto.Email.Trim().ToLowerInvariant();
        var debil = Claves.ValidarFortaleza(dto.Clave);
        if (debil is not null) return Error(400, debil, "clave");
        if (await Db.Usuarios.AnyAsync(u => u.Email == email, ct)) return Error(409, "Ya existe un usuario con ese correo.", "email");

        var u = new Usuario
        {
            Nombre = dto.Nombre.Trim(), Email = email, Rol = dto.Rol, Activo = dto.Activo,
            ClaveHash = Claves.Hash(dto.Clave!), DebeCambiarClave = true, FechaCreacion = HoraPeru.Ahora
        };
        Db.Usuarios.Add(u);
        await Db.SaveChangesAsync(ct);
        return StatusCode(201, ADto(u));
    }

    [HttpPut("{id:int}")]
    public async Task<IActionResult> Editar(int id, [FromBody] GuardarUsuarioDto dto, CancellationToken ct)
    {
        var u = await Db.Usuarios.FirstOrDefaultAsync(x => x.Id == id, ct);
        if (u is null) return Error(404, "Usuario no encontrado.");
        var email = dto.Email.Trim().ToLowerInvariant();
        if (await Db.Usuarios.AnyAsync(x => x.Email == email && x.Id != id, ct)) return Error(409, "Ya existe un usuario con ese correo.", "email");

        if (id == UsuarioId && (!dto.Activo || dto.Rol != Roles.Administrador))
            return Error(409, "No puedes desactivarte ni quitarte el rol de administrador.", "rol");
        if (u.Rol == Roles.Administrador && u.Activo && (dto.Rol != Roles.Administrador || !dto.Activo)
            && await Db.Usuarios.CountAsync(x => x.Rol == Roles.Administrador && x.Activo, ct) <= 1)
            return Error(409, "Debe quedar al menos un administrador activo.", "rol");

        if (!string.IsNullOrEmpty(dto.Clave))
        {
            var debil = Claves.ValidarFortaleza(dto.Clave);
            if (debil is not null) return Error(400, debil, "clave");
            u.ClaveHash = Claves.Hash(dto.Clave);
            u.DebeCambiarClave = true;
        }
        u.Nombre = dto.Nombre.Trim();
        u.Email = email;
        u.Rol = dto.Rol;
        u.Activo = dto.Activo;
        if (dto.Activo) { u.BloqueadoHasta = null; u.IntentosFallidos = 0; }
        await Db.SaveChangesAsync(ct);
        return Ok(ADto(u));
    }
}
