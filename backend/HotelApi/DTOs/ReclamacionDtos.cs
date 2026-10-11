using System.ComponentModel.DataAnnotations;

namespace HotelApi.DTOs;

public class CrearReclamacionDto
{
    [Required, RegularExpression("^(Reclamo|Queja)$", ErrorMessage = "Indica si es reclamo o queja.")]
    public string Tipo { get; set; } = "Reclamo";

    [Required(ErrorMessage = "Escribe tus nombres y apellidos."), StringLength(160)]
    public string NombreCompleto { get; set; } = "";

    [Required, RegularExpression("^(DNI|CE|PAS|RUC)$", ErrorMessage = "Tipo de documento no válido.")]
    public string TipoDocumento { get; set; } = "DNI";

    [Required(ErrorMessage = "Escribe tu número de documento.")]
    public string NumeroDocumento { get; set; } = "";

    [Required(ErrorMessage = "Escribe tu domicilio."), StringLength(200)]
    public string Domicilio { get; set; } = "";

    [Required(ErrorMessage = "Escribe tu teléfono."), StringLength(20)]
    public string Telefono { get; set; } = "";

    [Required(ErrorMessage = "Escribe tu correo."), EmailAddress(ErrorMessage = "Escribe un correo válido."), StringLength(150)]
    public string Email { get; set; } = "";

    public bool EsMenor { get; set; }
    [StringLength(160)] public string? Apoderado { get; set; }

    [Required, RegularExpression("^(Producto|Servicio)$")]
    public string BienTipo { get; set; } = "Servicio";

    [Range(0, 1_000_000, ErrorMessage = "El monto no es válido.")]
    public decimal? MontoReclamado { get; set; }

    [StringLength(20)] public string? CodigoReserva { get; set; }

    [Required(ErrorMessage = "Describe el producto o servicio contratado."), StringLength(300)]
    public string DescripcionBien { get; set; } = "";

    [Required(ErrorMessage = "Escribe el detalle de tu reclamación."), StringLength(2000)]
    public string Detalle { get; set; } = "";

    [Required(ErrorMessage = "Indica tu pedido."), StringLength(1000)]
    public string Pedido { get; set; } = "";

    public bool DeclaraVeracidad { get; set; }
    public bool AceptaPrivacidad { get; set; }
}

public record ReclamacionRegistradaDto(string Numero, DateTime Fecha, DateOnly FechaLimiteRespuesta, string Tipo, string Mensaje);

public class SuscripcionDto
{
    [Required(ErrorMessage = "Escribe tu correo."), EmailAddress(ErrorMessage = "Escribe un correo válido."), StringLength(150)]
    public string Email { get; set; } = "";
}
