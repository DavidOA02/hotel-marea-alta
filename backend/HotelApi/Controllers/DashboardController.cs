using HotelApi.Data;
using HotelApi.Models;
using HotelApi.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace HotelApi.Controllers;

/// <summary>Dashboard operativo (administrador y recepcionista).</summary>
[Route("api/gestion/dashboard")]
public class DashboardController : GestionControllerBase
{
    public DashboardController(HotelDbContext db) : base(db) { }

    [HttpGet]
    public async Task<IActionResult> Get(CancellationToken ct)
    {
        var hoy = HoraPeru.Hoy;
        var inicioMes = new DateOnly(hoy.Year, hoy.Month, 1);
        var finMes = inicioMes.AddMonths(1);
        var inicio6 = inicioMes.AddMonths(-5);
        var fin14 = hoy.AddDays(14);

        var habitaciones = await Db.Habitaciones.AsNoTracking().Select(h => new { h.Estado, h.EstadoLimpieza }).ToListAsync(ct);
        var operativas = habitaciones.Count(h => h.Estado == EstadosHabitacion.Operativa);

        var est = await Db.Reservas.AsNoTracking()
            .Where(r => (r.Estado == EstadosReserva.Confirmada || r.Estado == EstadosReserva.CheckIn || r.Estado == EstadosReserva.CheckOut)
                        && r.FechaEntrada < fin14 && r.FechaSalida > inicio6)
            .Select(r => new { r.FechaEntrada, r.FechaSalida, r.Noches, r.Total, r.Estado })
            .ToListAsync(ct);
        var metricas = est.Select(x => new EstadiaMetrica(x.FechaEntrada, x.FechaSalida, x.Noches, x.Total)).ToList();
        bool Activa(string e) => e == EstadosReserva.Confirmada || e == EstadosReserva.CheckIn;

        var ocupadasHoy = est.Count(x => Activa(x.Estado) && x.FechaEntrada <= hoy && x.FechaSalida > hoy);
        var proximos14 = Enumerable.Range(0, 14).Select(i =>
        {
            var d = hoy.AddDays(i);
            var n = est.Count(x => Activa(x.Estado) && x.FechaEntrada <= d && x.FechaSalida > d);
            return new { fecha = d, ocupadas = n, ocupacion = Metricas.Div(n, operativas) };
        }).ToList();

        var meses = Enumerable.Range(0, 6).Select(i =>
        {
            var m = inicio6.AddMonths(i);
            var (noches, ingreso) = Metricas.Sumar(metricas, m, m.AddMonths(1));
            var disponibles = operativas * (m.AddMonths(1).DayNumber - m.DayNumber);
            return new { mes = $"{m:yyyy-MM}", ingresos = ingreso, noches, ocupacion = Metricas.Div(noches, disponibles) };
        }).ToList();

        var inicioHoy = hoy.ToDateTime(TimeOnly.MinValue);
        var inicioMesDt = inicioMes.ToDateTime(TimeOnly.MinValue);
        var pagosMes = await Db.Pagos.AsNoTracking()
            .Where(p => p.Estado == EstadosPago.Aprobado && p.FechaPago >= inicioMesDt)
            .Select(p => new { p.FechaPago, p.MontoSoles }).ToListAsync(ct);

        var saldos = await Db.Reservas.AsNoTracking().Where(r => r.Estado == EstadosReserva.CheckIn)
            .Select(r => r.Total - r.Pagos.Where(p => p.Estado == EstadosPago.Aprobado).Sum(p => p.MontoSoles)).ToListAsync(ct);

        var hace30 = hoy.AddDays(-30).ToDateTime(TimeOnly.MinValue);
        var canales = await Db.Reservas.AsNoTracking().Where(r => r.FechaReserva >= hace30)
            .GroupBy(r => r.Canal).Select(g => new { canal = g.Key, reservas = g.Count() }).ToListAsync(ct);

        var llegadasHoy = await Db.Reservas.CountAsync(r => r.Estado == EstadosReserva.Confirmada && r.FechaEntrada <= hoy && r.FechaSalida > hoy, ct);
        var salidasHoy = await Db.Reservas.CountAsync(r => r.Estado == EstadosReserva.CheckIn && r.FechaSalida <= hoy, ct);
        var enCasa = await Db.Reservas.CountAsync(r => r.Estado == EstadosReserva.CheckIn, ct);
        var reservasHoy = await Db.Reservas.CountAsync(r => r.FechaReserva >= inicioHoy, ct);
        var reclamos = await Db.Reclamaciones.CountAsync(r => r.Estado == "Pendiente", ct);
        var limite = hoy.AddDays(3);
        var porVencer = await Db.Reclamaciones.CountAsync(r => r.Estado == "Pendiente" && r.FechaLimiteRespuesta <= limite, ct);
        var ultimas = await Db.Reservas.AsNoTracking().OrderByDescending(r => r.FechaReserva).Take(8)
            .Select(ReservasGestionController.ALista).ToListAsync(ct);

        var mesActual = meses[^1];
        return Ok(new
        {
            hoy,
            habitaciones = new
            {
                operativas,
                ocupadas = ocupadasHoy,
                libres = Math.Max(0, operativas - ocupadasHoy),
                mantenimiento = habitaciones.Count(h => h.Estado != EstadosHabitacion.Operativa),
                sucias = habitaciones.Count(h => h.Estado == EstadosHabitacion.Operativa && h.EstadoLimpieza == EstadosLimpieza.Sucia)
            },
            ocupacionHoy = Metricas.Div(ocupadasHoy, operativas),
            llegadasHoy, salidasHoy, enCasa, reservasHoy,
            ingresosMes = mesActual.ingresos,
            adrMes = Metricas.Div(mesActual.ingresos, mesActual.noches, 2),
            ocupacionMes = mesActual.ocupacion,
            cobradoHoy = pagosMes.Where(p => p.FechaPago >= inicioHoy).Sum(p => p.MontoSoles),
            cobradoMes = pagosMes.Sum(p => p.MontoSoles),
            saldoEnCasa = saldos.Where(s => s > 0).Sum(),
            reclamosPendientes = reclamos,
            reclamosPorVencer = porVencer,
            proximos14,
            meses,
            canales,
            ultimas
        });
    }
}
