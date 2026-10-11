import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth/auth.controller';
import { AuthService } from './auth/auth.service';
import { SesionGuard } from './auth/guards';
import { FiltroErrores } from './comun/errores';
import { LimiteGuard } from './comun/limite.guard';
import { Db } from './db/db.service';
import { AdminController } from './gestion/admin.controller';
import { ClientesController } from './gestion/clientes.controller';
import { HabitacionesController } from './gestion/habitaciones.controller';
import { MetricasController } from './gestion/metricas.controller';
import { PagosController } from './gestion/pagos.controller';
import { ReservasGestionController } from './gestion/reservas-gestion.controller';
import { PublicoController } from './publico/publico.controller';
import { ReservasService } from './reservas/reservas.service';

@Module({
  imports: [JwtModule.register({})],
  controllers: [PublicoController, AuthController, ReservasGestionController, HabitacionesController, ClientesController,
    PagosController, MetricasController, AdminController],
  providers: [Db, AuthService, ReservasService, SesionGuard,
    { provide: APP_GUARD, useClass: LimiteGuard },
    { provide: APP_FILTER, useClass: FiltroErrores }]
})
export class AppModule {}
