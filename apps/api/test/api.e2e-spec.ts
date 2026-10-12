import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { hoyLima, sumarDias } from '@marea/shared';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { Correos } from '../src/correo/correos.service';
import { Db } from '../src/db/db.service';
import { PagosEnLinea } from '../src/pagos-en-linea/pagos-en-linea.service';
import { Simulada } from '../src/pagos-en-linea/pasarelas';
import { CorreosProgramados } from '../src/correo/programados.service';

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

  /* ============================== Mejoras ============================== */
  const db = () => app.get(Db);
  const ficha = async (codigo: string) => (await http.get(`/api/gestion/reservas/${codigo}`).set(R()).expect(200)).body;
  const reservaPanel = async (extra: object) => (await http.post('/api/gestion/reservas').set(R())
    .send({ clienteId: 1, tipoHabitacion: 'horizonte', huespedes: 2, residencia: 'PE', canal: 'Telefono', ...extra }).expect(201)).body;
  const pagarTodo = async (codigo: string) => {
    const r = (await ficha(codigo)).reserva;
    await http.post(`/api/gestion/reservas/${codigo}/pagos`).set(R()).send({ monto: r.saldo, moneda: 'PEN', metodo: 'Efectivo' }).expect(200);
  };

  describe('Correos automáticos', () => {
    it('la reserva encola la confirmación y el proceso la marca como simulada (sin SMTP)', async () => {
      const r = await http.post('/api/reservas').send(huesped(300, { tipoHabitacion: 'duna', fechaEntrada: d(80), fechaSalida: d(81) })).expect(201);
      expect(r.body.mensaje).toMatch(/Te enviamos los detalles/);
      let f = await ficha(r.body.codigo);
      expect(f.correos).toEqual([expect.objectContaining({ tipo: 'confirmacion', para: 'h300@prueba.pe', estado: 'Pendiente' })]);
      expect(await app.get(Correos).procesar()).toBeGreaterThanOrEqual(1);
      f = await ficha(r.body.codigo);
      expect(f.correos[0].estado).toBe('Simulado');
    });

    it('escapa el HTML de los datos que escribe el huésped', async () => {
      const r = await http.post('/api/reservas').send(huesped(301, { nombres: '<img src=x onerror=alert(1)>', tipoHabitacion: 'duna', fechaEntrada: d(82), fechaSalida: d(83) })).expect(201);
      const [c] = await db().query(`SELECT html FROM correos k JOIN reservas r ON r.id = k.reserva_id WHERE r.codigo = $1`, [r.body.codigo]);
      expect(c.html).not.toContain('<img');
      expect(c.html).toContain('confirmada, &lt;img!');   // el saludo usa el primer nombre, escapado
    });

    it('cancelar desde el panel avisa al huésped', async () => {
      const r = await reservaPanel({ tipoHabitacion: 'duna', fechaEntrada: d(84), fechaSalida: d(85) });
      await http.post(`/api/gestion/reservas/${r.codigo}/cancelar`).set(R()).send({}).expect(200);
      expect((await ficha(r.codigo)).correos.map((c: any) => c.tipo)).toEqual(['confirmacion', 'cancelacion']);
    });

    it('Libro de Reclamaciones: constancia al registrar y respuesta automática al consumidor', async () => {
      const hoja = { tipo: 'Queja', nombreCompleto: 'Ana Ríos', tipoDocumento: 'DNI', numeroDocumento: '40404041', domicilio: 'Av. Lima 2', telefono: '987654321',
        email: 'ana.rios@prueba.pe', bienTipo: 'Servicio', montoReclamado: '', descripcionBien: 'Hospedaje', detalle: 'Ruido de noche', pedido: 'Mejorar', declaraVeracidad: true, aceptaPrivacidad: true };
      const h = (await http.post('/api/reclamaciones').send(hoja).expect(201)).body;
      expect(h.mensaje).toMatch(/Te enviamos la constancia a ana.rios@prueba.pe/);
      expect((await http.get(`/api/gestion/reclamaciones/${h.numero}`).set(R()).expect(200)).body.correos.map((c: any) => c.tipo)).toEqual(['reclamo_constancia']);
      const resp = await http.patch(`/api/gestion/reclamaciones/${h.numero}/respuesta`).set(A()).send({ respuesta: 'Lamentamos las molestias; instalamos ventanas acústicas.' }).expect(200);
      expect(resp.body.mensaje).toMatch(/enviada a ana.rios@prueba.pe/);
      const det = (await http.get(`/api/gestion/reclamaciones/${h.numero}`).set(R())).body;
      expect(det.correos.map((c: any) => c.tipo)).toEqual(['reclamo_constancia', 'reclamo_respuesta']);
    });
  });

  describe('Cambio de habitación', () => {
    it('antes de la llegada: mantener tarifa, recalcular y validaciones', async () => {
      const r = await reservaPanel({ fechaEntrada: d(60), fechaSalida: d(63) });
      const op = (await http.get(`/api/gestion/reservas/${r.codigo}/cambio-habitacion`).set(R()).expect(200)).body;
      expect(op).toMatchObject({ desde: d(60), nochesRestantes: 3, total: 1950 });
      expect(op.opciones.map((h: any) => h.numero)).not.toContain(r.habitacion);
      expect(op.opciones.every((h: any) => h.capacidad >= 2)).toBe(true);
      const otraHorizonte = op.opciones.find((h: any) => h.tipoCodigo === 'horizonte');
      const suite = op.opciones.find((h: any) => h.tipoCodigo === 'pleamar');
      expect(suite.totalRecalculado).toBe(3270);

      const corto = await http.post(`/api/gestion/reservas/${r.codigo}/cambiar-habitacion`).set(R()).send({ habitacionId: otraHorizonte.id, tarifa: 'Mantener', motivo: 'x' }).expect(400);
      expect(corto.body.campo).toBe('motivo');
      const m = await http.post(`/api/gestion/reservas/${r.codigo}/cambiar-habitacion`).set(R()).send({ habitacionId: otraHorizonte.id, tarifa: 'Mantener', motivo: 'Pidió piso más alto' }).expect(200);
      expect(m.body).toMatchObject({ habitacionAnterior: r.habitacion, habitacion: otraHorizonte.numero, total: 1950 });
      await http.post(`/api/gestion/reservas/${r.codigo}/cambiar-habitacion`).set(R()).send({ habitacionId: otraHorizonte.id, tarifa: 'Mantener', motivo: 'Otra vez' }).expect(409);

      const s = await http.post(`/api/gestion/reservas/${r.codigo}/cambiar-habitacion`).set(R()).send({ habitacionId: suite.id, tarifa: 'Recalcular', motivo: 'Upgrade pagado' }).expect(200);
      expect(s.body).toMatchObject({ habitacion: suite.numero, totalAnterior: 1950, total: 3270 });
      const f = await ficha(r.codigo);
      expect(f.reserva).toMatchObject({ total: 3270, subtotal: 2771.19, igv: 498.81, habitacionDesde: null, tipoHabitacion: 'Suite Pleamar' });
      expect(f.cambios).toHaveLength(2);
      expect(f.historial.map((x: any) => x.accion)).toEqual(['reserva.crear', 'reserva.cambiar_habitacion', 'reserva.cambiar_habitacion']);
    });

    it('no permite pasar a una habitación ocupada en esas fechas', async () => {
      const a = await reservaPanel({ tipoHabitacion: 'duna', fechaEntrada: d(90), fechaSalida: d(93) });
      const b = await reservaPanel({ tipoHabitacion: 'duna', fechaEntrada: d(92), fechaSalida: d(94) });
      const habB = (await ficha(b.codigo)).reserva.habitacionId;
      const op = (await http.get(`/api/gestion/reservas/${a.codigo}/cambio-habitacion`).set(R())).body;
      expect(op.opciones.map((h: any) => h.id)).not.toContain(habB);
      const x = await http.post(`/api/gestion/reservas/${a.codigo}/cambiar-habitacion`).set(R()).send({ habitacionId: habB, tarifa: 'Mantener', motivo: 'Prueba de choque' }).expect(409);
      expect(x.body.campo).toBe('habitacionId');
    });

    it('huésped en el hotel: cambia desde hoy, sin falsos cruces con noches pasadas, y la habitación anterior queda por limpiar', async () => {
      const [h1, h2] = await db().query<any>(`SELECT id, numero FROM habitaciones WHERE numero IN ('108','109') ORDER BY numero`);
      // En curso en la 108 (llegó hace 2 días) y una reserva de la 109 que terminaba hoy sin check-in (aún sin marcar No show)
      const [enCurso] = await db().query<any>(`INSERT INTO reservas (codigo, cliente_id, habitacion_id, fecha_entrada, fecha_salida, huespedes, subtotal, igv, total, estado, canal, fecha_check_in)
        VALUES ('MA9900001', 1, $1, $2, $3, 2, 1525.42, 274.58, 1800, 'CheckIn', 'Recepcion', now()) RETURNING codigo`, [h1.id, d(-2), d(2)]);
      await db().query(`INSERT INTO reservas (codigo, cliente_id, habitacion_id, fecha_entrada, fecha_salida, huespedes, subtotal, igv, total, estado, canal)
        VALUES ('MA9900002', 1, $1, $2, $3, 1, 762.71, 137.29, 900, 'Confirmada', 'Web')`, [h2.id, d(-2), hoy]);
      const r = await http.post(`/api/gestion/reservas/${enCurso.codigo}/cambiar-habitacion`).set(R()).send({ habitacionId: h2.id, tarifa: 'Recalcular', motivo: 'Fuga de agua en el baño' }).expect(200);
      expect(r.body).toMatchObject({ habitacion: '109', desde: hoy, total: 1800 });   // misma tarifa: el total no cambia
      expect(r.body.advertencia).toMatch(/108 pasó a «Por limpiar»/);
      const f = await ficha(enCurso.codigo);
      expect(f.reserva).toMatchObject({ habitacion: '109', habitacionDesde: hoy, estado: 'CheckIn' });
      expect((await http.get('/api/gestion/habitaciones').set(R())).body.find((h: any) => h.numero === '108').estadoLimpieza).toBe('Sucia');
      // La 108 queda libre desde hoy para otra reserva
      await reservaPanel({ tipoHabitacion: 'duna', habitacionId: h1.id, fechaEntrada: hoy, fechaSalida: d(1) });
    });

    it('la restricción de la base rechaza cruces aunque falle la validación de la API', async () => {
      const [h] = await db().query<any>(`SELECT id FROM habitaciones WHERE numero = '109'`);
      await expect(db().query(`INSERT INTO reservas (codigo, cliente_id, habitacion_id, fecha_entrada, fecha_salida, huespedes, subtotal, igv, total)
        VALUES ('MA9900003', 1, $1, $2, $3, 1, 381.36, 68.64, 450)`, [h.id, d(1), d(2)])).rejects.toMatchObject({ code: '23P01' });
    });
  });

  describe('Pagos en línea (pasarela simulada)', () => {
    let codigo = '';
    it('crea la orden con el saldo de la reserva, rechaza y luego aprueba', async () => {
      const r = await http.post('/api/reservas').send(huesped(400, { tipoHabitacion: 'duna', fechaEntrada: d(70), fechaSalida: d(72) })).expect(201);
      codigo = r.body.codigo;
      expect(r.body.puedePagarEnLinea).toBe(true);
      await http.post('/api/pagos-en-linea').send({ codigo, email: 'otro@prueba.pe' }).expect(404);
      await http.get('/api/pagos-en-linea/no-es-un-uuid').expect(404);

      const o1 = (await http.post('/api/pagos-en-linea').send({ codigo, email: 'H400@prueba.pe' }).expect(201)).body;
      expect(o1).toMatchObject({ pasarela: 'Simulada', monto: 900 });
      expect((await http.get(`/api/pagos-en-linea/${o1.id}`).expect(200)).body).toMatchObject({ estado: 'Pendiente', codigoReserva: codigo, datosCheckout: { modo: 'simulada' } });
      await http.post(`/api/pagos-en-linea/${o1.id}/culqi`).send({ token: 'tkn_test_abcdefgh' }).expect(400);   // otra pasarela
      expect((await http.post(`/api/pagos-en-linea/${o1.id}/simulada`).send({ aprobar: false }).expect(200)).body).toMatchObject({ estado: 'Rechazado', datosCheckout: null });
      await http.post(`/api/pagos-en-linea/${o1.id}/simulada`).send({ aprobar: true }).expect(409);

      const o2 = (await http.post('/api/pagos-en-linea').send({ codigo, email: 'h400@prueba.pe' }).expect(201)).body;
      expect((await http.post(`/api/pagos-en-linea/${o2.id}/simulada`).send({ aprobar: true }).expect(200)).body.estado).toBe('Aprobado');
      const pub = (await http.get(`/api/reservas/${codigo}?email=h400@prueba.pe`)).body;
      expect(pub).toMatchObject({ pagado: 900, saldo: 0, puedePagarEnLinea: false });
      const f = await ficha(codigo);
      expect(f.pagos).toEqual([expect.objectContaining({ montoSoles: 900, metodo: 'Tarjeta', pasarela: 'Simulada', registradoPor: 'Web · Simulada', referencia: expect.stringMatching(/^SIM-/) })]);
      expect(f.correos.map((c: any) => c.tipo)).toEqual(['confirmacion', 'pago']);
      expect(f.historial.some((x: any) => x.accion === 'pago.en_linea' && x.usuario === 'Pasarela Simulada')).toBe(true);
      await http.post('/api/pagos-en-linea').send({ codigo, email: 'h400@prueba.pe' }).expect(409);   // sin saldo
    });

    it('avisos repetidos o simultáneos de la pasarela registran el pago una sola vez', async () => {
      const r = await http.post('/api/reservas').send(huesped(401, { tipoHabitacion: 'duna', fechaEntrada: d(74), fechaSalida: d(75) })).expect(201);
      const o = (await http.post('/api/pagos-en-linea').send({ codigo: r.body.codigo, email: 'h401@prueba.pe' }).expect(201)).body;
      const orden = { id: o.id, numero: 1, monto: o.monto, email: '', codigoReserva: r.body.codigo, titular: '', expira: new Date() };
      const svc = app.get(PagosEnLinea);
      await Promise.all([svc.finalizar(o.id, Simulada.resultado(orden, true)), svc.finalizar(o.id, Simulada.resultado(orden, true)), svc.finalizar(o.id, Simulada.resultado(orden, true))]);
      await svc.finalizar(o.id, Simulada.resultado(orden, false));   // un aviso tardío de rechazo no deshace el pago
      const f = await ficha(r.body.codigo);
      expect(f.pagos).toHaveLength(1);
      expect(f.reserva.saldo).toBe(0);
      expect((await http.get(`/api/pagos-en-linea/${o.id}`)).body.estado).toBe('Aprobado');
    });
  });

  describe('Facturación electrónica (OSE simulado)', () => {
    it('boleta para residente: correlativo, montos y correo al cliente; no se duplica', async () => {
      const r = await reservaPanel({ tipoHabitacion: 'duna', fechaEntrada: d(100), fechaSalida: d(102) });
      await http.post(`/api/gestion/reservas/${r.codigo}/comprobante`).set(R()).send({ tipo: 'Boleta' }).expect(409);   // aún no pagada
      await pagarTodo(r.codigo);
      const b = (await http.post(`/api/gestion/reservas/${r.codigo}/comprobante`).set(R()).send({ tipo: 'Boleta' }).expect(201)).body;
      expect(b).toMatchObject({ tipo: '03', serie: 'B001', numero: 1, estado: 'Aceptado', tipoOperacion: '0101', gravada: 762.71, igv: 137.29, total: 900, proveedor: 'Simulado' });
      expect(b.mensaje).toBe('Boleta B001-1 aceptada por SUNAT.');
      expect(b.cadenaQr).toMatch(/^20000000000\|03\|B001\|1\|137\.29\|900\.00\|/);
      await http.post(`/api/gestion/reservas/${r.codigo}/comprobante`).set(R()).send({ tipo: 'Boleta' }).expect(409);
      const f = await ficha(r.codigo);
      expect(f.comprobantes).toHaveLength(1);
      expect(f.correos.map((c: any) => c.tipo)).toContain('comprobante');
      // Con comprobante emitido no se recalcula la tarifa al cambiar de habitación
      const op = (await http.get(`/api/gestion/reservas/${r.codigo}/cambio-habitacion`).set(R())).body;
      expect(op.tieneComprobante).toBe(true);
      const x = await http.post(`/api/gestion/reservas/${r.codigo}/cambiar-habitacion`).set(R()).send({ habitacionId: op.opciones[0].id, tarifa: 'Recalcular', motivo: 'Prueba con comprobante' }).expect(409);
      expect(x.body.campo).toBe('tarifa');

      // Anular: solo administrador; luego se puede emitir otra con el siguiente número
      await http.post(`/api/gestion/comprobantes/${b.id}/anular`).set(R()).send({ motivo: 'Datos del cliente errados' }).expect(403);
      await http.post(`/api/gestion/comprobantes/${b.id}/anular`).set(A()).send({ motivo: 'Datos del cliente errados' }).expect(200);
      const b2 = (await http.post(`/api/gestion/reservas/${r.codigo}/comprobante`).set(R()).send({ tipo: 'Boleta' }).expect(201)).body;
      expect(b2).toMatchObject({ serie: 'B001', numero: 2, estado: 'Aceptado' });
    });

    it('factura con RUC y factura de exportación para extranjero con pasaporte', async () => {
      const r = await reservaPanel({ fechaEntrada: d(104), fechaSalida: d(105) });
      await pagarTodo(r.codigo);
      const mal = await http.post(`/api/gestion/reservas/${r.codigo}/comprobante`).set(R()).send({ tipo: 'Factura', ruc: '30123456789', razonSocial: 'X', direccion: 'Y' }).expect(400);
      expect(mal.body.campo).toBe('ruc');
      await http.post(`/api/gestion/reservas/${r.codigo}/comprobante`).set(R()).send({ tipo: 'Factura', exportacion: true }).expect(400);
      const f = (await http.post(`/api/gestion/reservas/${r.codigo}/comprobante`).set(R())
        .send({ tipo: 'Factura', ruc: '20123456789', razonSocial: 'Viajes del Sur SAC', direccion: 'Av. Grau 100, Ica' }).expect(201)).body;
      expect(f).toMatchObject({ tipo: '01', serie: 'F001', numero: 1, clienteTipoDoc: '6', clienteNumDoc: '20123456789', clienteNombre: 'VIAJES DEL SUR SAC', total: 650 });

      const ext = await http.post('/api/gestion/reservas').set(R()).send({
        cliente: { nombres: 'John', apellidos: 'Smith', tipoDocumento: 'PAS', numeroDocumento: 'US1234567', email: 'john@prueba.com', codigoPais: '1', telefono: '5551234567', residencia: 'EXT' },
        tipoHabitacion: 'horizonte', fechaEntrada: d(106), fechaSalida: d(108), huespedes: 2, residencia: 'EXT', canal: 'WhatsApp' }).expect(201);
      await pagarTodo(ext.body.codigo);
      const e = (await http.post(`/api/gestion/reservas/${ext.body.codigo}/comprobante`).set(R()).send({ tipo: 'Factura', exportacion: true }).expect(201)).body;
      expect(e).toMatchObject({ tipo: '01', serie: 'F001', numero: 2, tipoOperacion: '0202', clienteTipoDoc: '7', clienteNumDoc: 'US1234567', exportacion: 1101.69, gravada: 0, igv: 0, total: 1101.69 });
      expect(e.items[0]).toMatchObject({ afectacion: '40', cantidad: 1 });
    });

    it('correlativo sin huecos ni duplicados con emisiones simultáneas', async () => {
      const codigos: string[] = [];
      for (let i = 0; i < 4; i++) { const r = await reservaPanel({ tipoHabitacion: 'duna', fechaEntrada: d(110 + i * 2), fechaSalida: d(111 + i * 2) }); await pagarTodo(r.codigo); codigos.push(r.codigo); }
      const rs = await Promise.all(codigos.map(c => http.post(`/api/gestion/reservas/${c}/comprobante`).set(R()).send({ tipo: 'Boleta' })));
      expect(rs.map(x => x.status)).toEqual([201, 201, 201, 201]);
      expect(rs.map(x => x.body.numero).sort((a, b) => a - b)).toEqual([3, 4, 5, 6]);
      const lista = (await http.get(`/api/gestion/comprobantes?desde=${hoy}&hasta=${hoy}`).set(R()).expect(200)).body;
      expect(lista.totales).toMatchObject({ cantidad: 7, rechazados: 0, pendientes: 0 });   // B001-2..6, F001-1, F001-2 (B001-1 anulada)
    });
  });

  describe('Bitácora de auditoría', () => {
    it('solo el administrador la consulta y registra quién, qué y desde qué IP', async () => {
      await http.get('/api/gestion/bitacora').set(R()).expect(403);
      const h108 = (await http.get('/api/gestion/habitaciones').set(R())).body.find((h: any) => h.numero === '108');
      await http.patch(`/api/gestion/habitaciones/${h108.id}/limpieza`).set(R()).send({ estadoLimpieza: 'Limpia' }).expect(200);
      const b =(await http.get('/api/gestion/bitacora?limite=5000').set(A()).expect(200)).body as any[];
      const acciones = new Set(b.map(x => x.accion));
      for (const a of ['sesion.ingreso', 'sesion.fallida', 'sesion.bloqueo', 'sesion.cambiar_clave', 'reserva.crear', 'reserva.cancelar', 'reserva.checkout', 'pago.registrar',
        'pago.anular', 'pago.en_linea', 'habitacion.crear', 'habitacion.eliminar', 'habitacion.limpieza', 'usuario.crear', 'reclamo.registrar', 'reclamo.responder',
        'reserva.cambiar_habitacion', 'comprobante.emitir', 'comprobante.aceptado', 'comprobante.anular']) expect(acciones).toContain(a);
      const panel = b.find(x => x.accion === 'reserva.crear' && x.usuarioId);
      expect(panel).toMatchObject({ usuario: 'Recepción (Recepcionista)', entidad: 'reserva' });
      expect(panel.ip).toBeTruthy();
      expect(b.find(x => x.accion === 'reserva.crear' && !x.usuarioId).usuario).toBe('Huésped (web)');
      const filtro = (await http.get('/api/gestion/bitacora?entidad=sesion&buscar=luis').set(A())).body as any[];
      expect(filtro.length).toBeGreaterThan(0);
      expect(filtro.every(x => x.entidad === 'sesion')).toBe(true);
    });

    it('nunca guarda contraseñas y no se puede modificar ni borrar', async () => {
      const luis = (await http.get('/api/gestion/usuarios').set(A())).body.find((u: any) => u.email === 'luis@mareaalta.pe');
      await http.put(`/api/gestion/usuarios/${luis.id}`).set(A()).send({ nombre: 'Luis', email: luis.email, rol: 'Recepcionista', activo: true, clave: 'OtraClave2026' }).expect(200);
      const [e] = await db().query<any>(`SELECT datos::text AS datos FROM bitacora WHERE accion = 'usuario.editar' ORDER BY id DESC LIMIT 1`);
      expect(e.datos).toContain('restablecida');
      expect(e.datos).not.toMatch(/PBKDF2|OtraClave2026/);
      await expect(db().query(`UPDATE bitacora SET descripcion = 'alterado'`)).rejects.toThrow(/no se puede modificar ni borrar/);
      await expect(db().query(`DELETE FROM bitacora`)).rejects.toThrow(/no se puede modificar ni borrar/);
    });
  });
  /* ============================== Segunda tanda de mejoras ============================== */
  const reservaPagada = async (extra: object) => { const r = await reservaPanel(extra); await pagarTodo(r.codigo); return r; };
  const boleta = async (codigo: string) => (await http.post(`/api/gestion/reservas/${codigo}/comprobante`).set(R()).send({ tipo: 'Boleta' }).expect(201)).body;
  const nota = (id: number, d: object) => http.post(`/api/gestion/comprobantes/${id}/nota-credito`).set(A()).send(d);
  const pagoDe = async (codigo: string) => (await ficha(codigo)).pagos.find((p: any) => p.estado === 'Aprobado');

  describe('Notas de crédito', () => {
    it('parcial (09) rebaja la reserva; la total (01) neutraliza el comprobante y permite emitir otro', async () => {
      const r = await reservaPagada({ tipoHabitacion: 'duna', fechaEntrada: d(120), fechaSalida: d(122) });
      const b = await boleta(r.codigo);
      await http.post(`/api/gestion/comprobantes/${b.id}/nota-credito`).set(R()).send({ motivo: '01', sustento: 'Prueba de permisos' }).expect(403);
      expect((await nota(b.id, { motivo: '02', sustento: 'RUC errado' }).expect(400)).body.campo).toBe('motivo');   // solo facturas
      expect((await nota(b.id, { motivo: '09', monto: 1000, sustento: 'Demasiado' }).expect(409)).body.campo).toBe('monto');
      expect((await nota(b.id, { motivo: '09', monto: 900, sustento: 'Todo el monto' }).expect(409)).body.campo).toBe('monto');

      const n1 = (await nota(b.id, { motivo: '09', monto: 200, sustento: 'Descuento por ruido nocturno' }).expect(201)).body;
      expect(n1).toMatchObject({ tipo: '07', serie: 'BC01', numero: 1, estado: 'Aceptado', motivoNota: '09', refSerie: 'B001', refNumero: b.numero, total: 200, gravada: 169.49, igv: 30.51 });
      let f = await ficha(r.codigo);
      expect(f.reserva).toMatchObject({ total: 700, subtotal: 593.22, igv: 106.78, pagado: 900, saldo: -200 });
      expect(f.comprobantes.find((k: any) => k.id === b.id).disponibleNota).toBe(700);
      await http.post(`/api/gestion/comprobantes/${b.id}/anular`).set(A()).send({ motivo: 'Ya tiene nota' }).expect(409);   // con notas no hay baja

      const n2 = (await nota(b.id, { motivo: '01', sustento: 'Datos del huésped errados' }).expect(201)).body;
      expect(n2).toMatchObject({ serie: 'BC01', numero: 2, total: 700, motivoNota: '01' });
      f = await ficha(r.codigo);
      expect(f.comprobantes.find((k: any) => k.id === b.id)).toMatchObject({ estado: 'Aceptado', anuladoConNota: 'BC01-2', disponibleNota: 0 });
      expect(f.reserva.total).toBe(700);   // la nota total no cambia el importe de la reserva
      await nota(b.id, { motivo: '06', sustento: 'Otra nota más' }).expect(409);
      await nota(n1.id, { motivo: '01', sustento: 'Nota sobre nota' }).expect(409);
      const b2 = await boleta(r.codigo);   // neutralizada la anterior, se puede emitir otra por el total vigente
      expect(b2).toMatchObject({ serie: 'B001', total: 700 });
      expect(f.correos.filter((c: any) => c.tipo === 'comprobante')).toHaveLength(3);   // boleta + 2 notas

      // Registro de ventas: las notas restan
      const lista = (await http.get(`/api/gestion/comprobantes?desde=${hoy}&hasta=${hoy}`).set(A())).body;
      const validos = lista.comprobantes.filter((k: any) => ['Aceptado', 'Observado'].includes(k.estado));
      const esperado = Math.round(validos.reduce((s: number, k: any) => s + (k.tipo === '07' ? -k.total : k.total), 0) * 100) / 100;
      expect(lista.totales.total).toBe(esperado);
      expect(lista.totales.notas).toBe(2);
    });

    it('factura con RUC errado: nota 02 y nueva factura', async () => {
      const r = await reservaPagada({ fechaEntrada: d(124), fechaSalida: d(125) });
      const f1 = (await http.post(`/api/gestion/reservas/${r.codigo}/comprobante`).set(R()).send({ tipo: 'Factura', ruc: '20111111111', razonSocial: 'Empresa Equivocada SAC', direccion: 'Lima' }).expect(201)).body;
      const nc = (await nota(f1.id, { motivo: '02', sustento: 'El cliente indicó otro RUC' }).expect(201)).body;
      expect(nc).toMatchObject({ serie: 'FC01', numero: 1, total: 650, motivoNota: '02', clienteNumDoc: '20111111111' });
      const f2 = (await http.post(`/api/gestion/reservas/${r.codigo}/comprobante`).set(R()).send({ tipo: 'Factura', ruc: '20222222222', razonSocial: 'Empresa Correcta SAC', direccion: 'Ica' }).expect(201)).body;
      expect(f2).toMatchObject({ serie: 'F001', clienteNumDoc: '20222222222', total: 650 });
    });
  });

  describe('Devoluciones', () => {
    it('manual (efectivo): límites, saldo, caja neta y pago no anulable', async () => {
      const r = await reservaPagada({ tipoHabitacion: 'duna', fechaEntrada: d(126), fechaSalida: d(128) });
      const p = await pagoDe(r.codigo);
      await http.post(`/api/gestion/pagos/${p.id}/devolver`).set(R()).send({ monto: 100, motivo: 'Prueba de permisos' }).expect(403);
      expect((await http.post(`/api/gestion/pagos/${p.id}/devolver`).set(A()).send({ monto: 901, motivo: 'Demasiado' }).expect(409)).body.campo).toBe('monto');
      const dv = (await http.post(`/api/gestion/pagos/${p.id}/devolver`).set(A()).send({ monto: 300, motivo: 'Cobro duplicado en recepción' }).expect(200)).body;
      expect(dv).toMatchObject({ medio: 'Manual', estado: 'Completada', monto: 300 });
      const f = await ficha(r.codigo);
      expect(f.reserva).toMatchObject({ total: 900, pagado: 600, saldo: 300 });
      expect(f.pagos[0].disponibleDevolucion).toBe(600);
      expect(f.devoluciones).toHaveLength(1);
      expect(f.correos.map((c: any) => c.tipo)).toContain('devolucion');
      const caja = (await http.get(`/api/gestion/pagos?desde=${hoy}&hasta=${hoy}`).set(A())).body;
      expect(caja.devoluciones.some((x: any) => x.id === dv.id)).toBe(true);
      expect(caja.neto).toBe(Math.round((caja.total - caja.devuelto) * 100) / 100);
      await http.post(`/api/gestion/pagos/${p.id}/anular`).set(A()).send({ motivo: 'Ya tiene devolución' }).expect(409);
    });

    it('por la pasarela (simulada) como descuento sin comprobante: baja el total una sola vez', async () => {
      const r = await http.post('/api/reservas').send(huesped(500, { tipoHabitacion: 'duna', fechaEntrada: d(130), fechaSalida: d(132) })).expect(201);
      const o = (await http.post('/api/pagos-en-linea').send({ codigo: r.body.codigo, email: 'h500@prueba.pe' }).expect(201)).body;
      await http.post(`/api/pagos-en-linea/${o.id}/simulada`).send({ aprobar: true }).expect(200);
      const p = await pagoDe(r.body.codigo);
      const dv = (await http.post(`/api/gestion/pagos/${p.id}/devolver`).set(A()).send({ monto: 450, motivo: 'Una noche no usada', reducirTotal: true }).expect(200)).body;
      expect(dv).toMatchObject({ medio: 'Pasarela', pasarela: 'Simulada', estado: 'Completada', referenciaExterna: `SIM-DEV-${dv.id}`, notaCredito: null });
      expect((await ficha(r.body.codigo)).reserva).toMatchObject({ total: 450, pagado: 450, saldo: 0 });
    });

    it('descuento con boleta emitida: la nota de crédito se emite sola y la reserva baja una sola vez', async () => {
      const r = await reservaPagada({ tipoHabitacion: 'duna', fechaEntrada: d(134), fechaSalida: d(136) });
      await boleta(r.codigo);
      const p = await pagoDe(r.codigo);
      const dv = (await http.post(`/api/gestion/pagos/${p.id}/devolver`).set(A()).send({ monto: 100, motivo: 'Compensación por reclamo', reducirTotal: true }).expect(200)).body;
      expect(dv.notaCredito).toMatchObject({ tipo: '07', motivoNota: '09', total: 100, estado: 'Aceptado' });
      const f = await ficha(r.codigo);
      expect(f.reserva).toMatchObject({ total: 800, pagado: 800, saldo: 0 });
      expect(f.comprobantes.filter((k: any) => k.tipo === '07')).toHaveLength(1);
    });
  });

  describe('Culqi con 3-D Secure (API de Culqi simulada)', () => {
    const fetchReal = global.fetch;
    let cola: { status: number; json: unknown }[] = [];
    const enviados: any[] = [];
    beforeAll(() => {
      Object.assign(process.env, { PASARELA: 'culqi', CULQI_LLAVE_PUBLICA: 'pk_test_e2e', CULQI_LLAVE_SECRETA: 'sk_test_e2e' });
      global.fetch = jest.fn(async (url: any, init: any) => { enviados.push({ url: String(url), cuerpo: JSON.parse(init.body) }); const r = cola.shift()!; return new Response(JSON.stringify(r.json), { status: r.status }); }) as any;
    });
    afterAll(() => { global.fetch = fetchReal; process.env.PASARELA = 'simulada'; });

    it('pide autenticar, cobra con los parámetros 3DS y luego devuelve por la API de Culqi', async () => {
      const r = await http.post('/api/reservas').send(huesped(600, { tipoHabitacion: 'duna', fechaEntrada: d(138), fechaSalida: d(139) })).expect(201);
      const o = (await http.post('/api/pagos-en-linea').send({ codigo: r.body.codigo, email: 'h600@prueba.pe' }).expect(201)).body;
      expect((await http.get(`/api/pagos-en-linea/${o.id}`)).body.datosCheckout).toMatchObject({ llavePublica: 'pk_test_e2e', script3DS: 'https://3ds.culqi.com', montoCentimos: 45000 });

      cola = [{ status: 200, json: { action_code: 'REVIEW' } }];
      const a = (await http.post(`/api/pagos-en-linea/${o.id}/culqi`).send({ token: 'tkn_test_e2e123', dispositivo: 'disp-e2e' }).expect(200)).body;
      expect(a).toMatchObject({ requiere3DS: true, estado: 'Pendiente' });

      cola = [{ status: 201, json: { object: 'charge', id: 'chr_test_e2e', amount: 45000 } }];
      const p3ds = { eci: '05', xid: 'eHg=', cavv: 'Y2F2dg==', protocolVersion: '2.1.0' };
      const b = (await http.post(`/api/pagos-en-linea/${o.id}/culqi`).send({ token: 'tkn_test_e2e123', dispositivo: 'disp-e2e', autenticacion3DS: p3ds }).expect(200)).body;
      expect(b.estado).toBe('Aprobado');
      expect(enviados[1].cuerpo).toMatchObject({ source_id: 'tkn_test_e2e123', authentication_3DS: p3ds, antifraud_details: { device_finger_print_id: 'disp-e2e' } });

      const p = await pagoDe(r.body.codigo);
      expect(p).toMatchObject({ pasarela: 'Culqi', referencia: 'chr_test_e2e', montoSoles: 450 });
      cola = [{ status: 201, json: { object: 'refund', id: 'ref_test_e2e', amount: 45000, charge_id: 'chr_test_e2e' } }];
      const dv = (await http.post(`/api/gestion/pagos/${p.id}/devolver`).set(A()).send({ monto: 450, motivo: 'Cancelación con devolución' }).expect(200)).body;
      expect(dv).toMatchObject({ medio: 'Pasarela', estado: 'Completada', referenciaExterna: 'ref_test_e2e' });
      expect(enviados.at(-1)).toEqual({ url: 'https://api.culqi.com/v2/refunds', cuerpo: { amount: 45000, charge_id: 'chr_test_e2e', reason: 'solicitud_comprador' } });

      // Sin respuesta de Culqi: la devolución queda pendiente y se puede reintentar
      const r2 = await http.post('/api/reservas').send(huesped(601, { tipoHabitacion: 'duna', fechaEntrada: d(140), fechaSalida: d(141) })).expect(201);
      const o2 = (await http.post('/api/pagos-en-linea').send({ codigo: r2.body.codigo, email: 'h601@prueba.pe' }).expect(201)).body;
      cola = [{ status: 201, json: { object: 'charge', id: 'chr_test_e2e2', amount: 45000 } }];
      await http.post(`/api/pagos-en-linea/${o2.id}/culqi`).send({ token: 'tkn_test_e2e456' }).expect(200);
      const p2 = await pagoDe(r2.body.codigo);
      cola = [{ status: 503, json: {} }];
      const pend = (await http.post(`/api/gestion/pagos/${p2.id}/devolver`).set(A()).send({ monto: 100, motivo: 'Prueba sin red' }).expect(200)).body;
      expect(pend.estado).toBe('Pendiente');
      cola = [{ status: 201, json: { object: 'refund', id: 'ref_test_e2e2', amount: 10000 } }];
      expect((await http.post(`/api/gestion/pagos/devoluciones/${pend.id}/reintentar`).set(A()).expect(200)).body.estado).toBe('Completada');
    });
  });

  describe('Correos programados, encuestas y panel de correos', () => {
    it('recordatorio dos días antes (una sola vez) y no para reservas recién hechas', async () => {
      const [h] = await db().query<any>(`SELECT id FROM habitaciones WHERE numero = '110'`);
      const [vieja] = await db().query<any>(`INSERT INTO reservas (codigo, cliente_id, habitacion_id, fecha_entrada, fecha_salida, huespedes, subtotal, igv, total, estado, canal, fecha_reserva)
        VALUES ('MA9900010', 1, $1, $2, $3, 2, 381.36, 68.64, 450, 'Confirmada', 'Web', now() - interval '5 days') RETURNING id`, [h.id, d(2), d(3)]);
      const nueva = await reservaPanel({ tipoHabitacion: 'horizonte', fechaEntrada: d(2), fechaSalida: d(3) });
      const prog = app.get(CorreosProgramados);
      expect((await prog.ejecutar()).recordatorios).toBe(1);
      expect((await prog.ejecutar()).recordatorios).toBe(0);
      const [c] = await db().query<any>(`SELECT count(*) AS n FROM correos WHERE reserva_id = $1 AND tipo = 'recordatorio'`, [vieja.id]);
      expect(c.n).toBe(1);
      expect((await ficha(nueva.codigo)).correos.map((x: any) => x.tipo)).not.toContain('recordatorio');
    });

    it('encuesta tras el check-out: se responde una vez y el administrador ve el NPS', async () => {
      const [h] = await db().query<any>(`SELECT id FROM habitaciones WHERE numero = '110'`);
      const [est] = await db().query<any>(`INSERT INTO reservas (codigo, cliente_id, habitacion_id, fecha_entrada, fecha_salida, huespedes, subtotal, igv, total, estado, canal, fecha_check_in, fecha_check_out)
        VALUES ('MA9900011', 1, $1, $2, $3, 2, 762.71, 137.29, 900, 'CheckOut', 'Web', now() - interval '2 days', now() - interval '5 hours') RETURNING id`, [h.id, d(-2), hoy]);
      expect((await app.get(CorreosProgramados).ejecutar()).encuestas).toBe(1);
      const [{ token }] = await db().query<any>('SELECT token FROM encuestas WHERE reserva_id = $1', [est.id]);
      await http.get('/api/encuestas/no-es-token').expect(404);
      expect((await http.get(`/api/encuestas/${token}`).expect(200)).body).toMatchObject({ nombre: 'Huésped1', respondida: false });
      expect((await http.post(`/api/encuestas/${token}`).send({ calificacion: 6, recomendacion: 10 }).expect(400)).body.campo).toBe('calificacion');
      await http.post(`/api/encuestas/${token}`).send({ calificacion: 5, recomendacion: 10, comentario: 'La vista al mar, increíble.' }).expect(200);
      await http.post(`/api/encuestas/${token}`).send({ calificacion: 1, recomendacion: 0 }).expect(409);
      expect((await http.get(`/api/encuestas/${token}`)).body.respondida).toBe(true);
      await http.get('/api/gestion/encuestas').set(R()).expect(403);
      const res = (await http.get('/api/gestion/encuestas').set(A()).expect(200)).body;
      expect(res).toMatchObject({ enviadas: 1, respondidas: 1, calificacion: 5, nps: 100, comentarios: [expect.objectContaining({ codigo: 'MA9900011', comentario: 'La vista al mar, increíble.' })] });
    });

    it('panel de correos: fallidos en el resumen (campana), vista previa y reintento de todos', async () => {
      const [k] = await db().query<any>(`UPDATE correos SET estado = 'Fallido', error = '550 buzón inexistente', intentos = 5
        WHERE id = (SELECT min(id) FROM correos WHERE tipo = 'confirmacion') RETURNING id`);
      expect((await http.get('/api/gestion/correos/resumen').set(R()).expect(200)).body).toMatchObject({ fallidos: 1, smtp: null });
      const lista = (await http.get('/api/gestion/correos?estado=Fallido').set(R()).expect(200)).body;
      expect(lista).toEqual([expect.objectContaining({ id: k.id, error: '550 buzón inexistente' })]);
      expect((await http.get(`/api/gestion/correos/${k.id}`).set(R()).expect(200)).body.html).toMatch(/^<!doctype html>/);
      const tipos = (await http.get('/api/gestion/correos?tipo=encuesta').set(R())).body;
      expect(tipos.length).toBeGreaterThan(0);
      expect(tipos.every((c: any) => c.tipo === 'encuesta')).toBe(true);
      expect((await http.post('/api/gestion/correos/reintentar-fallidos').set(R()).expect(200)).body.cantidad).toBe(1);
      expect((await http.get('/api/gestion/correos/resumen').set(R())).body.fallidos).toBe(0);
    });
  });
});
