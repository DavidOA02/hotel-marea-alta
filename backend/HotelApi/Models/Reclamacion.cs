using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using Microsoft.EntityFrameworkCore;

namespace HotelApi.Models;

/// <summary>Hoja del Libro de Reclamaciones virtual (Ley N.° 29571).</summary>
[Table("Reclamaciones")]
[Index(nameof(Numero), IsUnique = true)]
[Index(nameof(Anio), nameof(Correlativo), IsUnique = true)]
public class Reclamacion
{
    public int Id { get; set; }

    /// <summary>Número correlativo visible, p. ej. 00012-2026.</summary>
    [MaxLength(12)] public string Numero { get; set; } = "";
    public int Anio { get; set; }
    public int Correlativo { get; set; }
    public DateTime Fecha { get; set; }

    /// <summary>Reclamo o Queja.</summary>
    [MaxLength(10)] public string Tipo { get; set; } = "Reclamo";
    [MaxLength(160)] public string NombreCompleto { get; set; } = "";
    [MaxLength(3)] public string TipoDocumento { get; set; } = "DNI";
    [MaxLength(12)] public string NumeroDocumento { get; set; } = "";
    [MaxLength(200)] public string Domicilio { get; set; } = "";
    [MaxLength(20)] public string Telefono { get; set; } = "";
    [MaxLength(150)] public string Email { get; set; } = "";
    public bool EsMenor { get; set; }
    [MaxLength(160)] public string? Apoderado { get; set; }

    /// <summary>Producto o Servicio.</summary>
    [MaxLength(10)] public string BienTipo { get; set; } = "Servicio";
    [Precision(10, 2)] public decimal? MontoReclamado { get; set; }
    [MaxLength(20)] public string? CodigoReserva { get; set; }
    [MaxLength(300)] public string DescripcionBien { get; set; } = "";
    [MaxLength(2000)] public string Detalle { get; set; } = "";
    [MaxLength(1000)] public string Pedido { get; set; } = "";

    /// <summary>Pendiente o Respondido.</summary>
    [MaxLength(12)] public string Estado { get; set; } = "Pendiente";
    public DateOnly FechaLimiteRespuesta { get; set; }
    [MaxLength(2000)] public string? Respuesta { get; set; }
    public DateTime? FechaRespuesta { get; set; }
}
