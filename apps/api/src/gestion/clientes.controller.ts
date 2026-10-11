import { Body, Controller, Get, Param, ParseIntPipe, Post, Put, Query, UseGuards } from '@nestjs/common';
import { clienteSchema } from '@marea/shared';
import { z } from 'zod';
import { Db } from '../db/db.service';
import { falla } from '../comun/errores';
import { ZodPipe } from '../comun/zod.pipe';
import { SesionGuard } from '../auth/guards';
import { SQL_RESERVA } from '../reservas/reservas.service';
import { Bitacora, cambios } from '../auditoria/bitacora.service';

const SQL_CLIENTE = `SELECT c.*, count(r.id) AS reservas,
  count(r.id) FILTER (WHERE r.estado IN ('CheckIn','CheckOut')) AS estadias,
  coalesce(sum(r.total) FILTER (WHERE r.estado NOT IN ('Cancelada','NoShow')), 0) AS total_gastado,
  max(r.fecha_entrada) AS ultima_llegada
  FROM clientes c LEFT JOIN reservas r ON r.cliente_id = c.id`;

/** Clientes: búsqueda, ficha con historial, alta y edición. */
@Controller('gestion/clientes')
@UseGuards(SesionGuard)
export class ClientesController {
  constructor(private readonly db: Db, private readonly bitacora: Bitacora) {}

  @Get()
  listar(@Query('buscar') buscar?: string, @Query('limite') limite = '100') {
    const p: unknown[] = [];
    let w = '';
    if (buscar?.trim()) { p.push(`%${buscar.trim()}%`); w = `WHERE c.nombres ILIKE $1 OR c.apellidos ILIKE $1 OR (c.nombres || ' ' || c.apellidos) ILIKE $1 OR c.numero_documento ILIKE $1 OR c.email ILIKE $1 OR c.telefono ILIKE $1`; }
    p.push(Math.min(Math.max(Number(limite) || 100, 1), 500));
    return this.db.query(`${SQL_CLIENTE} ${w} GROUP BY c.id ORDER BY c.fecha_registro DESC LIMIT $${p.length}`, p);
  }

  @Get(':id')
  async ficha(@Param('id', ParseIntPipe) id: number) {
    const cliente = await this.db.uno(`${SQL_CLIENTE} WHERE c.id = $1 GROUP BY c.id`, [id]);
    if (!cliente) throw falla(404, 'Cliente no encontrado.');
    const reservas = await this.db.query(`${SQL_RESERVA} WHERE r.cliente_id = $1 ORDER BY r.fecha_entrada DESC`, [id]);
    return { cliente, reservas };
  }

  private async duplicado(d: { tipoDocumento: string; numeroDocumento: string }, id?: number) {
    const x = await this.db.uno('SELECT 1 FROM clientes WHERE tipo_documento = $1 AND numero_documento = $2 AND ($3::int IS NULL OR id <> $3)', [d.tipoDocumento, d.numeroDocumento, id ?? null]);
    if (x) throw falla(409, 'Ya existe un cliente con ese documento.', 'numeroDocumento');
  }

  @Post()
  async crear(@Body(new ZodPipe(clienteSchema)) d: z.output<typeof clienteSchema>) {
    await this.duplicado(d);
    return this.db.transaccion(async tx => {
      const c = await this.db.uno<any>(`INSERT INTO clientes (nombres, apellidos, tipo_documento, numero_documento, email, codigo_pais, telefono, residencia, acepta_publicidad, notas)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`, [d.nombres, d.apellidos, d.tipoDocumento, d.numeroDocumento, d.email, d.codigoPais, d.telefono, d.residencia, d.aceptaPublicidad, d.notas], tx);
      await this.bitacora.registrar({ accion: 'cliente.crear', entidad: 'cliente', entidadId: c.id, descripcion: `Cliente ${d.nombres} ${d.apellidos} (${d.tipoDocumento} ${d.numeroDocumento}) registrado` }, tx);
      return { id: c.id, mensaje: 'Cliente registrado.' };
    });
  }

  @Put(':id')
  async editar(@Param('id', ParseIntPipe) id: number, @Body(new ZodPipe(clienteSchema)) d: z.output<typeof clienteSchema>) {
    await this.duplicado(d, id);
    return this.db.transaccion(async tx => {
      const antes = await this.db.uno<any>('SELECT * FROM clientes WHERE id = $1 FOR UPDATE', [id], tx);
      if (!antes) throw falla(404, 'Cliente no encontrado.');
      await tx.query(`UPDATE clientes SET nombres=$2, apellidos=$3, tipo_documento=$4, numero_documento=$5, email=$6, codigo_pais=$7, telefono=$8, residencia=$9, acepta_publicidad=$10, notas=$11
        WHERE id = $1`, [id, d.nombres, d.apellidos, d.tipoDocumento, d.numeroDocumento, d.email, d.codigoPais, d.telefono, d.residencia, d.aceptaPublicidad, d.notas]);
      const dif = cambios(antes, d, ['nombres', 'apellidos', 'tipoDocumento', 'numeroDocumento', 'email', 'codigoPais', 'telefono', 'residencia', 'aceptaPublicidad', 'notas']);
      if (Object.keys(dif).length) await this.bitacora.registrar({ accion: 'cliente.editar', entidad: 'cliente', entidadId: id,
        descripcion: `Datos de ${d.nombres} ${d.apellidos} actualizados: ${Object.keys(dif).join(', ')}`, datos: dif }, tx);
      return { id, mensaje: 'Datos del cliente actualizados.' };
    });
  }
}
