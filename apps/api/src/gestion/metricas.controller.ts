import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { diasEntre, dividir, Estadia, hoyLima, redondear, sumarDias, sumarEstadias } from '@marea/shared';
import { Db } from '../db/db.service';
import { falla } from '../comun/errores';
import { fechaFiltro } from '../comun/filtros';
import { Roles, SesionGuard } from '../auth/guards';
import { SQL_RESERVA } from '../reservas/reservas.service';

const DIAS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
const primeroDeMes = (iso: string) => iso.slice(0, 8) + '01';
const sumarMeses = (iso: string, n: number) => { const [y, m] = iso.split('-').map(Number); const d = new Date(Date.UTC(y, m - 1 + n, 1)); return d.toISOString().slice(0, 10); };

/** Dashboard (todos) y reportes de gestión (administrador). Ocupación, ADR y RevPAR prorrateados por noche. */
@Controller('gestion')
@UseGuards(SesionGuard)
export class MetricasController {
  constructor(private readonly db: Db) {}

  private estadias(desde: string, hastaExcl: string) {
    return this.db.query<any>(`SELECT r.fecha_entrada AS entrada, r.fecha_salida AS salida, r.noches, r.total, r.estado, r.canal, r.igv, r.exonerado_igv,
      r.fecha_reserva, r.cliente_id, c.nombres || ' ' || c.apellidos AS cliente, c.residencia, t.nombre AS tipo
      FROM reservas r JOIN clientes c ON c.id = r.cliente_id JOIN habitaciones h ON h.id = r.habitacion_id JOIN tipos_habitacion t ON t.id = h.tipo_habitacion_id
      WHERE r.fecha_entrada < $2 AND r.fecha_salida > $1`, [desde, hastaExcl]);
  }

  @Get('dashboard')
  async dashboard() {
    const hoy = hoyLima();
    const iniMes = primeroDeMes(hoy);
    const ini6 = sumarMeses(iniMes, -5);
    const habs = await this.db.query<any>('SELECT estado, estado_limpieza FROM habitaciones');
    const operativas = habs.filter(h => h.estado === 'Operativa').length;
    const est = (await this.estadias(ini6, sumarDias(hoy, 14))).filter(e => ['Confirmada', 'CheckIn', 'CheckOut'].includes(e.estado));
    const activa = (e: any) => e.estado === 'Confirmada' || e.estado === 'CheckIn';
    const ocupadas = est.filter(e => activa(e) && e.entrada <= hoy && e.salida > hoy).length;
    const proximos14 = Array.from({ length: 14 }, (_, i) => {
      const f = sumarDias(hoy, i); const n = est.filter(e => activa(e) && e.entrada <= f && e.salida > f).length;
      return { fecha: f, ocupadas: n, ocupacion: dividir(n, operativas) };
    });
    const meses = Array.from({ length: 6 }, (_, i) => {
      const m = sumarMeses(ini6, i), fin = sumarMeses(m, 1);
      const s = sumarEstadias(est as Estadia[], m, fin);
      return { mes: m.slice(0, 7), ingresos: s.ingreso, noches: s.noches, ocupacion: dividir(s.noches, operativas * diasEntre(m, fin)) };
    });
    const mes = meses[5];
    const n = async (sql: string, p: unknown[] = []) => (await this.db.uno<{ n: number }>(sql, p))!.n;
    // Cobrado neto: pagos aprobados menos devoluciones completadas en el mismo periodo
    const cobrado = await this.db.uno<{ hoy: number; mes: number }>(`SELECT
      coalesce(sum(monto) FILTER (WHERE (fecha AT TIME ZONE 'America/Lima')::date = $1), 0) AS hoy,
      coalesce(sum(monto) FILTER (WHERE (fecha AT TIME ZONE 'America/Lima')::date >= $2), 0) AS mes
      FROM (SELECT monto_soles AS monto, fecha_pago AS fecha FROM pagos WHERE estado = 'Aprobado'
            UNION ALL SELECT -monto, fecha_resultado FROM devoluciones WHERE estado = 'Completada') m`, [hoy, iniMes]);
    return {
      hoy,
      habitaciones: { operativas, ocupadas, libres: Math.max(0, operativas - ocupadas), mantenimiento: habs.filter(h => h.estado !== 'Operativa').length,
        sucias: habs.filter(h => h.estado === 'Operativa' && h.estadoLimpieza !== 'Limpia').length },
      ocupacionHoy: dividir(ocupadas, operativas),
      llegadasHoy: await n(`SELECT count(*) AS n FROM reservas WHERE estado = 'Confirmada' AND fecha_entrada <= $1 AND fecha_salida > $1`, [hoy]),
      salidasHoy: await n(`SELECT count(*) AS n FROM reservas WHERE estado = 'CheckIn' AND fecha_salida <= $1`, [hoy]),
      enCasa: await n(`SELECT count(*) AS n FROM reservas WHERE estado = 'CheckIn'`),
      reservasHoy: await n(`SELECT count(*) AS n FROM reservas WHERE (fecha_reserva AT TIME ZONE 'America/Lima')::date = $1`, [hoy]),
      ingresosMes: mes.ingresos, adrMes: dividir(mes.ingresos, mes.noches, 2), ocupacionMes: mes.ocupacion,
      cobradoHoy: cobrado!.hoy, cobradoMes: cobrado!.mes,
      saldoEnCasa: await n(`SELECT coalesce(sum(greatest(r.total - coalesce(pagado_neto(r.id), 0), 0)), 0) AS n
        FROM reservas r WHERE r.estado = 'CheckIn'`),
      reclamosPendientes: await n(`SELECT count(*) AS n FROM reclamaciones WHERE estado = 'Pendiente'`),
      reclamosPorVencer: await n(`SELECT count(*) AS n FROM reclamaciones WHERE estado = 'Pendiente' AND fecha_limite_respuesta <= $1`, [sumarDias(hoy, 3)]),
      proximos14, meses,
      canales: await this.db.query(`SELECT canal, count(*) AS reservas FROM reservas WHERE fecha_reserva >= now() - interval '30 days' GROUP BY canal ORDER BY 2 DESC`),
      ultimas: await this.db.query(`${SQL_RESERVA} ORDER BY r.fecha_reserva DESC LIMIT 8`)
    };
  }

  @Get('reportes') @Roles('Administrador')
  async reportes(@Query('desde') desde?: string, @Query('hasta') hasta?: string) {
    const hoy = hoyLima();
    const d = fechaFiltro(desde, 'desde') || sumarDias(hoy, -29), h = fechaFiltro(hasta, 'hasta') || hoy;
    if (h < d) throw falla(400, 'La fecha final debe ser posterior a la inicial.', 'hasta');
    if (diasEntre(d, h) > 731) throw falla(400, 'El rango máximo es de 2 años.', 'hasta');
    const hx = sumarDias(h, 1), dias = diasEntre(d, hx);
    const tipos = await this.db.query<any>(`SELECT t.nombre, count(h.id) FILTER (WHERE h.estado = 'Operativa') AS operativas
      FROM tipos_habitacion t LEFT JOIN habitaciones h ON h.tipo_habitacion_id = t.id GROUP BY t.id, t.nombre`);
    const operativas = tipos.reduce((s, t) => s + t.operativas, 0);
    const todas = await this.estadias(d, hx);
    const efectiva = (e: any) => ['Confirmada', 'CheckIn', 'CheckOut'].includes(e.estado);
    const ef = todas.filter(efectiva);
    const tot = sumarEstadias(ef, d, hx);
    const llegan = todas.filter(e => e.entrada >= d && e.entrada < hx);
    const llegEf = llegan.filter(efectiva);
    const canc = llegan.filter(e => e.estado === 'Cancelada').length, ns = llegan.filter(e => e.estado === 'NoShow').length;
    const porMes = [] as any[];
    for (let m = primeroDeMes(d); m < hx; m = sumarMeses(m, 1)) {
      const ini = m < d ? d : m, fin = sumarMeses(m, 1) > hx ? hx : sumarMeses(m, 1);
      const s = sumarEstadias(ef, ini, fin), disp = operativas * diasEntre(ini, fin);
      porMes.push({ mes: m.slice(0, 7), noches: s.noches, ingresos: s.ingreso, ocupacion: dividir(s.noches, disp), adr: dividir(s.ingreso, s.noches, 2), revpar: dividir(s.ingreso, disp, 2) });
    }
    const porDia = Array(7).fill(0), cuenta = Array(7).fill(0);
    for (let f = d; f < hx; f = sumarDias(f, 1)) {
      const i = (new Date(f + 'T12:00:00Z').getUTCDay() + 6) % 7;
      porDia[i] += ef.filter(e => e.entrada <= f && e.salida > f).length; cuenta[i]++;
    }
    const agrupar = (lista: any[], clave: (x: any) => string) => Object.values(lista.reduce((a: any, x) => {
      const k = clave(x); a[k] ??= { clave: k, reservas: 0, ingresos: 0 }; a[k].reservas++; a[k].ingresos = redondear(a[k].ingresos + x.total); return a;
    }, {})) as any[];
    const pagos = await this.db.query<any>(`SELECT metodo, sum(monto_soles) AS monto, count(*) AS cantidad FROM pagos
      WHERE estado = 'Aprobado' AND (fecha_pago AT TIME ZONE 'America/Lima')::date BETWEEN $1 AND $2 GROUP BY metodo ORDER BY 2 DESC`, [d, h]);
    const { devuelto } = (await this.db.uno<{ devuelto: number }>(`SELECT coalesce(sum(monto), 0) AS devuelto FROM devoluciones
      WHERE estado = 'Completada' AND (fecha_resultado AT TIME ZONE 'America/Lima')::date BETWEEN $1 AND $2`, [d, h]))!;
    const top = Object.values(llegEf.reduce((a: any, x) => { a[x.clienteId] ??= { clienteId: x.clienteId, cliente: x.cliente, reservas: 0, total: 0 };
      a[x.clienteId].reservas++; a[x.clienteId].total = redondear(a[x.clienteId].total + x.total); return a; }, {})).sort((a: any, b: any) => b.total - a.total).slice(0, 10);
    return {
      desde: d, hasta: h, dias, habitaciones: operativas, nochesDisponibles: operativas * dias, nochesOcupadas: tot.noches, ingresos: tot.ingreso,
      ocupacion: dividir(tot.noches, operativas * dias), adr: dividir(tot.ingreso, tot.noches, 2), revpar: dividir(tot.ingreso, operativas * dias, 2),
      reservas: llegan.length, reservasEfectivas: llegEf.length, canceladas: canc, noShow: ns, tasaCancelacion: dividir(canc + ns, llegan.length),
      estadiaPromedio: llegEf.length ? redondear(llegEf.reduce((s, x) => s + x.noches, 0) / llegEf.length) : 0,
      anticipacionPromedio: llegEf.length ? Number((llegEf.reduce((s, x) => s + diasEntre(new Date(x.fechaReserva).toISOString().slice(0, 10), x.entrada), 0) / llegEf.length).toFixed(1)) : 0,
      igv: redondear(llegEf.reduce((s, x) => s + x.igv, 0)), ventasExoneradas: redondear(llegEf.filter(x => x.exoneradoIgv).reduce((s, x) => s + x.total, 0)),
      cobrado: redondear(pagos.reduce((s, x) => s + x.monto, 0) - devuelto), devuelto,
      porTipo: tipos.map(t => { const s = sumarEstadias(ef.filter(e => e.tipo === t.nombre), d, hx);
        return { tipo: t.nombre, habitaciones: t.operativas, noches: s.noches, ingresos: s.ingreso, ocupacion: dividir(s.noches, t.operativas * dias), adr: dividir(s.ingreso, s.noches, 2) }; })
        .sort((a, b) => b.ingresos - a.ingresos),
      porMes,
      porDiaSemana: DIAS.map((dia, i) => ({ dia, ocupacion: cuenta[i] ? dividir(porDia[i] / cuenta[i], operativas) : 0 })),
      porCanal: agrupar(llegEf, x => x.canal).map(x => ({ canal: x.clave, reservas: x.reservas, ingresos: x.ingresos })).sort((a, b) => b.reservas - a.reservas),
      porResidencia: agrupar(llegEf, x => (x.residencia === 'EXT' ? 'Extranjeros' : 'Residentes')).map(x => ({ residencia: x.clave, reservas: x.reservas, ingresos: x.ingresos })),
      pagosPorMetodo: pagos, topClientes: top
    };
  }
}
