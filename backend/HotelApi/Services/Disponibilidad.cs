using HotelApi.Data;
using HotelApi.Models;
using Microsoft.EntityFrameworkCore;

namespace HotelApi.Services;

/// <summary>
/// Reglas de inventario. Una habitación está ocupada en un rango si tiene una
/// reserva Confirmada o en CheckIn que se cruza con las fechas pedidas
/// (la fecha de salida queda libre para el siguiente huésped).
/// </summary>
public static class Disponibilidad
{
    public static IQueryable<Habitacion> Libres(HotelDbContext db, DateOnly entrada, DateOnly salida) =>
        db.Habitaciones.Where(h =>
            h.Estado == EstadosHabitacion.Operativa &&
            !h.Reservas.Any(r =>
                (r.Estado == EstadosReserva.Confirmada || r.Estado == EstadosReserva.CheckIn) &&
                r.FechaEntrada < salida && r.FechaSalida > entrada));

    public static Task<Habitacion?> PrimeraLibreAsync(HotelDbContext db, int tipoId, DateOnly entrada, DateOnly salida, CancellationToken ct) =>
        Libres(db, entrada, salida)
            .Where(h => h.TipoHabitacionId == tipoId)
            .OrderBy(h => h.Piso).ThenBy(h => h.Numero)
            .FirstOrDefaultAsync(ct);

    /// <summary>Valida un rango de fechas. Devuelve mensaje y campo, o (null, null).</summary>
    public static (string? Mensaje, string? Campo) ValidarFechas(DateOnly entrada, DateOnly salida)
    {
        var hoy = HoraPeru.Hoy;
        if (entrada == default) return ("Elige la fecha de llegada.", "fechaEntrada");
        if (salida == default) return ("Elige la fecha de salida.", "fechaSalida");
        if (entrada < hoy) return ("La fecha de llegada no puede ser anterior a hoy.", "fechaEntrada");
        if (salida <= entrada) return ("La salida debe ser al menos un día después de la llegada.", "fechaSalida");
        if (salida.DayNumber - entrada.DayNumber > MaxNoches) return ($"Para estadías de más de {MaxNoches} noches escríbenos por WhatsApp.", "fechaSalida");
        if (entrada > hoy.AddMonths(18)) return ("Aceptamos reservas con hasta 18 meses de anticipación.", "fechaEntrada");
        return (null, null);
    }

    public const int MaxNoches = 30;
}
