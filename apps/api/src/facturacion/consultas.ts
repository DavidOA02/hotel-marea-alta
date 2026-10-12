/* Consultas SQL de comprobantes compartidas por varios módulos (solo texto: sin dependencias, sin importaciones circulares). */

/**
 * Condición (alias «k») de la boleta o factura vigente de una reserva: no cuentan las notas de crédito,
 * los rechazados, los dados de baja ni los neutralizados por una nota de crédito total.
 * Coincide con el índice único ux_comprobante_vigente de 03_mejoras.sql.
 */
export const SQL_VIGENTE = `k.estado NOT IN ('Rechazado','Anulado') AND k.tipo <> '07' AND k.anulado_con_nota_id IS NULL`;

/** Comprobante con su reserva, el documento que modifica (notas de crédito) y lo que aún puede rebajarse con notas de crédito. */
export const SQL_COMPROBANTE = `
  SELECT k.*, r.codigo AS codigo_reserva, ref.tipo AS ref_tipo, ref.serie AS ref_serie, ref.numero AS ref_numero,
         nc.serie || '-' || nc.numero AS anulado_con_nota,
         CASE WHEN k.tipo <> '07' THEN k.total - coalesce((SELECT sum(n.total) FROM comprobantes n
           WHERE n.referencia_id = k.id AND n.estado NOT IN ('Rechazado','Anulado')), 0) END AS disponible_nota
  FROM comprobantes k JOIN reservas r ON r.id = k.reserva_id
  LEFT JOIN comprobantes ref ON ref.id = k.referencia_id LEFT JOIN comprobantes nc ON nc.id = k.anulado_con_nota_id`;
