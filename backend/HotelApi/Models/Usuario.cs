using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using Microsoft.EntityFrameworkCore;

namespace HotelApi.Models;

/// <summary>Usuario interno del panel (administrador o recepcionista).</summary>
[Table("Usuarios")]
[Index(nameof(Email), IsUnique = true)]
public class Usuario
{
    public int Id { get; set; }
    [MaxLength(100)] public string Nombre { get; set; } = "";
    [MaxLength(150)] public string Email { get; set; } = "";
    [MaxLength(20)] public string Rol { get; set; } = Roles.Recepcionista;
    [MaxLength(200)] public string ClaveHash { get; set; } = "";
    public bool Activo { get; set; } = true;
    public bool DebeCambiarClave { get; set; } = true;
    public int IntentosFallidos { get; set; }
    public DateTime? BloqueadoHasta { get; set; }
    public DateTime? UltimoAcceso { get; set; }
    public DateTime FechaCreacion { get; set; }
}

public static class Roles
{
    public const string Administrador = "Administrador";
    public const string Recepcionista = "Recepcionista";
    public const string Todos = Administrador + "," + Recepcionista;
    public static readonly string[] Lista = { Administrador, Recepcionista };
}
