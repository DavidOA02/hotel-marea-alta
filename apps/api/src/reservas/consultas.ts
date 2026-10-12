/** Rango que ocupa una reserva en su habitación actual (si cambió de habitación, desde el día del cambio). */
export const SQL_OCUPA = `daterange(coalesce(r.habitacion_desde, r.fecha_entrada), r.fecha_salida)`;

/** Orden de mantenimiento abierta que bloquea la habitación algún día del rango [desde, hasta). */
export const sqlBloqueo = (habitacion: string, desde: string, hasta: string) => `SELECT 1 FROM mantenimientos m
  WHERE m.habitacion_id = ${habitacion} AND m.bloquea AND m.estado IN ('Pendiente','EnProceso')
    AND daterange(m.bloqueo_desde, m.bloqueo_hasta) && daterange(${desde}::date, ${hasta}::date)`;
