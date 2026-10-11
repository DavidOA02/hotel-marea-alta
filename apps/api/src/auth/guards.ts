import { CanActivate, createParamDecorator, ExecutionContext, Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { falla } from '../comun/errores';
import { AuthService, UsuarioSesion } from './auth.service';

/** Restringe un controlador o acción a ciertos roles. */
export const Roles = (...roles: string[]) => SetMetadata('roles', roles);
/** Inyecta el usuario de la sesión. */
export const Usuario = createParamDecorator((_: unknown, ctx: ExecutionContext): UsuarioSesion => ctx.switchToHttp().getRequest().usuario);

/** Exige un token Bearer válido y, si se indican, uno de los roles. */
@Injectable()
export class SesionGuard implements CanActivate {
  constructor(private readonly auth: AuthService, private readonly reflector: Reflector) {}
  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest();
    const [tipo, token] = String(req.headers.authorization || '').split(' ');
    if (tipo !== 'Bearer' || !token) throw falla(401, 'Debes iniciar sesión.');
    req.usuario = await this.auth.validarAcceso(token);
    const roles = this.reflector.getAllAndOverride<string[]>('roles', [ctx.getHandler(), ctx.getClass()]);
    if (roles?.length && !roles.includes(req.usuario.rol)) throw falla(403, 'No tienes permiso para esta acción.');
    return true;
  }
}
