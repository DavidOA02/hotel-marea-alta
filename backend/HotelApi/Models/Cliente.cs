using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using Microsoft.EntityFrameworkCore;

namespace HotelApi.Models;

[Table("Clientes")]
[Index(nameof(TipoDocumento), nameof(NumeroDocumento), IsUnique = true)]
public class Cliente
{
    public int Id { get; set; }
    [MaxLength(80)] public string Nombres { get; set; } = "";
    [MaxLength(80)] public string Apellidos { get; set; } = "";

    /// <summary>DNI, CE (carné de extranjería) o PAS (pasaporte).</summary>
    [MaxLength(3)] public string TipoDocumento { get; set; } = "DNI";
    [MaxLength(12)] public string NumeroDocumento { get; set; } = "";
    [MaxLength(150)] public string Email { get; set; } = "";
    [MaxLength(4)] public string CodigoPais { get; set; } = "51";
    [MaxLength(15)] public string Telefono { get; set; } = "";

    /// <summary>PE = residente en Perú, EXT = extranjero no domiciliado.</summary>
    [MaxLength(3)] public string Residencia { get; set; } = "PE";
    public bool AceptaPublicidad { get; set; }
    [MaxLength(500)] public string? Notas { get; set; }
    public DateTime FechaRegistro { get; set; }

    public ICollection<Reserva> Reservas { get; set; } = new List<Reserva>();

    [NotMapped] public string NombreCompleto => $"{Nombres} {Apellidos}".Trim();
}
