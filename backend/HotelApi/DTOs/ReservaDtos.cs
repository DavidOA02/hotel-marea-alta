using System.ComponentModel.DataAnnotations;

namespace HotelApi.DTOs;

/// <summary>Datos que envía el formulario de reserva de la web.</summary>
public class CrearReservaDto
{
    [Required(ErrorMessage = "Elige un tipo de habitación.")]
    public string TipoHabitacion { get; set; } = "";

    public DateOnly FechaEntrada { get; set; }
    public DateOnly FechaSalida { get; set; }

    [Range(1, 6, ErrorMessage = "El número de huéspedes no es válido.")]
    public int Huespedes { get; set; } = 2;

    [Required, RegularExpression("^(PE|EXT)$", ErrorMessage = "Indica si resides en el Perú o eres turista extranjero.")]
    public string Residencia { get; set; } = "PE";

    [Required(ErrorMessage = "Escribe tus nombres."), StringLength(80)]
    public string Nombres { get; set; } = "";

    [Required(ErrorMessage = "Escribe tus apellidos."), StringLength(80)]
    public string Apellidos { get; set; } = "";

    [Required, RegularExpression("^(DNI|CE|PAS)$", ErrorMessage = "Tipo de documento no válido.")]
    public string TipoDocumento { get; set; } = "DNI";

    [Required(ErrorMessage = "Escribe tu número de documento.")]
    public string NumeroDocumento { get; set; } = "";

    [Required, RegularExpression(@"^\d{1,3}$", ErrorMessage = "Código de país no válido.")]
    public string CodigoPais { get; set; } = "51";

    [Required(ErrorMessage = "Escribe tu celular."), RegularExpression(@"^[\d\s\-()]{6,22}$", ErrorMessage = "Escribe un número de teléfono válido.")]
    public string Telefono { get; set; } = "";

    [Required(ErrorMessage = "Escribe tu correo."), EmailAddress(ErrorMessage = "Escribe un correo válido."), StringLength(150)]
    public string Email { get; set; } = "";

    [StringLength(30)] public string? HoraLlegada { get; set; }
    [StringLength(500)] public string? Notas { get; set; }

    public bool AceptaPrivacidad { get; set; }
    public bool AceptaPublicidad { get; set; }

    [RegularExpression("^(Web|WhatsApp|Telefono|Recepcion)$", ErrorMessage = "Canal no válido.")]
    public string Canal { get; set; } = "Web";
}

public record ReservaCreadaDto(
    string Codigo, string Estado, string TipoHabitacion, string Habitacion,
    DateOnly FechaEntrada, DateOnly FechaSalida, int Noches, int Huespedes,
    decimal Subtotal, decimal Igv, decimal Total, bool ExoneradoIgv, string Mensaje);

/// <summary>Lo que ve el huésped al consultar su reserva.</summary>
public record ReservaPublicaDto(
    string Codigo, string Estado, string Titular, string TipoHabitacion, string Habitacion,
    DateOnly FechaEntrada, DateOnly FechaSalida, int Noches, int Huespedes,
    decimal Subtotal, decimal Igv, decimal Total, bool ExoneradoIgv, decimal Pagado,
    DateTime FechaReserva, bool PuedeCancelar, string? MotivoNoCancelable);

public class CancelarReservaDto
{
    [Required(ErrorMessage = "Escribe el correo de la reserva."), EmailAddress(ErrorMessage = "Escribe un correo válido.")]
    public string Email { get; set; } = "";
}

/// <summary>Disponibilidad y cotización por tipo de habitación.</summary>
public record DisponibilidadDto(
    string Codigo, string Nombre, int Capacidad, decimal PrecioNoche, int Disponibles,
    int Noches, decimal Subtotal, decimal Igv, decimal Total);

public record TipoHabitacionDto(
    string Codigo, string Nombre, string? Descripcion, int Capacidad, int MetrosCuadrados,
    decimal PrecioNoche, int TotalHabitaciones);
