import { CanActivate, ExecutionContext, HttpException, Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

/** Límite de peticiones por IP (anti-spam y anti fuerza bruta). */
export const Limite = (max: number, ventanaMs = 60_000) => SetMetadata('limite', { max, ventanaMs });

@Injectable()
export class LimiteGuard implements CanActivate {
  private readonly cubetas = new Map<string, { n: number; hasta: number }>();
  constructor(private readonly reflector: Reflector) {}
  canActivate(ctx: ExecutionContext): boolean {
    const cfg = this.reflector.get<{ max: number; ventanaMs: number }>('limite', ctx.getHandler());
    if (!cfg || process.env.SIN_LIMITES === 'true') return true;
    const req = ctx.switchToHttp().getRequest();
    const clave = `${req.ip}|${ctx.getClass().name}.${ctx.getHandler().name}`;
    const ahora = Date.now();
    const c = this.cubetas.get(clave);
    if (!c || c.hasta < ahora) {
      // Muchas IP distintas no deben hacer crecer la memoria sin fin: se descartan las ventanas vencidas
      if (this.cubetas.size >= 10_000) for (const [k, v] of this.cubetas) if (v.hasta < ahora) this.cubetas.delete(k);
      this.cubetas.set(clave, { n: 1, hasta: ahora + cfg.ventanaMs });
      return true;
    }
    if (++c.n > cfg.max) throw new HttpException({ mensaje: 'Demasiadas solicitudes seguidas. Espera un minuto e inténtalo de nuevo.', campo: null }, 429);
    return true;
  }
}
