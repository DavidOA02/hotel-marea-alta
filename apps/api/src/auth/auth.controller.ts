import { Body, Controller, Get, HttpCode, Post, UseGuards } from '@nestjs/common';
import { cambiarClaveSchema, loginSchema } from '@marea/shared';
import { z } from 'zod';
import { Limite } from '../comun/limite.guard';
import { ZodPipe } from '../comun/zod.pipe';
import { AuthService, UsuarioSesion } from './auth.service';
import { SesionGuard, Usuario } from './guards';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('login') @HttpCode(200) @Limite(8)
  login(@Body(new ZodPipe(loginSchema)) d: z.infer<typeof loginSchema>) { return this.auth.login(d.email, d.clave); }

  @Post('renovar') @HttpCode(200) @Limite(30)
  renovar(@Body(new ZodPipe(z.object({ refreshToken: z.string().min(10, 'Falta el refreshToken.') }))) d: { refreshToken: string }) {
    return this.auth.renovar(d.refreshToken);
  }

  @Get('yo') @UseGuards(SesionGuard)
  yo(@Usuario() u: UsuarioSesion) { return this.auth.yo(u.id); }

  @Post('cambiar-clave') @HttpCode(200) @UseGuards(SesionGuard)
  cambiarClave(@Usuario() u: UsuarioSesion, @Body(new ZodPipe(cambiarClaveSchema)) d: z.output<typeof cambiarClaveSchema>) {
    return this.auth.cambiarClave(u.id, d.claveActual, d.claveNueva);
  }
}
