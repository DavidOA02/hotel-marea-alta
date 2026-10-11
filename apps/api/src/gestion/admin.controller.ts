import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Put, Query, UseGuards } from '@nestjs/common';
import { respuestaReclamoSchema, usuarioSchema } from '@marea/shared';
import { z } from 'zod';
import { Db } from '../db/db.service';
import { falla } from '../comun/errores';
import { ZodPipe } from '../comun/zod.pipe';
import { aPublico, UsuarioBd, UsuarioSesion } from '../auth/auth.service';
import { hashClave } from '../auth/claves';
import { Roles, SesionGuard, Usuario } from '../auth/guards';

/** Usuarios (administrador), Libro de Reclamaciones y suscriptores. */
@Controller('gestion')
@UseGuards(SesionGuard)
export class AdminController {
  constructor(private readonly db: Db) {}

  @Get('usuarios') @Roles('Administrador')
  async usuarios() {
    return (await this.db.query<UsuarioBd>('SELECT * FROM usuarios ORDER BY rol, nombre')).map(aPublico);
  }

  @Post('usuarios') @Roles('Administrador')
  async crearUsuario(@Body(new ZodPipe(usuarioSchema)) d: z.output<typeof usuarioSchema>) {
    if (!d.clave) throw falla(400, 'Escribe una contraseña temporal.', 'clave');
    if (await this.db.uno('SELECT 1 FROM usuarios WHERE email = $1', [d.email])) throw falla(409, 'Ya existe un usuario con ese correo.', 'email');
    const u = await this.db.uno<UsuarioBd>(`INSERT INTO usuarios (nombre, email, rol, clave_hash, activo) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [d.nombre, d.email, d.rol, hashClave(d.clave), d.activo]);
    return aPublico(u!);
  }

  @Put('usuarios/:id') @Roles('Administrador')
  async editarUsuario(@Param('id', ParseIntPipe) id: number, @Usuario() yo: UsuarioSesion, @Body(new ZodPipe(usuarioSchema)) d: z.output<typeof usuarioSchema>) {
    const u = await this.db.uno<UsuarioBd>('SELECT * FROM usuarios WHERE id = $1', [id]);
    if (!u) throw falla(404, 'Usuario no encontrado.');
    if (await this.db.uno('SELECT 1 FROM usuarios WHERE email = $1 AND id <> $2', [d.email, id])) throw falla(409, 'Ya existe un usuario con ese correo.', 'email');
    if (id === yo.id && (!d.activo || d.rol !== 'Administrador')) throw falla(409, 'No puedes desactivarte ni quitarte el rol de administrador.', 'rol');
    if (u.rol === 'Administrador' && u.activo && (d.rol !== 'Administrador' || !d.activo)) {
      const { n } = (await this.db.uno<{ n: number }>(`SELECT count(*) AS n FROM usuarios WHERE rol = 'Administrador' AND activo`))!;
      if (n <= 1) throw falla(409, 'Debe quedar al menos un administrador activo.', 'rol');
    }
    const act = await this.db.uno<UsuarioBd>(`UPDATE usuarios SET nombre = $2, email = $3, rol = $4, activo = $5,
      clave_hash = coalesce($6, clave_hash), debe_cambiar_clave = CASE WHEN $6::text IS NULL THEN debe_cambiar_clave ELSE true END,
      bloqueado_hasta = CASE WHEN $5 THEN NULL ELSE bloqueado_hasta END, intentos_fallidos = CASE WHEN $5 THEN 0 ELSE intentos_fallidos END
      WHERE id = $1 RETURNING *`, [id, d.nombre, d.email, d.rol, d.activo, d.clave ? hashClave(d.clave) : null]);
    return aPublico(act!);
  }

  @Get('reclamaciones')
  reclamaciones(@Query('estado') estado?: string) {
    return this.db.query(`SELECT * FROM reclamaciones ${estado ? 'WHERE estado = $1' : ''} ORDER BY fecha DESC LIMIT 500`, estado ? [estado] : []);
  }

  @Patch('reclamaciones/:numero/respuesta') @Roles('Administrador')
  async responder(@Param('numero') numero: string, @Body(new ZodPipe(respuestaReclamoSchema)) d: { respuesta: string }) {
    const r = await this.db.uno<any>('SELECT estado FROM reclamaciones WHERE numero = $1', [numero]);
    if (!r) throw falla(404, 'Hoja de reclamación no encontrada.');
    if (r.estado === 'Respondido') throw falla(409, 'La hoja ya fue respondida.');
    await this.db.query(`UPDATE reclamaciones SET respuesta = $2, estado = 'Respondido', fecha_respuesta = now() WHERE numero = $1`, [numero, d.respuesta]);
    return { numero, estado: 'Respondido', mensaje: 'Respuesta registrada. Envíala al correo del consumidor.' };
  }

  @Get('suscriptores') @Roles('Administrador')
  suscriptores() {
    return this.db.query('SELECT email, fecha_registro FROM suscriptores WHERE activo ORDER BY fecha_registro DESC');
  }
}
