import { Injectable } from '@nestjs/common';
import { abrirTurnoSchema, cerrarTurnoSchema, efectivoEsperado, ETIQUETAS, HORAS_TURNO_LARGO, METODOS_PAGO, movimientoCajaSchema, redondear, revisarTurnoSchema, sumarDias } from '@marea/shared';
import type { PoolClient } from 'pg';
import { z } from 'zod';
import { Db, Ejecutor } from '../db/db.service';
import { falla } from '../comun/errores';
import { Bitacora } from '../auditoria/bitacora.service';
import type { UsuarioSesion } from '../auth/auth.service';
import { dolares, soles } from '../correo/plantillas';

const suma = (l: number[]) => redondear(l.reduce((s, x) => s + x, 0));
/** «faltante de S/ 10.00», «sobrante de US$ 5.00» o null si cuadra. */
const diferencia = (n: number, f: (n: number) => string) => Math.abs(n) < 0.005 ? null : `${n < 0 ? 'faltante' : 'sobrante'} de ${f(Math.abs(n))}`;

/**
 * Caja por turnos. Cada usuario abre su turno con un fondo inicial; el efectivo que cobra o devuelve queda en su turno
 * y al terminar cuenta la caja (arqueo). Al cerrar se guardan lo esperado y lo contado; después solo se marca como revisado.
 */
@Injectable()
export class TurnosCaja {
  constructor(private readonly db: Db, private readonly bitacora: Bitacora) {}

  /**
   * Turno abierto del usuario, bloqueado hasta el fin de la transacción: un cierre simultáneo espera al cobro, o el cobro
   * ve el turno ya cerrado. Lo que saca efectivo bloquea con UPDATE para no entregar dos veces el mismo dinero.
   * Con `exigir` (p. ej. «cobrar en efectivo») falla si el usuario no tiene un turno abierto.
   */
  async delUsuario(c: PoolClient, usuarioId: number, exigir: string | null, bloqueo: 'SHARE' | 'UPDATE' = 'SHARE') {
    const t = await this.db.uno<any>(`SELECT * FROM turnos_caja WHERE usuario_id = $1 AND estado = 'Abierto' FOR ${bloqueo}`, [usuarioId], c);
    if (!t && exigir) throw falla(409, `Abre tu turno de caja para ${exigir}.`);
    return t;
  }

  /** Efectivo que debería haber ahora en la caja del turno. */
  async esperado(t: { id: number; fondoInicial: number }, c?: Ejecutor) {
    return this.calcular(t, await this.movimientos(t.id, c)).esperado;
  }

  private async movimientos(id: number, c?: Ejecutor) {
    const pagos = await this.db.query<any>(`SELECT p.id, p.fecha_pago, r.codigo AS codigo_reserva, cl.nombres || ' ' || cl.apellidos AS cliente, p.metodo, p.moneda,
        p.monto, p.tipo_cambio, p.monto_soles, p.referencia, p.estado, p.registrado_por, p.motivo_anulacion
      FROM pagos p JOIN reservas r ON r.id = p.reserva_id JOIN clientes cl ON cl.id = r.cliente_id WHERE p.turno_id = $1 ORDER BY p.fecha_pago, p.id`, [id], c);
    const devoluciones = await this.db.query<any>(`SELECT dv.id, dv.fecha, r.codigo AS codigo_reserva, cl.nombres || ' ' || cl.apellidos AS cliente, p.metodo,
        dv.monto, dv.monto_dolares, dv.motivo, dv.estado, dv.registrado_por
      FROM devoluciones dv JOIN pagos p ON p.id = dv.pago_id JOIN reservas r ON r.id = dv.reserva_id JOIN clientes cl ON cl.id = r.cliente_id
      WHERE dv.turno_id = $1 ORDER BY dv.fecha, dv.id`, [id], c);
    const movimientos = await this.db.query<any>('SELECT id, fecha, tipo, moneda, monto, motivo, registrado_por FROM movimientos_caja WHERE turno_id = $1 ORDER BY fecha, id', [id], c);
    return { pagos, devoluciones, movimientos };
  }

  /** Totales del turno a partir de sus pagos aprobados, devoluciones completadas y movimientos de efectivo. */
  private calcular(t: { fondoInicial: number }, m: { pagos: any[]; devoluciones: any[]; movimientos: any[] }) {
    const cobros = m.pagos.filter(p => p.estado === 'Aprobado');
    const devueltas = m.devoluciones.filter(d => d.estado === 'Completada');
    const porMetodo = METODOS_PAGO.map(metodo => {
      const l = cobros.filter(p => p.metodo === metodo);
      return { metodo, cantidad: l.length, montoSoles: suma(l.map(p => p.montoSoles)), soles: suma(l.filter(p => p.moneda === 'PEN').map(p => p.monto)),
        dolares: suma(l.filter(p => p.moneda === 'USD').map(p => p.monto)), devuelto: suma(devueltas.filter(d => d.metodo === metodo).map(d => d.monto)) };
    }).filter(x => x.cantidad || x.devuelto);
    const mov = (tipo: string, moneda: string) => suma(m.movimientos.filter(x => x.tipo === tipo && x.moneda === moneda).map(x => x.monto));
    const devEfectivo = devueltas.filter(d => d.metodo === 'Efectivo');
    return {
      esperado: efectivoEsperado({ fondoInicial: t.fondoInicial, cobros, devoluciones: devueltas, movimientos: m.movimientos }),
      cobrado: suma(cobros.map(p => p.montoSoles)), devuelto: suma(devueltas.map(d => d.monto)), pagos: cobros.length, porMetodo,
      ingresos: { soles: mov('Ingreso', 'PEN'), dolares: mov('Ingreso', 'USD') }, retiros: { soles: mov('Retiro', 'PEN'), dolares: mov('Retiro', 'USD') },
      devolucionesEfectivo: { soles: suma(devEfectivo.filter(d => d.montoDolares == null).map(d => d.monto)), dolares: suma(devEfectivo.map(d => d.montoDolares ?? 0)) }
    };
  }

  /** Turno abierto del usuario con lo esperado en caja; al administrador también le indica qué arqueos revisar. */
  async actual(u: UsuarioSesion) {
    const t = await this.db.uno<{ id: number }>(`SELECT id FROM turnos_caja WHERE usuario_id = $1 AND estado = 'Abierto'`, [u.id]);
    const avisos = u.rol === 'Administrador' ? await this.db.uno<{ porRevisar: number; abiertosLargos: number }>(`SELECT
        count(*) FILTER (WHERE estado = 'Cerrado' AND fecha_revision IS NULL AND (diferencia_soles <> 0 OR diferencia_dolares <> 0)) AS por_revisar,
        count(*) FILTER (WHERE estado = 'Abierto' AND usuario_id <> $1 AND fecha_apertura < now() - make_interval(hours => $2)) AS abiertos_largos
      FROM turnos_caja`, [u.id, HORAS_TURNO_LARGO]) : null;
    return { turno: t ? await this.detalle(t.id, u) : null, porRevisar: avisos?.porRevisar ?? 0, abiertosLargos: avisos?.abiertosLargos ?? 0, horasTurnoLargo: HORAS_TURNO_LARGO };
  }

  /** Turnos abiertos en el periodo (hora de Lima) y los que siguen abiertos. El recepcionista solo ve los suyos. */
  async listar(u: UsuarioSesion, desde: string, hasta: string) {
    if (hasta < desde) throw falla(400, 'La fecha final debe ser posterior a la inicial.', 'hasta');
    const p: unknown[] = [desde, sumarDias(hasta, 1)];
    if (u.rol !== 'Administrador') p.push(u.id);
    const lista = await this.db.query<any>(`SELECT t.*, x.pagos, x.cobrado FROM turnos_caja t
      CROSS JOIN LATERAL (SELECT count(*) AS pagos, coalesce(sum(monto_soles), 0) AS cobrado FROM pagos WHERE turno_id = t.id AND estado = 'Aprobado') x
      WHERE ((t.fecha_apertura AT TIME ZONE 'America/Lima') >= $1::date AND (t.fecha_apertura AT TIME ZONE 'America/Lima') < $2::date OR t.estado = 'Abierto')
      ${p.length > 2 ? 'AND t.usuario_id = $3' : ''} ORDER BY t.fecha_apertura DESC`, p);
    for (const t of lista) if (t.estado === 'Abierto') t.esperadoActual = await this.esperado(t);
    return lista;
  }

  async detalle(id: number, u: UsuarioSesion) {
    const t = await this.db.uno<any>('SELECT * FROM turnos_caja WHERE id = $1', [id]);
    if (!t || (u.rol !== 'Administrador' && t.usuarioId !== u.id)) throw falla(404, 'Turno de caja no encontrado.');
    const m = await this.movimientos(id);
    return { ...t, ...m, resumen: this.calcular(t, m) };
  }

  async abrir(u: UsuarioSesion, d: z.output<typeof abrirTurnoSchema>) {
    return this.db.transaccion(async c => {
      const t = await this.db.uno<any>(`INSERT INTO turnos_caja (usuario_id, usuario, fondo_inicial, nota_apertura) VALUES ($1, $2, $3, $4)
        ON CONFLICT (usuario_id) WHERE estado = 'Abierto' DO NOTHING RETURNING *`, [u.id, u.nombre, redondear(d.fondoInicial), d.nota], c);
      if (!t) throw falla(409, 'Ya tienes un turno de caja abierto. Ciérralo con el arqueo antes de abrir otro.');
      await this.bitacora.registrar({ accion: 'turno.abrir', entidad: 'turno', entidadId: t.id,
        descripcion: `Turno de caja N.° ${t.id} abierto con un fondo inicial de ${soles(t.fondoInicial)}${d.nota ? `. Nota: ${d.nota}` : ''}`, datos: { fondoInicial: t.fondoInicial } }, c);
      return { ...t, mensaje: `Turno N.° ${t.id} abierto con un fondo de ${soles(t.fondoInicial)}.` };
    });
  }

  /** El dueño del turno o un administrador; solo turnos abiertos. Bloquea el turno hasta el fin de la transacción. */
  private async bloquear(c: PoolClient, id: number, u: UsuarioSesion) {
    const t = await this.db.uno<any>('SELECT * FROM turnos_caja WHERE id = $1 FOR UPDATE', [id], c);
    if (!t || (u.rol !== 'Administrador' && t.usuarioId !== u.id)) throw falla(404, 'Turno de caja no encontrado.');
    if (t.estado !== 'Abierto') throw falla(409, `El turno N.° ${id} ya está cerrado.`);
    return t;
  }

  /** Ingreso de efectivo (sencillo) o retiro (depósito en la caja fuerte). No se puede retirar más de lo que debería haber. */
  async movimiento(id: number, u: UsuarioSesion, d: z.output<typeof movimientoCajaSchema>) {
    return this.db.transaccion(async c => {
      const t = await this.bloquear(c, id, u);
      const f = d.moneda === 'USD' ? dolares : soles;
      if (d.tipo === 'Retiro') {
        const e = await this.esperado(t, c);
        const hay = d.moneda === 'USD' ? e.dolares : e.soles;
        if (d.monto > hay + 0.001) throw falla(409, `En la caja solo debería haber ${f(hay)}.`, 'monto');
      }
      const m = (await this.db.uno<any>(`INSERT INTO movimientos_caja (turno_id, tipo, moneda, monto, motivo, registrado_por) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [id, d.tipo, d.moneda, redondear(d.monto), d.motivo, u.nombre], c))!;
      await this.bitacora.registrar({ accion: 'turno.movimiento', entidad: 'turno', entidadId: id,
        descripcion: `${ETIQUETAS[d.tipo]} de ${f(m.monto)} en el turno N.° ${id}: ${d.motivo}`, datos: { movimientoId: m.id, tipo: d.tipo, moneda: d.moneda, monto: m.monto } }, c);
      return { ...m, mensaje: `${ETIQUETAS[d.tipo]} de ${f(m.monto)} registrado.` };
    });
  }

  /** Arqueo: compara lo contado con lo esperado y cierra el turno. Con diferencia hay que explicar el motivo. */
  async cerrar(id: number, u: UsuarioSesion, d: z.output<typeof cerrarTurnoSchema>) {
    return this.db.transaccion(async c => {
      const t = await this.bloquear(c, id, u);
      const esperado = await this.esperado(t, c);
      const contado = { soles: redondear(d.contadoSoles), dolares: redondear(d.contadoDolares) };
      const dif = [diferencia(contado.soles - esperado.soles, soles), diferencia(contado.dolares - esperado.dolares, dolares)].filter(Boolean);
      if (dif.length && !d.observaciones) throw falla(400, `El arqueo tiene un ${dif.join(' y un ')}: explica el motivo en las observaciones.`, 'observaciones');
      const x = (await this.db.uno<any>(`UPDATE turnos_caja SET estado = 'Cerrado', fecha_cierre = now(), cerrado_por = $2, esperado_soles = $3, esperado_dolares = $4,
        contado_soles = $5, contado_dolares = $6, denominaciones = $7, observaciones = $8 WHERE id = $1 RETURNING *`,
        [id, u.nombre, esperado.soles, esperado.dolares, contado.soles, contado.dolares, d.denominaciones ? JSON.stringify(d.denominaciones) : null, d.observaciones], c))!;
      const conDolares = esperado.dolares || contado.dolares;
      await this.bitacora.registrar({ accion: 'turno.cerrar', entidad: 'turno', entidadId: id,
        descripcion: `Arqueo del turno N.° ${id}${t.usuarioId !== u.id ? ` de ${t.usuario}` : ''}: esperado ${soles(esperado.soles)}${conDolares ? ` y ${dolares(esperado.dolares)}` : ''}, `
          + `contado ${soles(contado.soles)}${conDolares ? ` y ${dolares(contado.dolares)}` : ''} (${dif.length ? dif.join(' y ') : 'cuadra'})`,
        datos: { esperado, contado, diferencia: { soles: x.diferenciaSoles, dolares: x.diferenciaDolares }, observaciones: d.observaciones } }, c);
      return { ...x, mensaje: dif.length ? `Turno N.° ${id} cerrado con un ${dif.join(' y un ')}.` : `Turno N.° ${id} cerrado: la caja cuadra.` };
    });
  }

  /** El administrador da por revisado un arqueo cerrado, también el de su propio turno (una sola vez). */
  async revisar(id: number, u: UsuarioSesion, d: z.output<typeof revisarTurnoSchema>) {
    return this.db.transaccion(async c => {
      const t = await this.db.uno<any>('SELECT * FROM turnos_caja WHERE id = $1 FOR UPDATE', [id], c);
      if (!t) throw falla(404, 'Turno de caja no encontrado.');
      if (t.estado !== 'Cerrado') throw falla(409, 'Solo se revisan turnos cerrados.');
      if (t.fechaRevision) throw falla(409, `El arqueo del turno N.° ${id} ya fue revisado por ${t.revisadoPor}.`);
      const x = (await this.db.uno<any>(`UPDATE turnos_caja SET revisado_por = $2, fecha_revision = now(), nota_revision = $3 WHERE id = $1 RETURNING *`, [id, u.nombre, d.nota], c))!;
      await this.bitacora.registrar({ accion: 'turno.revisar', entidad: 'turno', entidadId: id,
        descripcion: `Arqueo del turno N.° ${id} de ${t.usuario} revisado${d.nota ? `: ${d.nota}` : ''}`, datos: { nota: d.nota } }, c);
      return { ...x, mensaje: `Arqueo del turno N.° ${id} revisado.` };
    });
  }
}
