# Auditoría general — 12/10/2026

Revisión de API, web y base de datos. Las correcciones están en el commit `652a7d0` (rama `develop`). Las pruebas se hicieron sobre bases temporales y la de pruebas e2e; la base `hotel_marea_alta` no se tocó.

**Verificación final:** tipos de API y web sin errores · 40 pruebas unitarias del paquete compartido · 33 de la API · 60 e2e · `next build` correcto.

| # | Error | Gravedad | Estado |
|---|---|---|---|
| 1 | Fechas imposibles en filtros y formularios devolvían error 500 | Media | Corregido |
| 2 | Check-in de un huésped en una habitación que otro no había dejado | Alta | Corregido |
| 3 | En producción se aceptaba la falta de `JWT_SECRETO_RENOVACION` | Alta | Corregido |
| 4 | La IP del cliente se podía falsificar con `X-Forwarded-For` | Media | Corregido (configurable) |
| 5 | El limitador de peticiones crecía en memoria sin límite | Baja | Corregido |
| 6 | `npm run lint` de la web no funcionaba | Baja | Corregido |
| 7 | Detalles de interfaz | Baja | Corregido |
| 8 | Una reserva web podía reemplazar los datos de un cliente existente | Alta | Corregido (sin commit) |

---

## 1. Fechas imposibles → error 500

**Síntoma.** Todas las listas del panel con filtro de fecha (reservas, pagos, turnos, reportes, comprobantes, mantenimiento, bitácora, correos y encuestas) y la disponibilidad pública respondían «Ocurrió un error en el servidor» con fechas como `abc`, `2026-02-30` o `2026-13-01`. Lo mismo con un ID fuera del rango de PostgreSQL (`/gestion/clientes/99999999999`).

**Causa.** Los filtros no se validaban, o solo se comprobaba la forma `AAAA-MM-DD`. JavaScript fallaba al calcular el periodo (`RangeError`) o PostgreSQL rechazaba la fecha, y el error llegaba como 500. Los esquemas Zod aceptaban `2026-02-30` porque solo usaban una expresión regular.

**Solución.**
- `esFechaIso` en `packages/shared/src/fechas.ts`: solo acepta fechas que existen en el calendario. La usan los esquemas de reservas, disponibilidad y bloqueos de mantenimiento, en la API y en los formularios.
- `fechaFiltro` en `apps/api/src/comun/filtros.ts`: valida `?desde=` y `?hasta=` antes de calcular el periodo por defecto. Se aplica en los 9 controladores con filtros de fecha.
- Red de seguridad en `apps/api/src/comun/errores.ts`: los errores de datos de PostgreSQL (`22P02`, `22003`, `22007`, `22008`) responden 400 y quedan como aviso en el registro.

**Comprobación.** Un sondeo con unas centenas de peticiones malformadas pasó de 90 respuestas 500 a 0. Pruebas: «fechas imposibles en filtros y formularios responden 400, no 500» (e2e) y «solo acepta fechas que existen en el calendario» (unitaria).

## 2. Check-in en una habitación todavía ocupada

**Síntoma.** Si el huésped A seguía en check-in el día de su salida, o después, se podía hacer check-in al huésped B en la misma habitación. Un walk-in con check-in inmediato también podía recibir esa habitación.

**Causa.** La disponibilidad compara rangos de noches: la estadía de A termina el día de salida y la de B empieza ese día, así que no se cruzan aunque A no haya hecho check-out.

**Solución.**
- `POST /gestion/reservas/:codigo/checkin` rechaza el check-in si otra reserva sigue en check-in en esa habitación. El mensaje indica el código de esa reserva y su salida prevista, y propone registrar su check-out o cambiar de habitación.
- La reserva con check-in inmediato descarta las habitaciones con un huésped aún registrado.
- Una reserva para hoy en esa habitación sigue siendo posible; solo el check-in espera al check-out.

**Archivos.** `apps/api/src/gestion/reservas-gestion.controller.ts`, `apps/api/src/reservas/reservas.service.ts`.

**Comprobación.** Prueba e2e «no aloja a otro huésped en una habitación cuyo ocupante aún no hizo check-out».

## 3. Secreto de renovación JWT en producción

**Síntoma.** Con `NODE_ENV=production`, la API arrancaba aunque faltara `JWT_SECRETO_RENOVACION`, y firmaba los tokens de renovación con la clave de desarrollo, que está en el código.

**Causa.** El control solo revisaba `JWT_SECRETO`, aunque el mensaje y el README piden los dos secretos.

**Solución.** La API no arranca en producción si falta alguno de los dos (`apps/api/src/auth/auth.service.ts`).

## 4. IP falsificable con `X-Forwarded-For`

**Síntoma.** Sin un proxy delante de la API, cualquiera podía elegir su IP enviando la cabecera `X-Forwarded-For`. Así esquivaba el límite de intentos por IP (inicio de sesión, reservas, reclamaciones) y dejaba una IP falsa en la bitácora. Comprobado: con `TRUST_PROXY=false` la bitácora registra la IP real.

**Causa.** `trust proxy` estaba fijo en `1`. Es correcto detrás de Render o nginx, pero no si la API recibe las conexiones directamente.

**Solución.** Variable `TRUST_PROXY` en `apps/api/src/main.ts`. Por defecto vale `1`, así que el comportamiento no cambia. Acepta un número de proxies, `false` o una lista de IP. Está documentada en `README.md` (sección «Publicar») y en `apps/api/.env.ejemplo`.

**Acción al publicar.** Si la API queda expuesta sin proxy, definir `TRUST_PROXY=false`.

## 5. Memoria del limitador de peticiones

**Causa.** `LimiteGuard` guardaba una entrada por IP y ruta y nunca borraba las vencidas: muchas IP distintas hacían crecer la memoria sin fin.

**Solución.** A partir de 10 000 entradas descarta las ventanas vencidas (`apps/api/src/comun/limite.guard.ts`).

## 6. `npm run lint` de la web

**Causa.** Next.js 16 eliminó `next lint`, que el script interpretaba como una carpeta llamada «lint»; además, ESLint no estaba instalado.

**Solución.** El script se reemplazó por `npm run tipos -w @marea/web` (`tsc --noEmit`), documentado en la tabla de comandos del README. ESLint se configura aparte.

## 7. Detalles de interfaz

- La fecha del encabezado del panel salía «Lunes, 12 De Octubre». Ahora solo la primera letra va en mayúscula: «Lunes, 12 de octubre».
- El pie de la web mostraba «S.A.C..». Ahora se añade el punto final solo si falta.
- Next.js avisaba en consola por `scroll-behavior: smooth`. Se añadió `data-scroll-behavior="smooth"` a `<html>`.

**Recorrido de la interfaz.** Todas las páginas del panel con los roles de administrador y recepción, en escritorio (1440 px) y móvil (390 px), más las 7 páginas públicas. No hay desbordes horizontales, campos sin etiqueta, botones o enlaces sin nombre, imágenes sin texto alternativo ni errores de JavaScript. También funciona el flujo del huésped: reserva, «Mi reserva» y pago simulado.

## 8. Una reserva web podía reemplazar los datos de un cliente

**Síntoma.** Comprobado con datos ficticios. Quien conocía el DNI de un cliente hacía una reserva en la web con ese DNI y su propio correo. Con eso:
- El nombre, el correo y el teléfono del cliente quedaban reemplazados.
- Con su correo, el tercero podía ver y cancelar las reservas del cliente en «Mi reserva».
- Los avisos futuros del cliente le llegaban al tercero.

Los códigos de reserva son correlativos (`MA` + año + número), lo que facilita probarlos.

**Causa.** `ReservasService.crearEnTx` hacía un `INSERT … ON CONFLICT (tipo_documento, numero_documento) DO UPDATE` que sobrescribía los datos de contacto, y «Mi reserva» valida contra el correo guardado en `clientes`.

**Decisión.** Opción «no tocar la ficha», aprobada el 12/10/2026. La alternativa descartada era guardar un correo de contacto en cada reserva, lo que exigía una migración.

**Solución.**
- **Documento registrado con otro correo** (solo en reservas desde la web pública, `webPublica`): la reserva se hace y se enlaza al cliente existente, pero su ficha (nombre, correo, teléfono, residencia, idioma) no se modifica. La comparación de correos no distingue mayúsculas.
- **La confirmación va al correo registrado.** «Mi reserva» y el pago en línea siguen pidiendo ese correo.
- **La respuesta incluye `correoRegistrado: true`** y `puedePagarEnLinea: false`. La web explica que la confirmación fue al correo registrado y ofrece WhatsApp para actualizarlo.
- **El contacto escrito en la web queda en el historial de la reserva** (nombre, correo y teléfono, bitácora `reserva.crear`, datos `contactoWeb`). Así recepción puede verificar la identidad y actualizar la ficha si corresponde.
- **Mismo correo o documento nuevo:** todo sigue como antes. El cliente habitual actualiza sus datos al volver a reservar.
- **Reservas del panel:** sin cambios (recepción sigue actualizando la ficha).

**Inconveniente aceptado.** Un cliente que cambió de correo no recibe la confirmación en el nuevo hasta que recepción lo actualice.

**Archivos.** `apps/api/src/reservas/reservas.service.ts`, `apps/api/src/publico/publico.controller.ts`, `apps/web/src/components/sitio/formulario-reserva.tsx`.

**Comprobación.** Prueba e2e «una reserva web con un documento ya registrado con otro correo no cambia la ficha del cliente»: ficha intacta, «Mi reserva» y pago en línea rechazan el correo ajeno, confirmación al correo registrado, contacto en el historial y el titular sí actualiza su teléfono. En el navegador (móvil), la segunda reserva con el mismo DNI muestra el aviso, el enlace a WhatsApp y no ofrece el pago en línea, sin errores de consola. E2E: 61/61.

## Otros pendientes

- Validar pagos, devoluciones y comprobantes en las cuentas de prueba de Culqi, Mercado Pago, Niubiz y Nubefact: ver [[pruebas-sandbox]].
