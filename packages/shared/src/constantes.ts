/** Constantes de negocio del Hotel Marea Alta. */
export const TASA_IGV = 0.18;
export const MAX_NOCHES = 30;
export const HORAS_CANCELACION = 72;
export const DIAS_HABILES_RECLAMO = 15;

export const ESTADOS_RESERVA = ['Confirmada', 'CheckIn', 'CheckOut', 'Cancelada', 'NoShow'] as const;
export type EstadoReserva = (typeof ESTADOS_RESERVA)[number];
export const ROLES = ['Administrador', 'Recepcionista'] as const;
export type Rol = (typeof ROLES)[number];
export const CANALES = ['Web', 'WhatsApp', 'Telefono', 'Recepcion'] as const;
export type Canal = (typeof CANALES)[number];
export const METODOS_PAGO = ['Tarjeta', 'Yape', 'Plin', 'Transferencia', 'Efectivo'] as const;
export const ESTADOS_HABITACION = ['Operativa', 'Mantenimiento', 'FueraDeServicio'] as const;
export const TIPOS_DOCUMENTO = ['DNI', 'CE', 'PAS'] as const;

export const TARIFAS_CAMBIO = ['Mantener', 'Recalcular'] as const;
export const ESTADOS_COMPROBANTE = ['Pendiente', 'Aceptado', 'Observado', 'Rechazado', 'Anulado'] as const;
/** Catálogo 01 de SUNAT. */
export const TIPOS_COMPROBANTE: Record<string, string> = { '01': 'Factura', '03': 'Boleta', '07': 'Nota de crédito', '08': 'Nota de débito' };
export const MOTIVOS_NOTA_DEBITO: Record<string, string> = { '01': 'Intereses por mora', '02': 'Aumento de valor', '03': 'Penalidades' };
/** Catálogo 09 de SUNAT (motivos de nota de crédito que usa el hotel). */
export const MOTIVOS_NOTA_CREDITO: Record<string, string> = {
  '01': 'Anulación de la operación', '02': 'Anulación por error en el RUC', '06': 'Devolución total', '09': 'Disminución en el valor'
};
/** Motivos que anulan el comprobante completo; el resto es parcial. */
export const MOTIVOS_NC_TOTALES = ['01', '02', '06'];
export const DIAS_RECORDATORIO = 2;
export const ENTIDADES_BITACORA = ['reserva', 'pago', 'turno', 'cliente', 'habitacion', 'tipo', 'usuario', 'reclamo', 'comprobante', 'correo', 'sesion'] as const;
/** Caja por turnos: movimientos de efectivo fuera de los cobros y aviso de turnos que quedaron abiertos. */
export const MOVIMIENTOS_CAJA = ['Ingreso', 'Retiro'] as const;
export const HORAS_TURNO_LARGO = 12;

export const ETIQUETAS: Record<string, string> = {
  Confirmada: 'Confirmada', CheckIn: 'En el hotel', CheckOut: 'Finalizada', Cancelada: 'Cancelada', NoShow: 'No show',
  Web: 'Web', WhatsApp: 'WhatsApp', Telefono: 'Teléfono', Recepcion: 'Recepción',
  Operativa: 'Operativa', Mantenimiento: 'Mantenimiento', FueraDeServicio: 'Fuera de servicio',
  Limpia: 'Limpia', Sucia: 'Por limpiar', Aprobado: 'Aprobado', Anulado: 'Anulado', Pendiente: 'Pendiente', Respondido: 'Respondido',
  DNI: 'DNI', CE: 'Carné de extranjería', PAS: 'Pasaporte', PE: 'Residente', EXT: 'Extranjero',
  Aceptado: 'Aceptado', Observado: 'Aceptado con observaciones', Rechazado: 'Rechazado', Enviado: 'Enviado', Simulado: 'Simulado', Fallido: 'Fallido',
  Mantener: 'Mantener tarifa', Recalcular: 'Recalcular tarifa', MercadoPago: 'Mercado Pago', Simulada: 'Simulada',
  confirmacion: 'Confirmación de reserva', cancelacion: 'Cancelación', pago: 'Pago recibido', reclamo_constancia: 'Constancia de reclamo',
  reclamo_respuesta: 'Respuesta al reclamo', comprobante: 'Comprobante electrónico', recordatorio: 'Recordatorio de llegada',
  encuesta: 'Encuesta de satisfacción', devolucion: 'Devolución', Completada: 'Completada', Fallida: 'Fallida', Pasarela: 'Por la pasarela', Manual: 'Manual',
  Abierto: 'Abierto', Cerrado: 'Cerrado', Revisado: 'Revisado', Ingreso: 'Ingreso de efectivo', Retiro: 'Retiro de efectivo'
};
