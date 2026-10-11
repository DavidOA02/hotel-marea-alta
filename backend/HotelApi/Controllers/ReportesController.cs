using HotelApi.Data;
using HotelApi.Models;
using HotelApi.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace HotelApi.Controllers;

/// <summary>Reportes de gestión por rango de fechas (solo administradores).</summary>
[Route("api/gestion/reportes")]
[Authorize(Roles = Roles.Administrador)]
public class ReportesController : GestionControllerBase
{
    private static readonly string[] Dias = { "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo" };
    public ReportesController(HotelDbContext db) : base(db) { }

    /// <summary>Ocupación, ADR, RevPAR, ingresos, canales, residencia, pagos y mejores clientes.</summary>
    /// <param name="desde">Inicio (por defecto, hace 29 días).</param>
    /// <param name="hasta">Fin, inclusive (por defecto, hoy).</param>
    [HttpGet]
    public async Task<IActionResult> Get([FromQuery] DateOnly? desde, [FromQuery] DateOnly? hasta, CancellationToken ct)
    {
        var hoy = HoraPeru.Hoy;
        var d = desde ?? hoy.AddDays(-29);
        var h = hasta ?? hoy;
        if (h < d) return Error(400, "La fecha final debe ser posterior a la inicial.", "hasta");
        if (h.DayNumber - d.DayNumber > 731) return Error(400, "El rango máximo es de 2 años.", "hasta");
        var hastaExcl = h.AddDays(1);
        var dias = hastaExcl.DayNumber - d.DayNumber;

        var tipos = await Db.TiposHabitacion.AsNoTracking()
            .Select(t => new { t.Nombre, Operativas = t.Habitaciones.Count(x => x.Estado == EstadosHabitacion.Operativa) })
            .ToListAsync(ct);
        var operativas = tipos.Sum(t => t.Operativas);

        var res = await Db.Reservas.AsNoTracking()
            .Where(r => r.FechaEntrada < hastaExcl && r.FechaSalida > d)
            .Select(r => new
            {
                r.FechaEntrada, r.FechaSalida, r.Noches, r.Total, r.Igv, r.ExoneradoIgv, r.Estado, r.Canal, r.FechaReserva,
                r.ClienteId, Cliente = r.Cliente!.Nombres + " " + r.Cliente.Apellidos, Residencia = r.Cliente.Residencia,
                Tipo = r.Habitacion!.TipoHabitacion!.Nombre
            })
            .ToListAsync(ct);

        bool Efectiva(string e) => e is EstadosReserva.Confirmada or EstadosReserva.CheckIn or EstadosReserva.CheckOut;
        var efectivas = res.Where(r => Efectiva(r.Estado)).ToList();
        var metricas = efectivas.Select(r => new EstadiaMetrica(r.FechaEntrada, r.FechaSalida, r.Noches, r.Total)).ToList();

        var (nochesOcupadas, ingresos) = Metricas.Sumar(metricas, d, hastaExcl);
        var nochesDisponibles = operativas * dias;

        // Reservas cuya llegada cae en el rango
        var llegan = res.Where(r => r.FechaEntrada >= d && r.FechaEntrada < hastaExcl).ToList();
        var lleganEfectivas = llegan.Where(r => Efectiva(r.Estado)).ToList();
        var canceladas = llegan.Count(r => r.Estado == EstadosReserva.Cancelada);
        var noShow = llegan.Count(r => r.Estado == EstadosReserva.NoShow);

        var porTipo = tipos.Select(t =>
        {
            var (n, i) = Metricas.Sumar(efectivas.Where(r => r.Tipo == t.Nombre)
                .Select(r => new EstadiaMetrica(r.FechaEntrada, r.FechaSalida, r.Noches, r.Total)), d, hastaExcl);
            return new { tipo = t.Nombre, habitaciones = t.Operativas, noches = n, ingresos = i,
                ocupacion = Metricas.Div(n, t.Operativas * dias), adr = Metricas.Div(i, n, 2) };
        }).OrderByDescending(x => x.ingresos).ToList();

        var porMes = new List<object>();
        for (var m = new DateOnly(d.Year, d.Month, 1); m < hastaExcl; m = m.AddMonths(1))
        {
            var ini = m < d ? d : m;
            var fin = m.AddMonths(1) > hastaExcl ? hastaExcl : m.AddMonths(1);
            var (n, i) = Metricas.Sumar(metricas, ini, fin);
            var disp = operativas * (fin.DayNumber - ini.DayNumber);
            porMes.Add(new { mes = $"{m:yyyy-MM}", noches = n, ingresos = i, ocupacion = Metricas.Div(n, disp),
                adr = Metricas.Div(i, n, 2), revpar = Metricas.Div(i, disp, 2) });
        }

        // Ocupación promedio por día de la semana
        var porDia = new int[7]; var cuentaDia = new int[7];
        for (var f = d; f < hastaExcl; f = f.AddDays(1))
        {
            var idx = ((int)f.DayOfWeek + 6) % 7;   // lunes = 0
            porDia[idx] += metricas.Count(e => e.Entrada <= f && e.Salida > f);
            cuentaDia[idx]++;
        }

        var inicio = d.ToDateTime(TimeOnly.MinValue);
        var fin2 = hastaExcl.ToDateTime(TimeOnly.MinValue);
        var pagos = await Db.Pagos.AsNoTracking()
            .Where(p => p.Estado == EstadosPago.Aprobado && p.FechaPago >= inicio && p.FechaPago < fin2)
            .Select(p => new { p.Metodo, p.MontoSoles }).ToListAsync(ct);

        return Ok(new
        {
            desde = d, hasta = h, dias, habitaciones = operativas,
            nochesDisponibles, nochesOcupadas, ingresos,
            ocupacion = Metricas.Div(nochesOcupadas, nochesDisponibles),
            adr = Metricas.Div(ingresos, nochesOcupadas, 2),
            revpar = Metricas.Div(ingresos, nochesDisponibles, 2),
            reservas = llegan.Count,
            reservasEfectivas = lleganEfectivas.Count,
            canceladas, noShow,
            tasaCancelacion = Metricas.Div(canceladas + noShow, llegan.Count),
            estadiaPromedio = lleganEfectivas.Count == 0 ? 0 : Math.Round(lleganEfectivas.Average(r => (decimal)r.Noches), 2),
            anticipacionPromedio = lleganEfectivas.Count == 0 ? 0
                : Math.Round(lleganEfectivas.Average(r => (decimal)(r.FechaEntrada.DayNumber - DateOnly.FromDateTime(r.FechaReserva).DayNumber)), 1),
            igv = lleganEfectivas.Sum(r => r.Igv),
            ventasExoneradas = lleganEfectivas.Where(r => r.ExoneradoIgv).Sum(r => r.Total),
            cobrado = pagos.Sum(p => p.MontoSoles),
            porTipo,
            porMes,
            porDiaSemana = Enumerable.Range(0, 7).Select(i => new
            {
                dia = Dias[i], ocupacion = cuentaDia[i] == 0 ? 0 : Metricas.Div((decimal)porDia[i] / cuentaDia[i], operativas)
            }),
            porCanal = lleganEfectivas.GroupBy(r => r.Canal)
                .Select(g => new { canal = g.Key, reservas = g.Count(), ingresos = g.Sum(r => r.Total) }).OrderByDescending(x => x.reservas),
            porResidencia = lleganEfectivas.GroupBy(r => r.Residencia == "EXT" ? "Extranjeros" : "Residentes")
                .Select(g => new { residencia = g.Key, reservas = g.Count(), ingresos = g.Sum(r => r.Total) }),
            pagosPorMetodo = pagos.GroupBy(p => p.Metodo)
                .Select(g => new { metodo = g.Key, monto = g.Sum(p => p.MontoSoles), cantidad = g.Count() }).OrderByDescending(x => x.monto),
            topClientes = lleganEfectivas.GroupBy(r => new { r.ClienteId, r.Cliente })
                .Select(g => new { clienteId = g.Key.ClienteId, cliente = g.Key.Cliente, reservas = g.Count(), total = g.Sum(r => r.Total) })
                .OrderByDescending(x => x.total).Take(10)
        });
    }
}
