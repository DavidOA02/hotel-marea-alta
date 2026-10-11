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

export const ETIQUETAS: Record<string, string> = {
  Confirmada: 'Confirmada', CheckIn: 'En el hotel', CheckOut: 'Finalizada', Cancelada: 'Cancelada', NoShow: 'No show',
  Web: 'Web', WhatsApp: 'WhatsApp', Telefono: 'Teléfono', Recepcion: 'Recepción',
  Operativa: 'Operativa', Mantenimiento: 'Mantenimiento', FueraDeServicio: 'Fuera de servicio',
  Limpia: 'Limpia', Sucia: 'Por limpiar', Aprobado: 'Aprobado', Anulado: 'Anulado', Pendiente: 'Pendiente', Respondido: 'Respondido',
  DNI: 'DNI', CE: 'Carné de extranjería', PAS: 'Pasaporte', PE: 'Residente', EXT: 'Extranjero'
};
