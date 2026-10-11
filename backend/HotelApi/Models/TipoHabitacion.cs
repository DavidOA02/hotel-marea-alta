using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using Microsoft.EntityFrameworkCore;

namespace HotelApi.Models;

/// <summary>Categoría de habitación (Duna, Horizonte, Suite Pleamar).</summary>
[Table("TiposHabitacion")]
[Index(nameof(Codigo), IsUnique = true)]
public class TipoHabitacion
{
    public int Id { get; set; }

    /// <summary>Código usado por el frontend: duna, horizonte, pleamar.</summary>
    [MaxLength(20)] public string Codigo { get; set; } = "";
    [MaxLength(60)] public string Nombre { get; set; } = "";
    [MaxLength(300)] public string? Descripcion { get; set; }
    public int Capacidad { get; set; }
    public int MetrosCuadrados { get; set; }

    /// <summary>Tarifa por noche en soles, IGV incluido.</summary>
    [Precision(10, 2)] public decimal PrecioNoche { get; set; }
    public bool Activo { get; set; } = true;

    public ICollection<Habitacion> Habitaciones { get; set; } = new List<Habitacion>();
}
