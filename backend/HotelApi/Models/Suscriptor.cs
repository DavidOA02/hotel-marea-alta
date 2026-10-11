using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using Microsoft.EntityFrameworkCore;

namespace HotelApi.Models;

[Table("Suscriptores")]
[Index(nameof(Email), IsUnique = true)]
public class Suscriptor
{
    public int Id { get; set; }
    [MaxLength(150)] public string Email { get; set; } = "";
    public DateTime FechaRegistro { get; set; }
    public bool Activo { get; set; } = true;
}
