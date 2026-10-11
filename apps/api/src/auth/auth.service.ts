import { Injectable, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Db } from '../db/db.service';
import { falla } from '../comun/errores';
import { hashClave, selloUsuario, verificarClave } from './claves';

export interface UsuarioBd {
  id: number; nombre: string; email: string; rol: string; claveHash: string; activo: boolean; debeCambiarClave: boolean;
  intentosFallidos: number; bloqueadoHasta: Date | null; ultimoAcceso: Date | null; fechaCreacion: Date;
}
export interface UsuarioSesion { id: number; nombre: string; email: string; rol: string }

const MAX_INTENTOS = 5;
const MINUTOS_BLOQUEO = 15;
export const SEG_ACCESO = 3600;            // 1 hora
export const SEG_RENOVACION = 12 * 3600;   // un turno

export const aPublico = (u: UsuarioBd) => ({
  id: u.id, nombre: u.nombre, email: u.email, rol: u.rol, activo: u.activo, debeCambiarClave: u.debeCambiarClave,
  ultimoAcceso: u.ultimoAcceso, fechaCreacion: u.fechaCreacion
});

@Injectable()
export class AuthService {
  private readonly log = new Logger('Auth');
  readonly secretoAcceso = process.env.JWT_SECRETO || 'marea-alta-solo-desarrollo-acceso';
  readonly secretoRenovacion = process.env.JWT_SECRETO_RENOVACION || 'marea-alta-solo-desarrollo-renovacion';

  constructor(private readonly db: Db, private readonly jwt: JwtService) {
    if (!process.env.JWT_SECRETO && process.env.NODE_ENV === 'production')
      throw new Error('Define JWT_SECRETO y JWT_SECRETO_RENOVACION en producción.');
  }

  private emitir(u: UsuarioBd) {
    const sello = selloUsuario(u);
    const accessToken = this.jwt.sign({ sub: u.id, nombre: u.nombre, email: u.email, rol: u.rol, sello }, { secret: this.secretoAcceso, expiresIn: SEG_ACCESO });
    const refreshToken = this.jwt.sign({ sub: u.id, sello, tipo: 'renovacion' }, { secret: this.secretoRenovacion, expiresIn: SEG_RENOVACION });
    return { tokenType: 'Bearer', accessToken, expiresIn: SEG_ACCESO, refreshToken, usuario: aPublico(u) };
  }

  async login(email: string, clave: string) {
    const u = await this.db.uno<UsuarioBd>('SELECT * FROM usuarios WHERE email = $1', [email]);
    const ahora = new Date();
    if (u?.bloqueadoHasta && u.bloqueadoHasta > ahora) {
      const min = Math.max(1, Math.ceil((u.bloqueadoHasta.getTime() - ahora.getTime()) / 60000));
      throw falla(423, `Cuenta bloqueada por intentos fallidos. Inténtalo en ${min} min.`);
    }
    if (!u || !u.activo || !verificarClave(clave, u.claveHash)) {
      if (u) {
        const intentos = u.intentosFallidos + 1;
        const bloquear = intentos >= MAX_INTENTOS;
        await this.db.query(`UPDATE usuarios SET intentos_fallidos = $2, bloqueado_hasta = $3 WHERE id = $1`,
          [u.id, bloquear ? 0 : intentos, bloquear ? new Date(ahora.getTime() + MINUTOS_BLOQUEO * 60000) : null]);
        if (bloquear) this.log.warn(`Usuario ${u.email} bloqueado por intentos fallidos`);
      }
      throw falla(401, 'Correo o contraseña incorrectos.');
    }
    const act = await this.db.uno<UsuarioBd>(`UPDATE usuarios SET intentos_fallidos = 0, bloqueado_hasta = NULL, ultimo_acceso = now() WHERE id = $1 RETURNING *`, [u.id]);
    this.log.log(`Inicio de sesión: ${u.email} (${u.rol})`);
    return this.emitir(act!);
  }

  /** Comprueba el token de acceso y que el usuario siga vigente (activo y con el mismo sello). */
  async validarAcceso(token: string): Promise<UsuarioSesion> {
    let p: any;
    try { p = this.jwt.verify(token, { secret: this.secretoAcceso }); } catch { throw falla(401, 'Tu sesión expiró. Ingresa de nuevo.'); }
    const u = await this.db.uno<UsuarioBd>('SELECT * FROM usuarios WHERE id = $1', [p.sub]);
    if (!u || !u.activo || selloUsuario(u) !== p.sello) throw falla(401, 'Tu sesión ya no es válida. Ingresa de nuevo.');
    return { id: u.id, nombre: u.nombre, email: u.email, rol: u.rol };
  }

  async renovar(refreshToken: string) {
    let p: any;
    try { p = this.jwt.verify(refreshToken, { secret: this.secretoRenovacion }); } catch { throw falla(401, 'La sesión expiró. Ingresa de nuevo.'); }
    const u = await this.db.uno<UsuarioBd>('SELECT * FROM usuarios WHERE id = $1', [p.sub]);
    if (!u || !u.activo || p.tipo !== 'renovacion' || selloUsuario(u) !== p.sello) throw falla(401, 'Tu sesión ya no es válida. Ingresa de nuevo.');
    return this.emitir(u);
  }

  async yo(id: number) {
    const u = await this.db.uno<UsuarioBd>('SELECT * FROM usuarios WHERE id = $1', [id]);
    return aPublico(u!);
  }

  async cambiarClave(id: number, actual: string, nueva: string) {
    const u = await this.db.uno<UsuarioBd>('SELECT * FROM usuarios WHERE id = $1', [id]);
    if (!u || !verificarClave(actual, u.claveHash)) throw falla(400, 'La contraseña actual no es correcta.', 'claveActual');
    const act = await this.db.uno<UsuarioBd>('UPDATE usuarios SET clave_hash = $2, debe_cambiar_clave = false WHERE id = $1 RETURNING *', [id, hashClave(nueva)]);
    return this.emitir(act!);
  }
}
