import { cargarEnv } from '../src/config/env';

// Las pruebas nunca envían correos ni cobran de verdad, aunque apps/api/.env tenga credenciales reales
Object.assign(process.env, {
  PGDATABASE: 'hotel_marea_alta_test', SIN_LIMITES: 'true', SMTP_HOST: '', PASARELA: 'simulada', FACTURACION: 'simulado',
  PROCESOS_EN_SEGUNDO_PLANO: 'false', SERIE_BOLETA: 'B001', SERIE_FACTURA: 'F001', NODE_ENV: 'test'
});
cargarEnv();
