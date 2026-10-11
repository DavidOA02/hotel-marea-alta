namespace HotelApi.Services;

/// <summary>Fecha y hora oficial del Perú (UTC−5, sin horario de verano).</summary>
public static class HoraPeru
{
    private static readonly TimeZoneInfo Zona = ObtenerZona();

    private static TimeZoneInfo ObtenerZona()
    {
        // "America/Lima" en Linux/macOS, "SA Pacific Standard Time" en Windows
        foreach (var id in new[] { "America/Lima", "SA Pacific Standard Time" })
        {
            try { return TimeZoneInfo.FindSystemTimeZoneById(id); }
            catch (TimeZoneNotFoundException) { }
            catch (InvalidTimeZoneException) { }
        }
        return TimeZoneInfo.CreateCustomTimeZone("Peru", TimeSpan.FromHours(-5), "Hora de Perú", "Hora de Perú");
    }

    public static DateTime Ahora => TimeZoneInfo.ConvertTimeFromUtc(DateTime.UtcNow, Zona);
    public static DateOnly Hoy => DateOnly.FromDateTime(Ahora);

    /// <summary>Suma días hábiles (lunes a viernes). No descuenta feriados.</summary>
    public static DateOnly SumarDiasHabiles(DateOnly desde, int dias)
    {
        var fecha = desde;
        while (dias > 0)
        {
            fecha = fecha.AddDays(1);
            if (fecha.DayOfWeek is not (DayOfWeek.Saturday or DayOfWeek.Sunday)) dias--;
        }
        return fecha;
    }
}
