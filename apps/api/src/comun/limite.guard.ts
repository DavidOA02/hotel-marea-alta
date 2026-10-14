import { CanActivate, ExecutionContext, HttpException, Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

const MAX_CUBETAS = 10_000;
const rechazar = () => new HttpException({ mensaje: 'Demasiadas solicitudes seguidas. Espera un minuto e inténtalo de nuevo.', campo: null }, 429);

/** Límite de peticiones por IP (anti-spam y anti fuerza bruta). */
export const Limite = (max: number, ventanaMs = 60_000) => SetMetadata('limite', { max, ventanaMs });

@Injectable()
export class LimiteGuard implements CanActivate {
  private readonly cubetas = new Map<string, { n: number; hasta: number }>();
  private proximaLimpieza = Infinity;
  constructor(private readonly reflector: Reflector) {}
  canActivate(ctx: ExecutionContext): boolean {
    const cfg = this.reflector.get<{ max: number; ventanaMs: number }>('limite', ctx.getHandler());
    if (!cfg || process.env.SIN_LIMITES === 'true') return true;
    const req = ctx.switchToHttp().getRequest();
    const clave = `${req.ip}|${ctx.getClass().name}.${ctx.getHandler().name}`;
    const ahora = Date.now();
    const c = this.cubetas.get(clave);
    if (!c || c.hasta <= ahora) {
      // No desalojar ventanas activas: permitiría reiniciar el límite cambiando de IP.
      if (this.cubetas.size >= MAX_CUBETAS) {
        // Bajo saturación, no recorrer el mapa por cada IP nueva sin ventanas vencidas.
        if (ahora >= this.proximaLimpieza) {
          this.proximaLimpieza = Infinity;
          for (const [k, v] of this.cubetas) {
            if (v.hasta <= ahora) this.cubetas.delete(k);
            else this.proximaLimpieza = Math.min(this.proximaLimpieza, v.hasta);
          }
        }
        if (!this.cubetas.has(clave) && this.cubetas.size >= MAX_CUBETAS) throw rechazar();
      }
      this.cubetas.set(clave, { n: 1, hasta: ahora + cfg.ventanaMs });
      this.proximaLimpieza = Math.min(this.proximaLimpieza, ahora + cfg.ventanaMs);
      return true;
    }
    if (c.n >= cfg.max) throw rechazar();
    c.n++;
    return true;
  }
}
