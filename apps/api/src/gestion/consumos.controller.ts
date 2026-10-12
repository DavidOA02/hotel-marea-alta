import { Body, Controller, Param, ParseIntPipe, Post, UseGuards } from '@nestjs/common';
import { anularPagoSchema, consumoSchema, desglosar } from '@marea/shared';
import { z } from 'zod';
import { Db } from '../db/db.service';
import { falla } from '../comun/errores';
import { ZodPipe } from '../comun/zod.pipe';
import { Roles, SesionGuard, Usuario } from '../auth/guards';
import { UsuarioSesion } from '../auth/auth.service';
import { PagosService } from '../pagos/pagos.service';
import { Bitacora } from '../auditoria/bitacora.service';
import { Facturacion } from '../facturacion/facturacion.service';

@Controller('gestion/reservas/:codigo/consumos')
@UseGuards(SesionGuard)
export class ConsumosController {
  constructor(private readonly db: Db, private readonly pagos: PagosService, private readonly facturacion: Facturacion, private readonly bitacora: Bitacora) {}

  @Post()
  async crear(@Param('codigo') codigo: string, @Usuario() u: UsuarioSesion, @Body(new ZodPipe(consumoSchema)) d: z.output<typeof consumoSchema>) {
    const { consumo, nota } = await this.db.transaccion(async c => {
      const r = await this.pagos.reservaBloqueada(c, { codigo });
      if (!['Confirmada','CheckIn','CheckOut'].includes(r.estado)) throw falla(409, 'No se agregan consumos a una reserva cancelada o no show.');
      const k = await this.facturacion.vigenteDeReserva(r.id, c);
      if (k && !['Aceptado','Observado'].includes(k.estado)) throw falla(409, 'Espera la respuesta de SUNAT antes de agregar consumos.');
      if (k && u.rol !== 'Administrador') throw falla(403, 'El cargo requiere una nota de débito; debe registrarlo un administrador.');
      const q = desglosar(d.cantidad * d.precioUnitario, 1, false);
      const nota = k ? await this.facturacion.registrarDebito(c, k.id, { motivo:'02', monto:q.total, sustento:`${d.categoria}: ${d.descripcion}` }, u.nombre) : null;
      if (!nota) await this.pagos.ajustarTotal(c, r.id, q.total, q.igv);
      const consumo = (await this.db.uno<any>(`INSERT INTO consumos (reserva_id,categoria,descripcion,cantidad,precio_unitario,subtotal,igv,total,comprobante_id,registrado_por)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`, [r.id,d.categoria,d.descripcion,d.cantidad,d.precioUnitario,q.subtotal,q.igv,q.total,nota?.id ?? null,u.nombre], c))!;
      if (nota) await c.query(`UPDATE comprobantes SET items = $2 WHERE id = $1`, [nota.id, JSON.stringify([{ codigo:`CON-${consumo.id}`, descripcion:`${d.categoria}: ${d.descripcion}`, unidad:'NIU', cantidad:d.cantidad,
        valorUnitario:q.subtotal/d.cantidad, precioUnitario:d.precioUnitario, afectacion:'10', igv:q.igv, total:q.total }])]);
      await this.bitacora.registrar({ accion:'consumo.registrar', entidad:'reserva', entidadId:r.codigo,
        descripcion:`${d.categoria}: ${d.descripcion} (${d.cantidad} × S/ ${d.precioUnitario.toFixed(2)})`, datos:{ consumoId:consumo.id, total:q.total, notaId:nota?.id ?? null } }, c);
      return { consumo, nota };
    });
    const final = nota ? await this.facturacion.enviarNota(nota.id) : null;
    return { ...consumo, notaDebito:final, mensaje:final?.estado === 'Rechazado' ? 'SUNAT rechazó el cargo; se revirtió el consumo.' : 'Consumo registrado.', advertencia:final?.advertencia };
  }

  @Post(':id/anular') @Roles('Administrador')
  async anular(@Param('codigo') codigo: string, @Param('id', ParseIntPipe) id: number, @Body(new ZodPipe(anularPagoSchema)) d: { motivo:string }) {
    return this.db.transaccion(async c => {
      const r = await this.pagos.reservaBloqueada(c, { codigo });
      const a = await this.db.uno<any>('SELECT * FROM consumos WHERE id = $1 AND reserva_id = $2 FOR UPDATE', [id,r.id], c);
      if (!a) throw falla(404, 'Consumo no encontrado.');
      if (a.estado !== 'Activo') throw falla(409, 'El consumo ya está anulado.');
      if (a.comprobanteId) throw falla(409, 'El consumo ya está documentado: no se puede borrar de la cuenta.');
      await this.pagos.ajustarTotal(c, r.id, -a.total, -a.igv);
      await c.query(`UPDATE consumos SET estado = 'Anulado', motivo_anulacion = $2 WHERE id = $1`, [id,d.motivo]);
      await this.bitacora.registrar({ accion:'consumo.anular', entidad:'reserva', entidadId:r.codigo, descripcion:`Consumo ${id} anulado: ${d.motivo}`, datos:{ consumoId:id, total:a.total } }, c);
      return { mensaje:'Consumo anulado.' };
    });
  }
}
