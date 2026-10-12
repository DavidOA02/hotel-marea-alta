# Power BI con PostgreSQL — Hotel Marea Alta

El panel cubre la operación diaria; Power BI sirve para el análisis histórico y los informes para gerencia.

## 1. Conectar
1. Power BI Desktop → **Obtener datos → Base de datos PostgreSQL**.
2. Servidor: `localhost:5432` · Base de datos: `hotel_marea_alta` · Modo: **Importar**.
3. Usuario y contraseña: los de `apps/api/.env` (`PGUSER` / `PGPASSWORD`).
4. Si pide el conector Npgsql, actívalo: en versiones recientes de Power BI ya viene incluido.

## 2. Tablas a importar
Importa solo las vistas preparadas, que ya tienen nombres claros y los cálculos hechos:

| Vista | Qué contiene |
|---|---|
| `vw_reservas_powerbi` | Una fila por reserva: fechas, noches, canal, residencia, montos, pagado y saldo |
| `vw_ocupacion_diaria` | Día × tipo de habitación: disponibles, ocupadas e ingreso del día (prorrateado) |
| `vw_pagos_powerbi` | Pagos con método, moneda, estado y turno de caja (`turno_id`; vacío en pagos en línea) |
| `vw_turnos_caja_powerbi` | Un turno de caja por fila: usuario, horas abierto, fondo, cobrado, efectivo esperado y contado, diferencia (− faltante, + sobrante) y si fue revisado |
| `vw_reclamaciones_powerbi` | Libro de Reclamaciones con días de respuesta y si están fuera de plazo |
| `calendario` | Tabla de fechas 2024–2028 con temporada (Alta verano, Fiestas Patrias, Regular) |

## 3. Relaciones
- `calendario[fecha]` 1 → * `vw_ocupacion_diaria[fecha]`
- `calendario[fecha]` 1 → * `vw_reservas_powerbi[fecha_entrada]`
- `calendario[fecha]` 1 → * `vw_pagos_powerbi[fecha_pago_dia]`
- `calendario[fecha]` 1 → * `vw_turnos_caja_powerbi[fecha_apertura_dia]`
- `vw_turnos_caja_powerbi[turno_id]` 1 → * `vw_pagos_powerbi[turno_id]`

Marca `calendario` como **tabla de fechas** (columna `fecha`).

## 4. Medidas
Copia las medidas de `medidas.dax`: Ocupación %, ADR, RevPAR, tasa de cancelación, estadía promedio y cobros por método.

## 5. Páginas sugeridas
1. **Resumen**: tarjetas con Ocupación, ADR, RevPAR e Ingresos, y un gráfico de líneas mensual con segmentador de temporada.
2. **Demanda**: ocupación por día de la semana, anticipación y canales.
3. **Clientes**: residentes frente a extranjeros, país de origen y clientes frecuentes.
4. **Caja**: cobros por método y mes, y saldos pendientes.
5. **Calidad**: reclamos por mes, días promedio de respuesta y casos fuera de plazo.
