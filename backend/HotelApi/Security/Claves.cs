using System.Security.Cryptography;
using System.Text;
using HotelApi.Models;

namespace HotelApi.Security;

/// <summary>Contraseñas con PBKDF2-SHA256 (100 000 iteraciones, sal aleatoria de 16 bytes).</summary>
public static class Claves
{
    private const int Iteraciones = 100_000;
    private const string Prefijo = "PBKDF2-SHA256";

    public static string Hash(string clave)
    {
        var sal = RandomNumberGenerator.GetBytes(16);
        var hash = Rfc2898DeriveBytes.Pbkdf2(clave, sal, Iteraciones, HashAlgorithmName.SHA256, 32);
        return $"{Prefijo}${Iteraciones}${Convert.ToBase64String(sal)}${Convert.ToBase64String(hash)}";
    }

    public static bool Verificar(string clave, string almacenado)
    {
        var partes = almacenado.Split('$');
        if (partes.Length != 4 || partes[0] != Prefijo || !int.TryParse(partes[1], out var iter)) return false;
        try
        {
            var sal = Convert.FromBase64String(partes[2]);
            var esperado = Convert.FromBase64String(partes[3]);
            var calculado = Rfc2898DeriveBytes.Pbkdf2(clave, sal, iter, HashAlgorithmName.SHA256, esperado.Length);
            return CryptographicOperations.FixedTimeEquals(calculado, esperado);
        }
        catch (FormatException) { return false; }
    }

    /// <summary>Devuelve un mensaje si la contraseña es débil, o null si es aceptable.</summary>
    public static string? ValidarFortaleza(string? clave) =>
        clave is null || clave.Length < 8 || !clave.Any(char.IsDigit) || !clave.Any(char.IsLetter)
            ? "La contraseña debe tener al menos 8 caracteres e incluir letras y números."
            : null;

    /// <summary>
    /// Sello de seguridad: cambia si cambian la contraseña, el rol o el estado del usuario.
    /// Va dentro del token; si ya no coincide, el token deja de ser válido.
    /// </summary>
    public static string Sello(Usuario u) =>
        Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes($"{u.ClaveHash}|{u.Activo}|{u.Rol}")))[..16];
}
