import { cargarEnv } from '../src/config/env';
import { comprobarBaseE2e, configuracionLocal } from './preparar-bd';

cargarEnv();
configuracionLocal(process.env);
const database = comprobarBaseE2e(process.env.MAREA_E2E_BD);

// Las pruebas nunca envían correos ni cobran de verdad, aunque apps/api/.env tenga credenciales reales
Object.assign(process.env, {
  PGDATABASE: database, SIN_LIMITES: 'true', SMTP_HOST: '', PASARELA: 'simulada', FACTURACION: 'simulado',
  PROCESOS_EN_SEGUNDO_PLANO: 'false', SERIE_BOLETA: 'B001', SERIE_FACTURA: 'F001', NODE_ENV: 'test'
});
