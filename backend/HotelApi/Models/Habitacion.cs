using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using Microsoft.EntityFrameworkCore;

namespace HotelApi.Models;

/// <summary>Habitación física (número de puerta).</summary>
[Table("Habitaciones")]
[Index(nameof(Numero), IsUnique = true)]
public class Habitacion
{
    public int Id { get; set; }
    [MaxLength(10)] public string Numero { get; set; } = "";
    public int Piso { get; set; }
    public int TipoHabitacionId { get; set; }
    [MaxLength(20)] public string Estado { get; set; } = EstadosHabitacion.Operativa;

    /// <summary>Limpia o Sucia (housekeeping). Al hacer check-out pasa a Sucia.</summary>
    [MaxLength(10)] public string EstadoLimpieza { get; set; } = EstadosLimpieza.Limpia;
    [MaxLength(300)] public string? Notas { get; set; }

    public TipoHabitacion? TipoHabitacion { get; set; }
    public ICollection<Reserva> Reservas { get; set; } = new List<Reserva>();
}

public static class EstadosHabitacion
{
    public const string Operativa = "Operativa";
    public const string Mantenimiento = "Mantenimiento";
    public const string FueraDeServicio = "FueraDeServicio";
    public static readonly string[] Todos = { Operativa, Mantenimiento, FueraDeServicio };
}

public static class EstadosLimpieza
{
    public const string Limpia = "Limpia";
    public const string Sucia = "Sucia";
}
