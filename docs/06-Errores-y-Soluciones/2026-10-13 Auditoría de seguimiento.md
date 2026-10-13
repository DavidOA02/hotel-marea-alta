# Auditoría de seguimiento — 13/10/2026

Continúa la [[2026-10-12 Auditoría general]] sin repetirla. Se revisaron las áreas que no cubrió: permisos por rol en cada ruta, reservas duplicadas, CRUD de habitaciones, dependencias y la interfaz en tableta. Las pruebas usaron la base `hotel_marea_alta_test`; la base `hotel_marea_alta` no se tocó. Sin commit.

**Verificación final:** tipos de API y web sin errores · lint sin errores · 40 pruebas unitarias del paquete compartido · 37 de la API · 13 del verificador sandbox · 62 e2e · `npm run build` correcto.

| # | Hallazgo | Gravedad | Estado |
|---|---|---|---|
| 1 | La página Correos del panel tenía scroll horizontal en tableta | Baja | Corregido |
| 2 | Faltaba una prueba de permisos para la mayoría de las rutas de administrador | Media | Prueba añadida |
| 3 | Vulnerabilidades en dependencias de desarrollo | Baja | Pendiente |

---

## 1. Scroll horizontal en Correos (tableta)

**Síntoma.** A 768 px y 1024 px, `/panel/correos` se desplazaba 115–128 px a la derecha aunque la tabla estaba dentro de su contenedor con scroll. No pasaba en móvil (390 px), porque ahí se ocultan las cabeceras, ni en escritorio (1440 px), porque la tabla cabe. Por eso no apareció en la auditoría anterior.

**Causa.** La cabecera de la columna de acciones es un texto `sr-only`, que tiene posición absoluta. El contenedor `overflow-x-auto` de `Tabla` no estaba posicionado, así que ese texto tomaba como referencia el `body` y ensanchaba la página.

**Solución.** Se añadió `relative` al contenedor de scroll en `apps/web/src/components/panel/tabla.tsx`. Corrige las 14 páginas que usan `Tabla`.

**Comprobación.** En el navegador, 12 páginas del panel × 2 anchos (768 y 1024 px): sin scroll horizontal. La tabla de Correos se sigue desplazando dentro de su recuadro.

## 2. Prueba de permisos por rol

Antes, las e2e comprobaban el 403 en 9 de las 22 rutas solo de administrador. La prueba nueva «todas las rutas solo de administrador: sin token → 401; recepcionista → 403» (`apps/api/test/api.e2e-spec.ts`) recorre las 22. Usa IDs inexistentes y cuerpos vacíos: si faltara un guard, la ruta respondería 400 o 404 y la prueba fallaría sin cambiar datos.

## 3. Dependencias

- Producción: `npm audit --omit=dev` encuentra 0 vulnerabilidades.
- Desarrollo: 27 avisos. Los 2 críticos son de `shell-quote`, que usa `concurrently` solo con los scripts del `package.json`. Ningún dato externo llega ahí, así que el riesgo real es mínimo. `npm audit fix` (sin `--force`) los corrige, pero también agrega `cpu-features`, una dependencia nativa opcional de `ssh2`. No se aplicó para no mezclarlo con los cambios pendientes del `package-lock.json`.
- El resto (`eslint-config-next`, `jest`, `ts-jest`) solo tiene arreglo bajando de versión mayor. Se dejan así.

## Revisado sin errores

- **Permisos.** Hay dos roles (`Administrador`, `Recepcionista`). Todas las rutas de `gestion/*` usan `SesionGuard`. Las acciones sensibles exigen administrador: anular, devolver, notas, usuarios y tarifas.
- **Reservas duplicadas.** Las protege un bloqueo `pg_advisory_xact_lock` por tipo de habitación. La restricción `EXCLUDE` es la última barrera y el sistema reintenta ante `23P01`.
- **Check-in, check-out y pagos.** La reserva queda bloqueada durante cada cambio. El check-out con saldo solo lo puede forzar un administrador. Un pago no puede superar el saldo y siempre exige el turno de caja abierto.
- **Habitaciones.** No se puede eliminar una que tenga historial. Tampoco se puede cambiar de tipo con reservas vigentes.
- **Cierre por inactividad.** Durante la prueba la sesión se cerró, pero el reloj real había avanzado unas 4,5 h (el equipo estuvo suspendido). Es el comportamiento esperado.

## Notas

- El punto 8 de la auditoría anterior figura como «Corregido (sin commit)» en su tabla. Su sección de detalle aún dice «Abierto» y presenta las opciones A y B. El código pendiente implementa la opción A.
- Los puertos 3000 y 4000 de este equipo los usa otro proyecto (`hospedaje-dubai`). Para probar Marea Alta se usaron 3100 y 4100.
- El código de reserva es `'MA' || YY || lpad(id, 5, '0')`. Desde el id 100000, `lpad` recorta a 5 dígitos y repetiría códigos; el `UNIQUE` lo rechazaría. Falta mucho para llegar ahí, pero conviene ampliar el relleno antes.
- No se revisaron con navegador las páginas solo de administrador: la cuenta de administrador de la base de pruebas exige cambiar la contraseña.
