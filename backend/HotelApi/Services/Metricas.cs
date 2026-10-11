namespace HotelApi.Services;

/// <summary>Una estadía reducida a lo necesario para calcular indicadores hoteleros.</summary>
public record EstadiaMetrica(DateOnly Entrada, DateOnly Salida, int Noches, decimal Total);

/// <summary>
/// Indicadores hoteleros estándar. El ingreso de cada reserva se prorratea por
/// noche, así una estadía que cruza dos meses suma a cada mes lo que le toca.
/// Ocupación = noches ocupadas ÷ noches disponibles; ADR = ingreso ÷ noches
/// ocupadas; RevPAR = ingreso ÷ noches disponibles.
/// </summary>
public static class Metricas
{
    /// <summary>Noches e ingreso de una estadía dentro de [desde, hastaExclusivo).</summary>
    public static (int Noches, decimal Ingreso) EnRango(EstadiaMetrica e, DateOnly desde, DateOnly hastaExclusivo)
    {
        var inicio = e.Entrada > desde ? e.Entrada : desde;
        var fin = e.Salida < hastaExclusivo ? e.Salida : hastaExclusivo;
        var noches = fin.DayNumber - inicio.DayNumber;
        if (noches <= 0 || e.Noches <= 0) return (0, 0m);
        return (noches, Math.Round(e.Total / e.Noches * noches, 2));
    }

    public static (int Noches, decimal Ingreso) Sumar(IEnumerable<EstadiaMetrica> estadias, DateOnly desde, DateOnly hastaExclusivo)
    {
        int n = 0; decimal i = 0;
        foreach (var e in estadias)
        {
            var (a, b) = EnRango(e, desde, hastaExclusivo);
            n += a; i += b;
        }
        return (n, i);
    }

    public static decimal Div(decimal a, decimal b, int decimales = 4) => b == 0 ? 0 : Math.Round(a / b, decimales);
}
