import { z } from 'zod';
import { CANALES, ESTADOS_HABITACION, MAX_NOCHES, METODOS_PAGO, ROLES, TARIFAS_CAMBIO, TIPOS_DOCUMENTO } from './constantes';
import { validarDocumento, validarTelefono } from './documentos';
import { diasEntre, hoyLima, sumarDias } from './fechas';

/* ==========================================================
   Esquemas Zod compartidos.
   · En la web: React Hook Form + zodResolver.
   · En la API: ZodValidationPipe de NestJS.
   Los mensajes están en español y los «path» coinciden con el
   nombre del campo, para marcar el error en el formulario.
   ========================================================== */

const texto = (msg: string, max = 120) => z.string({ error: msg }).trim().min(1, msg).max(max, `Máximo ${max} caracteres.`);
const opcional = (max: number) => z.string().trim().max(max, `Máximo ${max} caracteres.`).optional().nullable().transform(v => (v ? v : null));
const fechaIso = (msg: string) => z.string({ error: msg }).regex(/^\d{4}-\d{2}-\d{2}$/, msg);
const email = z.email({ error: 'Escribe un correo válido.' }).trim().toLowerCase().max(150);

/* ---------------- Cliente ---------------- */
export const clienteBase = z.object({
  nombres: texto('Escribe los nombres.', 80),
  apellidos: texto('Escribe los apellidos.', 80),
  tipoDocumento: z.enum(TIPOS_DOCUMENTO, { error: 'Elige el tipo de documento.' }),
  numeroDocumento: z.string().trim().toUpperCase(),
  email,
  codigoPais: z.string().regex(/^\d{1,3}$/, 'Código de país no válido.'),
  telefono: z.string().transform(v => v.replace(/\D/g, '')),
  residencia: z.enum(['PE', 'EXT'])
});

/** Reglas cruzadas del cliente (documento, teléfono, IGV). */
function reglasCliente(d: { tipoDocumento: string; numeroDocumento: string; codigoPais: string; telefono: string; residencia: string }, ctx: z.RefinementCtx, prefijo: (string | number)[] = []) {
  const doc = validarDocumento(d.tipoDocumento, d.numeroDocumento);
  if (doc) ctx.addIssue({ code: 'custom', message: doc, path: [...prefijo, 'numeroDocumento'] });
  const tel = validarTelefono(d.codigoPais, d.telefono);
  if (tel) ctx.addIssue({ code: 'custom', message: tel, path: [...prefijo, 'telefono'] });
  if (d.residencia === 'EXT' && d.tipoDocumento !== 'PAS')
    ctx.addIssue({ code: 'custom', message: 'Para la exoneración de IGV se requiere pasaporte.', path: [...prefijo, 'tipoDocumento'] });
}

export const clienteSchema = clienteBase.extend({
  aceptaPublicidad: z.boolean().default(false),
  notas: opcional(500)
}).superRefine((d, ctx) => reglasCliente(d, ctx));
export type ClienteInput = z.input<typeof clienteSchema>;

/* ---------------- Fechas de estadía ---------------- */
function reglasFechas(d: { fechaEntrada: string; fechaSalida: string }, ctx: z.RefinementCtx, hoy = hoyLima()) {
  if (d.fechaEntrada < hoy) ctx.addIssue({ code: 'custom', message: 'La fecha de llegada no puede ser anterior a hoy.', path: ['fechaEntrada'] });
  if (d.fechaSalida <= d.fechaEntrada) ctx.addIssue({ code: 'custom', message: 'La salida debe ser al menos un día después de la llegada.', path: ['fechaSalida'] });
  else if (diasEntre(d.fechaEntrada, d.fechaSalida) > MAX_NOCHES) ctx.addIssue({ code: 'custom', message: `Para estadías de más de ${MAX_NOCHES} noches escríbenos por WhatsApp.`, path: ['fechaSalida'] });
  if (d.fechaEntrada > sumarDias(hoy, 548)) ctx.addIssue({ code: 'custom', message: 'Aceptamos reservas con hasta 18 meses de anticipación.', path: ['fechaEntrada'] });
}
export const rangoFechasSchema = z.object({
  fechaEntrada: fechaIso('Elige la fecha de llegada.'),
  fechaSalida: fechaIso('Elige la fecha de salida.')
}).superRefine((d, ctx) => reglasFechas(d, ctx));

/* ---------------- Reserva web (huésped) ---------------- */
export const reservaWebSchema = clienteBase.extend({
  tipoHabitacion: texto('Elige un tipo de habitación.', 20),
  fechaEntrada: fechaIso('Elige la fecha de llegada.'),
  fechaSalida: fechaIso('Elige la fecha de salida.'),
  huespedes: z.coerce.number().int().min(1, 'Mínimo 1 huésped.').max(8),
  horaLlegada: opcional(30),
  notas: opcional(500),
  aceptaPrivacidad: z.boolean().refine(v => v, 'Debes aceptar la Política de privacidad para continuar.'),
  aceptaPublicidad: z.boolean().default(false)
}).superRefine((d, ctx) => { reglasFechas(d, ctx); reglasCliente(d, ctx); });
export type ReservaWebInput = z.input<typeof reservaWebSchema>;
export type ReservaWeb = z.output<typeof reservaWebSchema>;

/* ---------------- Reserva desde el panel ---------------- */
export const reservaPanelSchema = z.object({
  clienteId: z.coerce.number().int().positive().optional().nullable(),
  cliente: clienteBase.optional().nullable(),
  tipoHabitacion: texto('Elige el tipo de habitación.', 20),
  habitacionId: z.coerce.number().int().positive().optional().nullable(),
  fechaEntrada: fechaIso('Elige la fecha de llegada.'),
  fechaSalida: fechaIso('Elige la fecha de salida.'),
  huespedes: z.coerce.number().int().min(1).max(8),
  residencia: z.enum(['PE', 'EXT']),
  canal: z.enum(CANALES),
  horaLlegada: opcional(30),
  notas: opcional(500),
  checkInInmediato: z.boolean().default(false)
}).superRefine((d, ctx) => {
  reglasFechas(d, ctx);
  if (!d.clienteId && !d.cliente) ctx.addIssue({ code: 'custom', message: 'Elige un cliente existente o registra uno nuevo.', path: ['clienteId'] });
  if (d.cliente) reglasCliente({ ...d.cliente, residencia: d.residencia }, ctx, ['cliente']);
  if (d.checkInInmediato && d.fechaEntrada !== hoyLima()) ctx.addIssue({ code: 'custom', message: 'El check-in inmediato solo es posible si la llegada es hoy.', path: ['fechaEntrada'] });
});
export type ReservaPanelInput = z.input<typeof reservaPanelSchema>;

/* ---------------- Pagos ---------------- */
export const pagoSchema = z.object({
  monto: z.coerce.number({ error: 'Escribe el monto.' }).positive('El monto debe ser mayor a cero.').max(1_000_000),
  moneda: z.enum(['PEN', 'USD']),
  metodo: z.enum(METODOS_PAGO, { error: 'Elige el método de pago.' }),
  tipoCambio: z.coerce.number().min(1).max(10).optional().nullable(),
  referencia: opcional(60)
}).superRefine((d, ctx) => {
  if (d.moneda === 'USD' && !d.tipoCambio) ctx.addIssue({ code: 'custom', message: 'Indica el tipo de cambio para pagos en dólares.', path: ['tipoCambio'] });
});
export type PagoInput = z.input<typeof pagoSchema>;
const motivo = z.string({ error: 'Indica el motivo.' }).trim().min(5, 'El motivo debe tener al menos 5 caracteres.').max(200, 'Máximo 200 caracteres.');
export const anularPagoSchema = z.object({ motivo });

/** Pago en línea desde la web: se identifica la reserva igual que en «Mi reserva». */
export const pagoEnLineaSchema = z.object({
  codigo: z.string().trim().toUpperCase().regex(/^MA\d{7,}$/, 'El código de reserva no es válido.'),
  email
});

/* ---------------- Cambio de habitación ---------------- */
export const cambioHabitacionSchema = z.object({
  habitacionId: z.coerce.number({ error: 'Elige la nueva habitación.' }).int().positive('Elige la nueva habitación.'),
  tarifa: z.enum(TARIFAS_CAMBIO, { error: 'Indica qué hacer con la tarifa.' }),
  motivo
});
export type CambioHabitacionInput = z.input<typeof cambioHabitacionSchema>;

/* ---------------- Comprobantes electrónicos (SUNAT) ---------------- */
export const comprobanteSchema = z.object({
  tipo: z.enum(['Boleta', 'Factura'], { error: 'Elige boleta o factura.' }),
  /** Factura de exportación de servicios de hospedaje a extranjeros no domiciliados (se identifica con pasaporte). */
  exportacion: z.boolean().default(false),
  ruc: z.string().trim().optional().nullable().transform(v => (v ? v : null)),
  razonSocial: opcional(200),
  direccion: opcional(200)
}).superRefine((d, ctx) => {
  if (d.tipo !== 'Factura' || d.exportacion) return;
  const ruc = validarDocumento('RUC', d.ruc ?? '');
  if (ruc) ctx.addIssue({ code: 'custom', message: ruc, path: ['ruc'] });
  if (!d.razonSocial) ctx.addIssue({ code: 'custom', message: 'Escribe la razón social.', path: ['razonSocial'] });
  if (!d.direccion) ctx.addIssue({ code: 'custom', message: 'Escribe la dirección fiscal.', path: ['direccion'] });
});
export type ComprobanteInput = z.input<typeof comprobanteSchema>;
export const anularComprobanteSchema = z.object({ motivo });

/** Nota de crédito: los motivos 01, 02 y 06 anulan todo; el 09 (disminución en el valor) es por un monto. */
export const notaCreditoSchema = z.object({
  motivo: z.enum(['01', '02', '06', '09'], { error: 'Elige el motivo de la nota de crédito.' }),
  monto: z.preprocess(v => (v === '' || v === null || v === undefined ? null : v), z.coerce.number().positive('El monto debe ser mayor a cero.').max(1_000_000).nullable()),
  sustento: z.string({ error: 'Explica el sustento.' }).trim().min(5, 'El sustento debe tener al menos 5 caracteres.').max(250, 'Máximo 250 caracteres.')
}).superRefine((d, ctx) => {
  if (d.motivo === '09' && !d.monto) ctx.addIssue({ code: 'custom', message: 'Indica el monto a disminuir.', path: ['monto'] });
});
export type NotaCreditoInput = z.input<typeof notaCreditoSchema>;

/** Devolución de un pago. «reducirTotal» = descuento o noches no usadas (baja el total de la reserva). */
export const devolucionSchema = z.object({
  monto: z.coerce.number({ error: 'Escribe el monto.' }).positive('El monto debe ser mayor a cero.').max(1_000_000),
  motivo,
  reducirTotal: z.boolean().default(false)
});
export type DevolucionInput = z.input<typeof devolucionSchema>;

/** Encuesta tras la estadía: calificación de 1 a 5 y recomendación de 0 a 10 (NPS). */
export const encuestaSchema = z.object({
  calificacion: z.coerce.number({ error: 'Elige una calificación.' }).int().min(1, 'Elige una calificación.').max(5),
  recomendacion: z.coerce.number({ error: 'Elige un número del 0 al 10.' }).int().min(0, 'Elige un número del 0 al 10.').max(10),
  comentario: opcional(1000)
});
export type EncuestaInput = z.input<typeof encuestaSchema>;

/* ---------------- Autenticación y usuarios ---------------- */
const claveFuerte = z.string().min(8, 'La contraseña debe tener al menos 8 caracteres.')
  .refine(v => /\d/.test(v) && /[A-Za-z]/.test(v), 'La contraseña debe incluir letras y números.');
export const loginSchema = z.object({ email, clave: z.string().min(1, 'Escribe tu contraseña.') });
export type LoginInput = z.infer<typeof loginSchema>;
export const cambiarClaveSchema = z.object({
  claveActual: z.string().min(1, 'Escribe tu contraseña actual.'),
  claveNueva: claveFuerte,
  repetir: z.string().optional()
}).superRefine((d, ctx) => {
  if (d.repetir !== undefined && d.repetir !== d.claveNueva) ctx.addIssue({ code: 'custom', message: 'Las contraseñas no coinciden.', path: ['repetir'] });
  if (d.claveNueva === d.claveActual) ctx.addIssue({ code: 'custom', message: 'La nueva contraseña debe ser distinta de la actual.', path: ['claveNueva'] });
});
export type CambiarClaveInput = z.input<typeof cambiarClaveSchema>;
export const usuarioSchema = z.object({
  nombre: texto('Escribe el nombre.', 100),
  email,
  rol: z.enum(ROLES),
  activo: z.boolean().default(true),
  clave: z.union([claveFuerte, z.literal('')]).optional().nullable()
});
export type UsuarioInput = z.input<typeof usuarioSchema>;

/* ---------------- Habitaciones y tipos ---------------- */
export const habitacionSchema = z.object({
  numero: z.string().trim().toUpperCase().regex(/^[0-9A-Z-]{1,10}$/, 'Número no válido.'),
  piso: z.coerce.number().int().min(0).max(50),
  tipoHabitacion: texto('Elige el tipo.', 20),
  estado: z.enum(ESTADOS_HABITACION),
  notas: opcional(300)
});
export type HabitacionInput = z.input<typeof habitacionSchema>;
export const limpiezaSchema = z.object({ estadoLimpieza: z.enum(['Limpia', 'Sucia']) });
export const tipoSchema = z.object({
  codigo: z.string().trim().regex(/^[a-z0-9-]{2,20}$/, 'El código usa minúsculas, números y guiones.'),
  nombre: texto('Escribe el nombre.', 60),
  descripcion: opcional(300),
  capacidad: z.coerce.number().int().min(1, 'Entre 1 y 8.').max(8, 'Entre 1 y 8.'),
  metrosCuadrados: z.coerce.number().int().min(5).max(500),
  precioNoche: z.coerce.number().positive('La tarifa debe ser mayor a cero.').max(100000),
  activo: z.boolean().default(true)
});
export type TipoInput = z.input<typeof tipoSchema>;

/* ---------------- Libro de Reclamaciones, boletín ---------------- */
export const reclamacionSchema = z.object({
  tipo: z.enum(['Reclamo', 'Queja']),
  nombreCompleto: texto('Escribe tus nombres y apellidos.', 160),
  tipoDocumento: z.enum(['DNI', 'CE', 'PAS', 'RUC']),
  numeroDocumento: z.string().trim().toUpperCase(),
  domicilio: texto('Escribe tu domicilio.', 200),
  telefono: texto('Escribe tu teléfono.', 20),
  email,
  esMenor: z.boolean().default(false),
  apoderado: opcional(160),
  bienTipo: z.enum(['Producto', 'Servicio']),
  montoReclamado: z.preprocess(v => (v === '' || v === null || v === undefined ? null : v), z.coerce.number().min(0).max(1_000_000).nullable()),
  codigoReserva: opcional(20),
  descripcionBien: texto('Describe el producto o servicio contratado.', 300),
  detalle: texto('Escribe el detalle de tu reclamación.', 2000),
  pedido: texto('Indica tu pedido.', 1000),
  declaraVeracidad: z.boolean().refine(v => v, 'Confirma que la información es verdadera.'),
  aceptaPrivacidad: z.boolean().refine(v => v, 'Acepta la Política de privacidad para continuar.')
}).superRefine((d, ctx) => {
  const doc = validarDocumento(d.tipoDocumento, d.numeroDocumento);
  if (doc) ctx.addIssue({ code: 'custom', message: doc, path: ['numeroDocumento'] });
  if (d.esMenor && !d.apoderado) ctx.addIssue({ code: 'custom', message: 'Indica el nombre del padre, madre o apoderado.', path: ['apoderado'] });
});
export type ReclamacionInput = z.input<typeof reclamacionSchema>;
export const respuestaReclamoSchema = z.object({ respuesta: z.string().trim().min(10, 'La respuesta debe tener al menos 10 caracteres.').max(2000) });
export const suscripcionSchema = z.object({ email });
export const cancelarSchema = z.object({ email });

/** Convierte un error de Zod en { mensaje, campo } (primer problema). */
export function primerError(err: z.ZodError): { mensaje: string; campo: string | null } {
  const i = err.issues[0];
  return { mensaje: i?.message ?? 'Revisa los datos enviados.', campo: i?.path?.length ? i.path.join('.') : null };
}
