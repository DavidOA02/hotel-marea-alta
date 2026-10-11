import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { hoyLima, sumarDias } from '@marea/shared';
import request from 'supertest';
import { AppModule } from '../src/app.module';

process.env.PGDATABASE = 'hotel_marea_alta_test';
process.env.SIN_LIMITES = 'true';

const hoy = hoyLima();
const d = (n: number) => sumarDias(hoy, n);
const huesped = (n: number, extra: object = {}) => ({
  tipoHabitacion: 'horizonte', fechaEntrada: d(20), fechaSalida: d(23), huespedes: 2, nombres: `Huésped${n}`, apellidos: 'Prueba',
  tipoDocumento: 'DNI', numeroDocumento: String(41000000 + n), email: `h${n}@prueba.pe`, codigoPais: '51', telefono: '987654321',
  residencia: 'PE', aceptaPrivacidad: true, ...extra
});

describe('API Hotel Marea Alta (PostgreSQL real)', () => {
  let app: INestApplication;
  let http: ReturnType<typeof request>;
  let admin: string, recep: string;

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
    http = request(app.getHttpServer());
    admin = (await http.post('/api/auth/login').send({ email: 'admin@mareaalta.pe', clave: 'Admin2026!' })).body.accessToken;
    recep = (await http.post('/api/auth/login').send({ email: 'recepcion@mareaalta.pe', clave: 'Recepcion2026!' })).body.accessToken;
  });
  afterAll(async () => { await app.close(); });
  const A = () => ({ Authorization: `Bearer ${admin}` });
  const R = () => ({ Authorization: `Bearer ${recep}` });

  describe('Web pública', () => {
    it('salud y tipos', async () => {
      expect((await http.get('/api/salud')).body.estado).toBe('ok');
      const t = await http.get('/api/habitaciones/tipos');
      expect(t.body.map((x: any) => [x.codigo, x.precioNoche, x.totalHabitaciones])).toEqual([['duna', 450, 10], ['horizonte', 650, 10], ['pleamar', 1090, 4]]);
    });

    it('reserva de residente: IGV incluido y habitación asignada', async () => {
      const r = await http.post('/api/reservas').send(huesped(1)).expect(201);
      expect(r.body).toMatchObject({ estado: 'Confirmada', habitacion: '201', noches: 3, subtotal: 1652.54, igv: 297.46, total: 1950, exoneradoIgv: false });
      expect(r.body.codigo).toMatch(/^MA\d{7}$/);
    });

    it('extranjero con pasaporte: exonerado de IGV', async () => {
      const r = await http.post('/api/reservas').send(huesped(2, { residencia: 'EXT', tipoDocumento: 'PAS', numeroDocumento: 'AB123456', codigoPais: '1', telefono: '555 123 4567' })).expect(201);
      expect(r.body).toMatchObject({ igv: 0, total: 1652.54, exoneradoIgv: true, habitacion: '202' });
    });

    it('errores de validación (Zod compartido) con el campo indicado', async () => {
      const r1 = await http.post('/api/reservas').send(huesped(3, { fechaSalida: d(20) })).expect(400);
      expect(r1.body).toEqual({ mensaje: 'La salida debe ser al menos un día después de la llegada.', campo: 'fechaSalida' });
      const r2 = await http.post('/api/reservas').send(huesped(3, { residencia: 'EXT' })).expect(400);
      expect(r2.body.campo).toBe('tipoDocumento');
      const r3 = await http.post('/api/reservas').send(huesped(3, { tipoHabitacion: 'duna', huespedes: 4 })).expect(400);
      expect(r3.body.campo).toBe('huespedes');
    });

    it('CONCURRENCIA: 6 personas compiten por 4 suites → exactamente 4 reservas, sin cruces', async () => {
      const rs = await Promise.all([1, 2, 3, 4, 5, 6].map(i => http.post('/api/reservas').send(huesped(100 + i, { tipoHabitacion: 'pleamar', fechaEntrada: d(40), fechaSalida: d(42) }))));
      const ok = rs.filter(r => r.status === 201);
      expect(ok).toHaveLength(4);
      expect(new Set(ok.map(r => r.body.habitacion)).size).toBe(4);
      rs.filter(r => r.status !== 201).forEach(r => { expect(r.status).toBe(409); expect(r.body.mensaje).toMatch(/No quedan habitaciones Suite Pleamar/); });
      const disp = await http.get(`/api/disponibilidad?entrada=${d(40)}&salida=${d(42)}&huespedes=2`);
      expect(disp.body.find((x: any) => x.codigo === 'pleamar').disponibles).toBe(0);
    });

    it('Mi reserva: consulta y cancelación', async () => {
      const r = await http.post('/api/reservas').send(huesped(7, { tipoHabitacion: 'duna' })).expect(201);
      const c = await http.get(`/api/reservas/${r.body.codigo.toLowerCase()}?email=H7@PRUEBA.PE`).expect(200);
      expect(c.body).toMatchObject({ titular: 'Huésped7 Prueba', puedeCancelar: true });
      await http.get(`/api/reservas/${r.body.codigo}?email=otro@x.pe`).expect(404);
      const x = await http.post(`/api/reservas/${r.body.codigo}/cancelar`).send({ email: 'h7@prueba.pe' }).expect(200);
      expect(x.body.estado).toBe('Cancelada');
    });

    it('Libro de Reclamaciones: correlativo único aun con envíos simultáneos', async () => {
      const hoja = { tipo: 'Reclamo', nombreCompleto: 'Rosa Huamán', tipoDocumento: 'DNI', numeroDocumento: '40404040', domicilio: 'Av. Lima 1', telefono: '987654321',
        email: 'rosa@prueba.pe', bienTipo: 'Servicio', montoReclamado: '', descripcionBien: 'Hospedaje', detalle: 'Sin agua caliente', pedido: 'Descuento', declaraVeracidad: true, aceptaPrivacidad: true };
      const rs = await Promise.all([1, 2, 3].map(() => http.post('/api/reclamaciones').send(hoja)));
      const nums = rs.map(r => r.body.numero).sort();
      expect(nums).toEqual([`00001-${hoy.slice(0, 4)}`, `00002-${hoy.slice(0, 4)}`, `00003-${hoy.slice(0, 4)}`]);
      expect(rs[0].body.mensaje).toMatch(/Responderemos a más tardar el/);
    });
  });

  describe('Autenticación y roles', () => {
    it('sin token → 401; recepcionista en reportes/usuarios → 403', async () => {
      await http.get('/api/gestion/dashboard').expect(401);
      expect((await http.get('/api/gestion/reportes').set(R())).status).toBe(403);
      expect((await http.get('/api/gestion/usuarios').set(R())).status).toBe(403);
      expect((await http.get('/api/gestion/reportes').set(A())).status).toBe(200);
    });

    it('bloquea la cuenta tras 5 intentos fallidos', async () => {
      await http.post('/api/gestion/usuarios').set(A()).send({ nombre: 'Luis', email: 'luis@mareaalta.pe', rol: 'Recepcionista', clave: 'Luis2026x' }).expect(201);
      for (let i = 0; i < 5; i++) await http.post('/api/auth/login').send({ email: 'luis@mareaalta.pe', clave: 'mala' }).expect(401);
      const r = await http.post('/api/auth/login').send({ email: 'luis@mareaalta.pe', clave: 'Luis2026x' });
      expect(r.status).toBe(423);
    });

    it('renovación de sesión y cierre de sesiones al cambiar la contraseña', async () => {
      const l = (await http.post('/api/auth/login').send({ email: 'recepcion@mareaalta.pe', clave: 'Recepcion2026!' })).body;
      const n = await http.post('/api/auth/renovar').send({ refreshToken: l.refreshToken }).expect(200);
      await http.get('/api/auth/yo').set({ Authorization: `Bearer ${n.body.accessToken}` }).expect(200);
      const c = await http.post('/api/auth/cambiar-clave').set({ Authorization: `Bearer ${n.body.accessToken}` }).send({ claveActual: 'Recepcion2026!', claveNueva: 'Nueva2026x' }).expect(200);
      await http.get('/api/auth/yo').set({ Authorization: `Bearer ${n.body.accessToken}` }).expect(401);    // token viejo
      await http.post('/api/auth/renovar').send({ refreshToken: l.refreshToken }).expect(401);              // refresh viejo
      recep = c.body.accessToken;
      await http.get('/api/auth/yo').set(R()).expect(200);
    });

    it('el administrador no puede quitarse su rol', async () => {
      const yo = (await http.get('/api/auth/yo').set(A())).body;
      const r = await http.put(`/api/gestion/usuarios/${yo.id}`).set(A()).send({ nombre: yo.nombre, email: yo.email, rol: 'Recepcionista', activo: true });
      expect(r.status).toBe(409);
    });
  });

  describe('Panel de gestión', () => {
    it('walk-in con check-in inmediato → pago → check-out → habitación por limpiar', async () => {
      const w = await http.post('/api/gestion/reservas').set(R()).send({
        cliente: { nombres: 'Pedro', apellidos: 'Castillo', tipoDocumento: 'DNI', numeroDocumento: '47474747', email: 'pedro@x.pe', codigoPais: '51', telefono: '999888777', residencia: 'PE' },
        tipoHabitacion: 'duna', fechaEntrada: hoy, fechaSalida: d(2), huespedes: 2, residencia: 'PE', canal: 'Recepcion', checkInInmediato: true }).expect(201);
      expect(w.body.estado).toBe('CheckIn');
      const cod = w.body.codigo;
      const co = await http.post(`/api/gestion/reservas/${cod}/checkout`).set(R()).send({}).expect(409);
      expect(co.body.mensaje).toMatch(/saldo pendiente de S\/ 900\.00/);
      await http.post(`/api/gestion/reservas/${cod}/pagos`).set(R()).send({ monto: 1000, moneda: 'PEN', metodo: 'Yape' }).expect(409);
      const p = await http.post(`/api/gestion/reservas/${cod}/pagos`).set(R()).send({ monto: 100, moneda: 'USD', tipoCambio: 3.7, metodo: 'Tarjeta' }).expect(200);
      expect(p.body).toMatchObject({ pagado: 370, saldo: 530 });
      await http.post(`/api/gestion/reservas/${cod}/pagos`).set(R()).send({ monto: 530, moneda: 'PEN', metodo: 'Yape', referencia: 'OP-1' }).expect(200);
      await http.post(`/api/gestion/reservas/${cod}/checkout`).set(R()).send({}).expect(200);
      const habs = (await http.get('/api/gestion/habitaciones').set(R())).body;
      expect(habs.find((h: any) => h.numero === '101').estadoLimpieza).toBe('Sucia');
      const rec = (await http.get('/api/gestion/recepcion').set(R())).body;
      expect(rec.limpieza.map((h: any) => h.numero)).toContain('101');
      const caja = (await http.get('/api/gestion/pagos').set(R())).body;
      expect(caja.total).toBe(900);
      expect(caja.porMetodo.map((x: any) => x.metodo).sort()).toEqual(['Tarjeta', 'Yape']);
    });

    it('anular pagos: recepcionista 403, administrador OK; no en estadías cerradas', async () => {
      const r = await http.post('/api/gestion/reservas').set(R()).send({ clienteId: 1, tipoHabitacion: 'duna', fechaEntrada: hoy, fechaSalida: d(1), huespedes: 1, residencia: 'PE', canal: 'Telefono', checkInInmediato: true }).expect(201);
      await http.post(`/api/gestion/reservas/${r.body.codigo}/pagos`).set(R()).send({ monto: 50, moneda: 'PEN', metodo: 'Efectivo' }).expect(200);
      const pago = (await http.get('/api/gestion/pagos').set(R())).body.pagos.find((p: any) => p.codigoReserva === r.body.codigo);
      await http.post(`/api/gestion/pagos/${pago.id}/anular`).set(R()).send({ motivo: 'error de digitación' }).expect(403);
      await http.post(`/api/gestion/pagos/${pago.id}/anular`).set(A()).send({ motivo: 'error de digitación' }).expect(200);
      const cerrado = (await http.get('/api/gestion/pagos').set(A())).body.pagos.find((p: any) => p.metodo === 'Yape');
      await http.post(`/api/gestion/pagos/${cerrado.id}/anular`).set(A()).send({ motivo: 'prueba de bloqueo' }).expect(409);
    });

    it('habitaciones: CRUD solo admin y protección del historial', async () => {
      await http.post('/api/gestion/habitaciones').set(R()).send({ numero: '401', piso: 4, tipoHabitacion: 'pleamar', estado: 'Operativa' }).expect(403);
      const c = await http.post('/api/gestion/habitaciones').set(A()).send({ numero: '401', piso: 4, tipoHabitacion: 'pleamar', estado: 'Operativa' }).expect(201);
      await http.post('/api/gestion/habitaciones').set(A()).send({ numero: '401', piso: 4, tipoHabitacion: 'pleamar', estado: 'Operativa' }).expect(409);
      await http.delete(`/api/gestion/habitaciones/${c.body.id}`).set(A()).expect(200);
      const con = (await http.get('/api/gestion/habitaciones').set(A())).body.find((h: any) => h.numero === '201');
      await http.delete(`/api/gestion/habitaciones/${con.id}`).set(A()).expect(409);
    });

    it('clientes: búsqueda, ficha con historial y documento único', async () => {
      const b = (await http.get('/api/gestion/clientes?buscar=Pedro').set(R())).body;
      expect(b[0]).toMatchObject({ nombres: 'Pedro', reservas: 1, estadias: 1, totalGastado: 900 });
      const f = (await http.get(`/api/gestion/clientes/${b[0].id}`).set(R())).body;
      expect(f.reservas).toHaveLength(1);
      await http.post('/api/gestion/clientes').set(R()).send({ nombres: 'Otro', apellidos: 'X', tipoDocumento: 'DNI', numeroDocumento: '47474747', email: 'o@x.pe', codigoPais: '51', telefono: '911222333', residencia: 'PE' }).expect(409);
    });

    it('dashboard y reportes', async () => {
      const db = (await http.get('/api/gestion/dashboard').set(R())).body;
      expect(db.proximos14).toHaveLength(14);
      expect(db.meses).toHaveLength(6);
      expect(db.habitaciones.operativas).toBe(24);
      const rp = (await http.get(`/api/gestion/reportes?desde=${hoy}&hasta=${d(45)}`).set(A())).body;
      expect(rp.nochesOcupadas).toBeGreaterThan(0);
      expect(rp.adr).toBeGreaterThan(0);
      expect(rp.porDiaSemana).toHaveLength(7);
    });
  });
});
