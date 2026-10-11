using System.Text.RegularExpressions;

namespace HotelApi.Services;

/// <summary>Validación de documentos de identidad peruanos y extranjeros.</summary>
public static partial class Documentos
{
    [GeneratedRegex(@"^\d{8}$")] private static partial Regex Dni();
    [GeneratedRegex(@"^[A-Za-z0-9]{9,12}$")] private static partial Regex Ce();
    [GeneratedRegex(@"^[A-Za-z0-9]{6,12}$")] private static partial Regex Pasaporte();
    [GeneratedRegex(@"^(10|15|17|20)\d{9}$")] private static partial Regex Ruc();

    /// <summary>Devuelve un mensaje de error o null si el documento es válido.</summary>
    public static string? Validar(string tipo, string numero) => tipo switch
    {
        "DNI" => Dni().IsMatch(numero) ? null : "El DNI debe tener 8 dígitos.",
        "CE" => Ce().IsMatch(numero) ? null : "El carné de extranjería debe tener entre 9 y 12 caracteres.",
        "PAS" => Pasaporte().IsMatch(numero) ? null : "El pasaporte debe tener entre 6 y 12 letras o números.",
        "RUC" => Ruc().IsMatch(numero) ? null : "El RUC debe tener 11 dígitos.",
        _ => "Tipo de documento no válido."
    };
}
