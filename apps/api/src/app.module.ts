import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { BitacoraController } from './auditoria/bitacora.controller';
import { Bitacora } from './auditoria/bitacora.service';
import { AuthController } from './auth/auth.controller';
import { AuthService } from './auth/auth.service';
import { SesionGuard } from './auth/guards';
import { middlewareContexto } from './comun/contexto';
import { FiltroErrores } from './comun/errores';
import { LimiteGuard } from './comun/limite.guard';
import { CorreosController } from './correo/correos.controller';
import { Correos } from './correo/correos.service';
import { EncuestasController } from './correo/encuestas.controller';
import { CorreosProgramados } from './correo/programados.service';
import { Db } from './db/db.service';
import { FacturacionController } from './facturacion/facturacion.controller';
import { Facturacion } from './facturacion/facturacion.service';
import { AdminController } from './gestion/admin.controller';
import { ClientesController } from './gestion/clientes.controller';
import { HabitacionesController } from './gestion/habitaciones.controller';
import { MetricasController } from './gestion/metricas.controller';
import { PagosController } from './gestion/pagos.controller';
import { ReservasGestionController } from './gestion/reservas-gestion.controller';
import { PagosEnLineaController } from './pagos-en-linea/pagos-en-linea.controller';
import { PagosEnLinea } from './pagos-en-linea/pagos-en-linea.service';
import { Devoluciones } from './pagos/devoluciones.service';
import { PagosService } from './pagos/pagos.service';
import { PublicoController } from './publico/publico.controller';
import { ReservasService } from './reservas/reservas.service';

const CONTROLADORES = [PublicoController, AuthController, ReservasGestionController, HabitacionesController, ClientesController,
  PagosController, MetricasController, AdminController, BitacoraController, PagosEnLineaController, FacturacionController,
  CorreosController, EncuestasController];

@Module({
  imports: [JwtModule.register({})],
  controllers: CONTROLADORES,
  providers: [Db, AuthService, ReservasService, SesionGuard, Bitacora, Correos, PagosService, PagosEnLinea, Facturacion,
    Devoluciones, CorreosProgramados,
    { provide: APP_GUARD, useClass: LimiteGuard },
    { provide: APP_FILTER, useClass: FiltroErrores }]
})
export class AppModule implements NestModule {
  /** Contexto por petición (IP y usuario) para la bitácora. */
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(middlewareContexto).forRoutes(...CONTROLADORES);
  }
}
