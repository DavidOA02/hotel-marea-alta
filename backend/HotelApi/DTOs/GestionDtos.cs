using System.ComponentModel.DataAnnotations;

namespace HotelApi.DTOs;

// ---------------- Autenticación y usuarios ----------------
public class LoginDto
{
    [Required(ErrorMessage = "Escribe tu correo."), EmailAddress(ErrorMessage = "Escribe un correo válido.")]
    public string Email { get; set; } = "";
    [Required(ErrorMessage = "Escribe tu contraseña.")]
    public string Clave { get; set; } = "";
}

public class RenovarDto
{
    [Required(ErrorMessage = "Falta el refreshToken.")] public string RefreshToken { get; set; } = "";
}

public class CambiarClaveDto
{
    [Required(ErrorMessage = "Escribe tu contraseña actual.")] public string ClaveActual { get; set; } = "";
    [Required(ErrorMessage = "Escribe la nueva contraseña.")] public string ClaveNueva { get; set; } = "";
}

public record UsuarioDto(int Id, string Nombre, string Email, string Rol, bool Activo, bool DebeCambiarClave,
    DateTime? UltimoAcceso, DateTime FechaCreacion);

public class GuardarUsuarioDto
{
    [Required(ErrorMessage = "Escribe el nombre."), StringLength(100)] public string Nombre { get; set; } = "";
    [Required(ErrorMessage = "Escribe el correo."), EmailAddress(ErrorMessage = "Escribe un correo válido."), StringLength(150)]
    public string Email { get; set; } = "";
    [Required, RegularExpression("^(Administrador|Recepcionista)$", ErrorMessage = "Rol no válido.")]
    public string Rol { get; set; } = "Recepcionista";
    public bool Activo { get; set; } = true;
    /// <summary>Obligatoria al crear. Al editar, vacía = no cambia.</summary>
    public string? Clave { get; set; }
}

// ---------------- Habitaciones y tipos ----------------
public class GuardarHabitacionDto
{
    [Required(ErrorMessage = "Escribe el número."), RegularExpression(@"^[0-9A-Za-z\-]{1,10}$", ErrorMessage = "Número no válido.")]
    public string Numero { get; set; } = "";
    [Range(0, 50, ErrorMessage = "Piso no válido.")] public int Piso { get; set; }
    [Required(ErrorMessage = "Elige el tipo.")] public string TipoHabitacion { get; set; } = "";
    [Required, RegularExpression("^(Operativa|Mantenimiento|FueraDeServicio)$", ErrorMessage = "Estado no válido.")]
    public string Estado { get; set; } = "Operativa";
    [StringLength(300)] public string? Notas { get; set; }
}

public class CambiarLimpiezaDto
{
    [Required, RegularExpression("^(Limpia|Sucia)$", ErrorMessage = "Estado de limpieza no válido.")]
    public string EstadoLimpieza { get; set; } = "Limpia";
}

public class GuardarTipoDto
{
    [Required, RegularExpression("^[a-z0-9-]{2,20}$", ErrorMessage = "El código usa minúsculas, números y guiones.")]
    public string Codigo { get; set; } = "";
    [Required(ErrorMessage = "Escribe el nombre."), StringLength(60)] public string Nombre { get; set; } = "";
    [StringLength(300)] public string? Descripcion { get; set; }
    [Range(1, 8, ErrorMessage = "La capacidad debe estar entre 1 y 8.")] public int Capacidad { get; set; } = 2;
    [Range(5, 500, ErrorMessage = "Metros cuadrados no válidos.")] public int MetrosCuadrados { get; set; } = 25;
    [Range(1, 100_000, ErrorMessage = "La tarifa debe ser mayor a cero.")] public decimal PrecioNoche { get; set; }
    public bool Activo { get; set; } = true;
}

public record HabitacionGestionDto(
    int Id, string Numero, int Piso, int TipoId, string TipoCodigo, string Tipo, int Capacidad, decimal PrecioNoche,
    string Estado, string EstadoLimpieza, string? Notas, string Situacion, string? Huesped, string? CodigoReserva,
    DateOnly? SalidaPrevista, DateOnly? ProximaLlegada, int TotalReservas);

// ---------------- Clientes ----------------
public class GuardarClienteDto
{
    [Required(ErrorMessage = "Escribe los nombres."), StringLength(80)] public string Nombres { get; set; } = "";
    [Required(ErrorMessage = "Escribe los apellidos."), StringLength(80)] public string Apellidos { get; set; } = "";
    [Required, RegularExpression("^(DNI|CE|PAS)$", ErrorMessage = "Tipo de documento no válido.")] public string TipoDocumento { get; set; } = "DNI";
    [Required(ErrorMessage = "Escribe el número de documento.")] public string NumeroDocumento { get; set; } = "";
    [Required(ErrorMessage = "Escribe el correo."), EmailAddress(ErrorMessage = "Escribe un correo válido.")] public string Email { get; set; } = "";
    [Required, RegularExpression(@"^\d{1,3}$", ErrorMessage = "Código de país no válido.")] public string CodigoPais { get; set; } = "51";
    [Required(ErrorMessage = "Escribe el teléfono.")] public string Telefono { get; set; } = "";
    [Required, RegularExpression("^(PE|EXT)$")] public string Residencia { get; set; } = "PE";
    public bool AceptaPublicidad { get; set; }
    [StringLength(500)] public string? Notas { get; set; }
}

public record ClienteResumenDto(int Id, string Nombres, string Apellidos, string TipoDocumento, string NumeroDocumento,
    string Email, string CodigoPais, string Telefono, string Residencia, bool AceptaPublicidad, string? Notas,
    DateTime FechaRegistro, int Reservas, int Estadias, decimal TotalGastado, DateOnly? UltimaLlegada);

// ---------------- Reservas del panel ----------------
public class CrearReservaPanelDto
{
    public int? ClienteId { get; set; }
    /// <summary>Datos del cliente nuevo (si no se envía ClienteId).</summary>
    public GuardarClienteDto? Cliente { get; set; }
    [Required(ErrorMessage = "Elige el tipo de habitación.")] public string TipoHabitacion { get; set; } = "";
    public int? HabitacionId { get; set; }
    public DateOnly FechaEntrada { get; set; }
    public DateOnly FechaSalida { get; set; }
    [Range(1, 8, ErrorMessage = "Número de huéspedes no válido.")] public int Huespedes { get; set; } = 2;
    [Required, RegularExpression("^(PE|EXT)$")] public string Residencia { get; set; } = "PE";
    [Required, RegularExpression("^(Telefono|WhatsApp|Recepcion|Web)$", ErrorMessage = "Canal no válido.")] public string Canal { get; set; } = "Recepcion";
    [StringLength(30)] public string? HoraLlegada { get; set; }
    [StringLength(500)] public string? Notas { get; set; }
    /// <summary>Walk-in: registra la llegada en el mismo momento (solo si la llegada es hoy).</summary>
    public bool CheckInInmediato { get; set; }
}

public class RegistrarPagoDto
{
    [Range(0.01, 1_000_000, ErrorMessage = "El monto debe ser mayor a cero.")] public decimal Monto { get; set; }
    [Required, RegularExpression("^(PEN|USD)$", ErrorMessage = "Moneda no válida.")] public string Moneda { get; set; } = "PEN";
    [Required, RegularExpression("^(Tarjeta|Yape|Plin|Transferencia|Efectivo)$", ErrorMessage = "Método de pago no válido.")]
    public string Metodo { get; set; } = "";
    [Range(1, 10, ErrorMessage = "El tipo de cambio no es válido.")] public decimal? TipoCambio { get; set; }
    [StringLength(60)] public string? Referencia { get; set; }
}

public class AnularPagoDto
{
    [Required(ErrorMessage = "Indica el motivo."), StringLength(200, MinimumLength = 5, ErrorMessage = "El motivo debe tener al menos 5 caracteres.")]
    public string Motivo { get; set; } = "";
}

public class CheckOutDto
{
    /// <summary>Solo administradores: permite cerrar con saldo pendiente.</summary>
    public bool ForzarConSaldo { get; set; }
}

public record ReservaListaDto(
    string Codigo, string Estado, string Canal, int ClienteId, string Cliente, string Documento, string Email, string Telefono,
    string Residencia, string TipoHabitacion, string Habitacion, DateOnly FechaEntrada, DateOnly FechaSalida,
    int Noches, int Huespedes, decimal Subtotal, decimal Igv, decimal Total, decimal Pagado, decimal Saldo, bool ExoneradoIgv,
    string? HoraLlegada, string? Notas, DateTime FechaReserva, DateTime? FechaCheckIn, DateTime? FechaCheckOut, string? RegistradoPor);

public record PagoDto(int Id, string CodigoReserva, string Cliente, decimal Monto, string Moneda, decimal? TipoCambio,
    decimal MontoSoles, string Metodo, string? Referencia, string Estado, DateTime FechaPago, string? RegistradoPor, string? MotivoAnulacion);

public class ResponderReclamacionDto
{
    [Required(ErrorMessage = "Escribe la respuesta."), StringLength(2000, MinimumLength = 10, ErrorMessage = "La respuesta debe tener al menos 10 caracteres.")]
    public string Respuesta { get; set; } = "";
}
