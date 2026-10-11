using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using Microsoft.EntityFrameworkCore;

namespace HotelApi.Models;

[Table("Pagos")]
public class Pago
{
    public int Id { get; set; }
    public int ReservaId { get; set; }
    /// <summary>Monto en la moneda en que se pagó.</summary>
    [Precision(10, 2)] public decimal Monto { get; set; }

    /// <summary>PEN o USD.</summary>
    [MaxLength(3)] public string Moneda { get; set; } = "PEN";

    /// <summary>Tipo de cambio usado si se pagó en dólares.</summary>
    [Precision(6, 3)] public decimal? TipoCambio { get; set; }

    /// <summary>Equivalente en soles (para saldos y reportes).</summary>
    [Precision(10, 2)] public decimal MontoSoles { get; set; }

    /// <summary>Tarjeta, Yape, Plin, Transferencia o Efectivo.</summary>
    [MaxLength(20)] public string Metodo { get; set; } = "";
    [MaxLength(60)] public string? Referencia { get; set; }
    /// <summary>Aprobado o Anulado.</summary>
    [MaxLength(20)] public string Estado { get; set; } = EstadosPago.Aprobado;
    public DateTime FechaPago { get; set; }
    [MaxLength(100)] public string? RegistradoPor { get; set; }
    [MaxLength(200)] public string? MotivoAnulacion { get; set; }

    public Reserva? Reserva { get; set; }
}

public static class EstadosPago
{
    public const string Aprobado = "Aprobado";
    public const string Anulado = "Anulado";
}

public static class MetodosPago
{
    public static readonly string[] Todos = { "Tarjeta", "Yape", "Plin", "Transferencia", "Efectivo" };
}
