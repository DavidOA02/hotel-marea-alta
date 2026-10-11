using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using Microsoft.EntityFrameworkCore;

namespace HotelApi.Models;

[Table("Reservas")]
[Index(nameof(Codigo), IsUnique = true)]
public class Reserva
{
    public int Id { get; set; }

    /// <summary>Código público, p. ej. MA2600042.</summary>
    [MaxLength(20)] public string Codigo { get; set; } = "";
    public int ClienteId { get; set; }
    public int HabitacionId { get; set; }
    public DateOnly FechaEntrada { get; set; }
    public DateOnly FechaSalida { get; set; }
    public int Noches { get; set; }
    public int Huespedes { get; set; }
    [MaxLength(30)] public string? HoraLlegada { get; set; }
    [MaxLength(500)] public string? Notas { get; set; }

    public bool ExoneradoIgv { get; set; }
    [Precision(10, 2)] public decimal Subtotal { get; set; }
    [Precision(10, 2)] public decimal Igv { get; set; }
    [Precision(10, 2)] public decimal Total { get; set; }

    [MaxLength(20)] public string Estado { get; set; } = EstadosReserva.Confirmada;
    [MaxLength(20)] public string Canal { get; set; } = "Web";
    public DateTime FechaReserva { get; set; }
    public DateTime? FechaCancelacion { get; set; }
    public DateTime? FechaCheckIn { get; set; }
    public DateTime? FechaCheckOut { get; set; }

    /// <summary>Usuario del panel que registró la reserva (null = web).</summary>
    [MaxLength(100)] public string? RegistradoPor { get; set; }

    public Cliente? Cliente { get; set; }
    public Habitacion? Habitacion { get; set; }
    public ICollection<Pago> Pagos { get; set; } = new List<Pago>();
}

public static class EstadosReserva
{
    public const string Confirmada = "Confirmada";
    public const string CheckIn = "CheckIn";
    public const string CheckOut = "CheckOut";
    public const string Cancelada = "Cancelada";
    public const string NoShow = "NoShow";

    public static readonly string[] Todos = { Confirmada, CheckIn, CheckOut, Cancelada, NoShow };

    /// <summary>Transiciones permitidas desde cada estado (panel de administración).</summary>
    public static bool PuedeCambiar(string desde, string hacia) => (desde, hacia) switch
    {
        (Confirmada, CheckIn or Cancelada or NoShow) => true,
        (CheckIn, CheckOut) => true,
        _ => false
    };
}
