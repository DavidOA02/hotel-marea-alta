# Hotel Marea Alta · Paracas — v2 (Next.js + NestJS + PostgreSQL)

Sitio web del hotel con reservas en línea y sistema de gestión hotelera con login por roles.

| Capa | Tecnologías | Carpeta |
|---|---|---|
| Web pública + panel | **Next.js 16.3** (App Router), **React 19**, **Tailwind 4**, **Zustand**, **TanStack Table 9**, **React Hook Form + Zod**, **react-pdf**, carrusel **Embla**, Recharts | `apps/web` |
| API | **NestJS 11**, **pg** (PostgreSQL), **ssh2** (túnel opcional), JWT, **nodemailer** (correos) | `apps/api` |
| Reglas compartidas | Esquemas **Zod**, IGV, documentos peruanos y métricas hoteleras | `packages/shared` |
| Pruebas | **Jest** + supertest contra PostgreSQL real | `*/src/**/*.spec.ts`, `apps/api/test` |
| Base de datos | PostgreSQL 14+ | `database` |
| Análisis | Power BI | `powerbi` |

> Proyecto de práctica: RUC, teléfonos, dirección y testimonios son ficticios. Fotos: Unsplash.

---

## Puesta en marcha (Windows)

**Requisitos:** Node.js **20.9 o superior** (`winget install OpenJS.NodeJS.LTS`) y PostgreSQL **14 o superior** (`winget install PostgreSQL.PostgreSQL.17`; anota la contraseña de `postgres`).

En la carpeta `hotel-marea-alta`:

```bash
npm install          # instala todo, compila @marea/shared y crea los archivos .env
npm run db:demo      # crea la base con datos de demostración (pide la contraseña de postgres si hace falta)
npm run dev          # API en :4000 y web en :3000
```

- Web: http://localhost:3000
- Panel: http://localhost:3000/panel
- API: http://localhost:4000/api/salud

| Rol | Correo | Contraseña temporal |
|---|---|---|
| Administrador | `admin@mareaalta.pe` | `Admin2026!` |
| Recepcionista | `recepcion@mareaalta.pe` | `Recepcion2026!` |

El primer ingreso obliga a cambiar la contraseña. El recuadro «Usuarios de prueba» solo aparece en `localhost`.

### Comandos

| Comando | Qué hace |
|---|---|
| `npm run dev` | API (NestJS en modo *watch*) y web (Next.js) a la vez; antes ejecuta `verificar` |
| `npm run verificar` | Revisa Node, dependencias, PostgreSQL y puertos libres |
| `npm run db` / `npm run db:demo` | Crea la base de datos, vacía o con datos de demostración (**borra la anterior**) |
| `npm run db:migrar` | Aplica `database/03_mejoras.sql` a la base existente **sin borrar datos** (se puede repetir) |
| `npm test` | Pruebas Jest unitarias (paquete compartido y API) |
| `npm run test:e2e` | Pruebas de punta a punta de la API contra una base PostgreSQL de prueba |
| `npm run lint` / `npm run lint:fix` | Análisis estático de web, API, reglas compartidas y herramientas; el segundo aplica correcciones automáticas |
| `npm run sandbox:verificar -- --proveedor culqi` | Comprueba la configuración local de sandbox sin llamar al proveedor; también admite `mercadopago`, `niubiz` y `nubefact` |
| `npm run test:sandbox` | Prueba las barreras del verificador sin credenciales, red ni conexión a PostgreSQL |
| `npm run tipos -w @marea/web` | Revisa los tipos de TypeScript de la web sin compilarla |
| `npm run build` y luego `npm start` | Compilación de producción y arranque |

ESLint usa las reglas de Next.js/React en la web y de TypeScript en la API y el paquete compartido. Los errores hacen fallar el comando; las recomendaciones sobre efectos de React y bibliotecas incompatibles con su compilador permanecen como advertencias. Se permite `any` para las filas SQL y las respuestas externas que todavía no tienen un tipo definido.

---

## Cómo encaja cada tecnología

### Zod compartido: una sola fuente de verdad
`packages/shared/src/schemas.ts` define las reglas una vez. En el navegador, React Hook Form usa `zodResolver(reservaWebSchema)`; en la API, NestJS usa `new ZodPipe(reservaWebSchema)`. Las reglas incluyen:
- DNI de 8 dígitos y celular +51.
- Pasaporte obligatorio para la exoneración de IGV.
- La salida debe ser posterior a la llegada.
- Contraseñas seguras.

Los errores de la API vuelven como `{ mensaje, campo }`, y el formulario marca ese campo.

### Next.js 16 + React 19 + Tailwind 4
- **Web pública**:
  - Portada con carrusel a pantalla completa y barra de búsqueda.
  - Habitaciones con tarifas reales y precios en S/ o US$.
  - Galería y testimonios con carrusel.
  - Formulario de reserva con disponibilidad en vivo.
  - Mi reserva (con pago en línea), Libro de Reclamaciones (Ley 29571) y privacidad.
- **Panel** (`/panel`):
  - Dashboard, recepción, reservas, habitaciones (tablero por piso), clientes, limpieza, mantenimiento, caja por turnos con arqueo, comprobantes electrónicos, reportes, tarifas, reclamaciones, usuarios, bitácora de auditoría y mi cuenta.
- **Tailwind 4**: el tema va en `@theme` y las clases propias se declaran con `@utility`, que en v4 reemplaza el uso de `@apply` sobre `@layer components`.

### Zustand
- `stores/sesion.ts`: sesión del panel en `sessionStorage`, con renovación automática del token y cierre de sesión ante un 401.
- `stores/reserva.ts`: moneda y borrador compartido entre la barra de la portada y el formulario.
- `stores/avisos.ts`: notificaciones.
- Stores pequeños abren la ficha de reserva, el pago y la nueva reserva desde cualquier vista, además de los diálogos de confirmación.

### TanStack Table 9
`components/panel/tabla.tsx` registra explícitamente las *features* (`rowSortingFeature`, `globalFilteringFeature`, `rowPaginationFeature`) y sus *row models*, como pide la v9. La tabla:
- Ordena por cualquier columna (con `aria-sort`).
- Filtra con un buscador global.
- Pagina los resultados.
- Exporta a CSV lo filtrado.
- Permite abrir filas con Enter.
- En el celular muestra cada fila como tarjeta.

### react-pdf
`components/pdf/confirmacion.tsx` genera la **confirmación de reserva en PDF** en el navegador:
- El huésped la descarga al reservar y desde Mi reserva.
- Recepción la descarga desde la ficha de la reserva.

La librería se carga solo al pulsar el botón.

### NestJS 11 + pg
- Consultas SQL parametrizadas con `pg` (`apps/api/src/db/db.service.ts`), resultados en camelCase y transacciones.
- **Sin dobles reservas**, con tres capas:
  1. Un *advisory lock* por tipo de habitación hace que las reservas simultáneas del mismo tipo esperen su turno.
  2. Una restricción `EXCLUDE USING gist` en PostgreSQL impide habitaciones con reservas cruzadas aunque falle todo lo demás.
  3. La API reintenta automáticamente si hay un conflicto.
- Seguridad:
  - JWT de 1 h con renovación de 12 h.
  - Sello que invalida las sesiones al cambiar la contraseña, el rol o el estado.
  - Bloqueo tras 5 intentos fallidos.
  - Límite de peticiones por IP.
  - Contraseñas con PBKDF2-SHA256.

### ssh2: túnel SSH opcional
Si PostgreSQL está en un VPS al que solo se llega por SSH, define en `apps/api/.env`:
```
SSH_HOST=mi-vps.ejemplo.pe
SSH_USUARIO=deploy
SSH_LLAVE=C:\Users\tu-usuario\.ssh\id_ed25519
```
La API abre el túnel con `ssh2` y se conecta a `PGHOST:PGPORT` desde el servidor, sin exponer la base a Internet.

### Jest
- `packages/shared`: tarifas e IGV, recálculo por cambio de habitación, documentos, fechas hábiles, prorrateo de métricas y esquemas Zod.
- `apps/api` (unitarias): contraseñas, política de cancelación y **contratos de las integraciones** con `fetch` simulado (Culqi con 3-D Secure y devoluciones, Mercado Pago con la firma de su webhook y devoluciones, Niubiz y Nubefact con notas de crédito).
- `apps/api/test` (de punta a punta, contra PostgreSQL real; leen `apps/api/.env` y fuerzan los modos simulados, así nunca envían correos ni cobran):
  - Reservas, validaciones y libro de reclamaciones.
  - Roles, bloqueo de cuenta y renovación de sesión.
  - Walk-in → pago → check-out.
  - Anulación de pagos, CRUD de habitaciones y clientes.
  - **Concurrencia**: 6 personas reservan a la vez las 4 suites y se confirman exactamente 4, sin cruces.
  - Correos encolados (y su HTML escapado), cambio de habitación (incluido el huésped en curso sin falsos cruces), pagos en línea **idempotentes** (avisos repetidos o simultáneos registran un solo pago), boletas, facturas y exportación con **correlativo sin huecos** aunque se emitan a la vez, y bitácora inmodificable.
  - Notas de crédito parciales y totales, devoluciones manuales y por pasarela (también como descuento con nota de crédito automática), Culqi con 3-D Secure de punta a punta (con la API de Culqi simulada), recordatorio y encuesta sin duplicados, NPS y panel de correos.
  - Caja por turnos: sin turno no se cobra con ningún medio, efectivo esperado en soles y dólares, devoluciones en dólares al tipo de cambio del pago, retiros que no superan la caja, arqueo con diferencia y observación obligatoria, revisión única del administrador, arqueo inmodificable y **cierre simultáneo con cobros** (cada pago queda en el arqueo o se rechaza).
  - Limpieza y mantenimiento: limpieza de salida al hacer check-out con prioridad por llegada, una tarea abierta por habitación, desperfecto que abre una orden, bloqueo que saca la habitación de la venta, del panel y del cambio de habitación, ampliación revisada contra reservas y **bloqueo y reserva simultáneos por la última suite** (gana solo uno).

---

## Caja por turnos y arqueo

Cada recepcionista (o administrador) responde por el efectivo que maneja en su turno.

- **Abrir turno** («Caja y pagos» → «Abrir turno», o desde el mismo cobro): se cuenta el **fondo inicial** para dar vuelto. Cada usuario tiene como máximo un turno abierto.
- **Cobros**: todo cobro registrado en el panel (efectivo, tarjeta, Yape, Plin o transferencia) exige el turno abierto de quien cobra. Así el cierre del turno incluye todos los medios, para cuadrarlos con el POS y los movimientos de Yape y del banco. Los pagos en línea no tienen turno.
- **Devoluciones manuales**: salen del turno de quien las entrega; si son en efectivo, exigen su turno abierto y no pueden superar lo que debería haber en la caja. Lo cobrado en dólares se devuelve en dólares, al tipo de cambio del pago; si se devuelve todo lo que queda, se entregan exactamente los dólares que faltan.
- **Ingresos y retiros** (depósito en la caja fuerte, sencillo recibido): en soles o dólares; un retiro no puede superar el efectivo esperado. No se borran: un error se corrige con el movimiento inverso.
- **Efectivo esperado** = fondo inicial + cobros en efectivo − devoluciones en efectivo + ingresos − retiros. Los dólares se cuentan aparte, sin convertirlos.
- **Cerrar turno (arqueo)**: se cuenta la caja por billetes y monedas (o se escribe el total) y los dólares. Se guardan lo esperado, lo contado y la diferencia (faltante o sobrante); con diferencia, la observación es obligatoria. El reporte del turno se imprime con espacio para las firmas de quien entrega y quien recibe.
- **Revisión**: el administrador ve los turnos de todos en «Turnos y arqueos» y marca cada arqueo como revisado una sola vez, también el suyo (útil si hay un solo administrador). La campana avisa de arqueos con diferencia sin revisar y de turnos abiertos hace más de 12 horas.
- **Integridad**: un arqueo cerrado no se modifica; triggers de PostgreSQL rechazan cambios (salvo la revisión), borrados y pagos, devoluciones o movimientos en un turno cerrado. Si después del cierre se anula un pago del turno, el arqueo guardado no cambia y el reporte muestra lo que hoy sería lo esperado.
- **Bitácora y Power BI**: apertura, movimientos, cierre y revisión quedan en la bitácora; `vw_turnos_caja_powerbi` resume cada turno y `vw_pagos_powerbi` incluye el `turno_id`.

Si ya tienes la base con datos, ejecuta `npm run db:migrar`. Los pagos anteriores quedan sin turno. Los datos de demostración incluyen una semana de turnos cerrados de Recepción, con un faltante ya revisado y un sobrante pendiente.

---

## Limpieza y mantenimiento

### Limpieza (`/panel/limpieza`)
- **Plan del día**: cada habitación con lo que necesita (limpieza de salida, servicio diario o limpieza profunda), quién la tiene y desde cuándo. Primero van las habitaciones **por limpiar donde llega un huésped hoy**, luego el resto por limpiar y al final el servicio diario de las ocupadas.
- **Estados**: Por limpiar → En limpieza → Limpia. Cada tarea registra quién limpia (no necesita usuario del panel), cuándo empezó y cuándo terminó.
- **Automático**: el check-out y el cambio de habitación de un huésped en el hotel dejan programada la limpieza de salida. Resolver una orden de mantenimiento deja una limpieza profunda.
- **Desperfectos**: al terminar una limpieza se puede escribir el desperfecto encontrado y se abre una orden de mantenimiento para esa habitación.
- Una sola tarea abierta por habitación. El marcado rápido «Limpia» del tablero y de Recepción da por terminada la tarea abierta. La hoja del día se imprime para el personal de limpieza.
- El check-in avisa si la habitación todavía figura por limpiar o en limpieza.

### Mantenimiento (`/panel/mantenimiento`)
- **Órdenes** por habitación o área común (piscina, lobby…): categoría, prioridad (baja, media, alta, urgente), técnico o proveedor, estado (pendiente, en proceso, resuelta, cancelada), solución y costo.
- **Bloqueo por fechas**: una orden abierta puede bloquear la habitación del día «desde» al día en que vuelve a venderse. Mientras dure, la habitación no aparece en la disponibilidad de la web, no se asigna en reservas del panel y no se ofrece al cambiar de habitación.
  - No se bloquean noches con reservas: primero se cambian de habitación desde su ficha. Ampliar o mover el bloqueo vuelve a revisarlo.
  - El bloqueo usa el mismo *advisory lock* por tipo de habitación que las reservas, así una reserva y un bloqueo simultáneos nunca se pisan.
  - Al resolver o cancelar la orden, el bloqueo termina ese día y la habitación vuelve a venderse.
- El tablero de habitaciones marca las órdenes abiertas y muestra «Mantenimiento» si la habitación está bloqueada hoy. La campana avisa de órdenes urgentes y de habitaciones por limpiar donde llega un huésped hoy.
- **Bitácora y Power BI**: limpiezas y órdenes quedan en la bitácora; `vw_mantenimiento_powerbi` resume días de atención, noches bloqueadas y costo por orden.

Si ya tienes la base con datos, ejecuta `npm run db:migrar`. Los datos de demostración incluyen limpiezas del día, una habitación bloqueada por el aire acondicionado, una orden de la piscina y una reparación resuelta.

---

## Correos, pagos en línea, devoluciones, facturación, cambio de habitación, encuestas y bitácora

Todo funciona en desarrollo **sin credenciales**: los correos quedan como «Simulado», la pasarela de pago es simulada (botones «aprobar» o «rechazar») y el OSE simulado acepta los comprobantes sin validez tributaria. En producción, los modos simulados se desactivan solos. Las variables están documentadas en `apps/api/.env.ejemplo`, y al arrancar la API muestra qué está activo.

Si ya tienes la base con datos, ejecuta `npm run db:migrar` (no borra nada).

### Correos automáticos (`apps/api/src/correo`)
- Se envían:
  - **Al reservar** (web o panel): la confirmación.
  - **Al cancelar**: el aviso de cancelación.
  - **Con un pago en línea o una devolución**: el recibo.
  - **Al aceptarse un comprobante o una nota de crédito o débito**: el documento electrónico.
  - **Dos días antes de la llegada**: un recordatorio con la hora de check-in, cómo llegar, el saldo pendiente y los documentos que debe traer. No se envía si la reserva se hizo el día anterior.
  - **Entre 2 horas y 3 días después del check-out**: la encuesta de satisfacción.
  - **Por el Libro de Reclamaciones**: la constancia de la hoja y la **respuesta** que registra el administrador.
- **Bandeja de salida** (tabla `correos`): el correo se guarda en la misma transacción que la operación y un proceso lo envía por SMTP (`nodemailer`) con reintentos (1, 5, 15 y 60 min). Un servidor de correo caído nunca hace fallar una reserva.
- **Correos programados** (`programados.service.ts`, cada 30 min): un índice único en la base garantiza **un solo** recordatorio y una sola encuesta por reserva, aunque la API corra en varias instancias. Se desactivan con `CORREOS_PROGRAMADOS=false`.
- **Pantalla «Correos»**:
  - Muestra la bandeja completa con filtros, el error de cada fallo y una vista previa (en un `iframe` aislado, sin scripts).
  - Permite reintentar un correo o todos los fallidos, por ejemplo tras corregir el SMTP.
  - La **campana** del panel avisa cuando hay correos fallidos o con más de 30 minutos en cola.
- En la ficha de la reserva y en la hoja de reclamación se ve si cada correo se envió; desde la ficha se puede reenviar la confirmación.
- Las plantillas escapan todo dato que escribe el usuario (evita inyección de HTML).
- **Idioma**: confirmación, cancelación, pago, devolución, recordatorio, encuesta y comprobantes disponibles en español e inglés. En la reserva web, el alta del panel y la ficha del cliente se elige el idioma; «Automático» usa inglés para residencia extranjera y español para Perú. La residencia y la exoneración siguen siendo datos separados de la preferencia de idioma. El Libro de Reclamaciones tiene su propio selector para la constancia y la respuesta; el texto escrito por el administrador se conserva.

### Pagos en línea (`apps/api/src/pagos-en-linea`)
- **Flujo**: «Mi reserva» o la confirmación de la reserva → **Pagar en línea** → página `/pago`.
  - Cada intento es una *orden* con un id imposible de adivinar.
  - El **monto lo fija la API** (el saldo de la reserva).
  - El resultado **siempre se verifica con la pasarela**, nunca con lo que diga el navegador.
- **Pasarelas** (`PASARELA=…`):
  - **Culqi**: Checkout Custom tokeniza la tarjeta o Yape en el navegador y la API crea el cargo con la llave secreta.
    - **3-D Secure**: `Culqi3DS` genera la huella del dispositivo, que viaja en el cargo.
    - Si el antifraude responde `REVIEW`, no hubo cargo. El navegador autentica al titular con su banco y la API repite el cargo con el mismo token y los parámetros 3DS (`eci`, `cavv`, `xid`…).
  - **Mercado Pago**: Checkout Pro por redirección. El pago se confirma consultando `/v1/payments` al volver y con el webhook `POST /api/webhooks/mercadopago`, que valida la firma `x-signature`.
  - **Niubiz**: botón de pago web. Primero se obtienen el token de seguridad y la sesión; luego el formulario de Niubiz envía el `transactionToken` a la API, que autoriza (`ACTION_CODE 000`) y devuelve al huésped a la web.
- **Idempotente**: si la pasarela avisa dos veces (retorno y webhook), el pago se registra una sola vez. Un pago aprobado se registra aunque la orden haya vencido.
- La reserva se **bloquea** mientras se registra cualquier pago, así dos cobros simultáneos (web y recepción) no superan el saldo.
- Si aun así queda saldo a favor, se marca en la bitácora para devolverlo.

### Devoluciones (`apps/api/src/pagos/devoluciones.service.ts`)
- **Dónde**: ficha de la reserva → pago → **Devolver** (solo administrador).
- **Cómo se devuelve**:
  - **Culqi, Mercado Pago y Niubiz**: la devolución se pide por API, total o parcial. Mercado Pago usa una clave de idempotencia, así que reintentar no devuelve dos veces.
  - **Niubiz**: el registro genera una solicitud pendiente; la API consulta su código cada 5 minutos (también desde la ficha). Solo el estado exitoso `S` descuenta lo pagado y envía el correo. Si falla la autenticación antes del registro, se puede reintentar. Si se pierde la respuesta del registro, nunca se repite el POST: «Conciliar» permite ingresar el código confirmado en Niubiz y verificar que coincidan la transacción y el monto. Usa el RUC del emisor (`HOTEL_RUC`) y requiere una venta liquidada y acceso a las API de devoluciones.
  - **Efectivo, transferencia, Yape…**: el hotel devuelve el dinero y lo registra en el sistema.
- **Lo pagado** de una reserva es pagos aprobados menos devoluciones completadas, calculado en un solo lugar: la función SQL `pagado_neto`. La usan la ficha, la caja, el dashboard, los reportes y Power BI.
- **Descuento o noches no usadas** («bajar el total de la reserva»):
  - Rebaja el total de la reserva.
  - Si ya hay boleta o factura aceptada, emite **en la misma transacción** la nota de crédito por ese monto.
- **Caja**: muestra las devoluciones del periodo y el cobrado neto.
- **Sin respuesta de la pasarela**: la devolución queda «Pendiente» y se puede reintentar.
- Un pago con devoluciones ya no se puede anular.

### Facturación electrónica SUNAT (`apps/api/src/facturacion`)
- **Cuándo**: con la reserva pagada por completo, en la ficha → **Emitir**.
- **Qué se emite**:
  - **Boleta** con el DNI, CE o pasaporte del huésped.
  - **Factura** con RUC, razón social y dirección.
  - Para extranjeros no domiciliados (exonerados de IGV), **factura de exportación de servicios de hospedaje** (operación 0202, afectación 40, identificados con pasaporte).
- **Correlativo** por serie (`series_comprobante`) sin huecos ni duplicados, aunque se emita a la vez desde varias PC.
- Una reserva tiene **un solo comprobante vigente**: los rechazados y anulados no cuentan.
- **OSE** (`FACTURACION=nubefact`): Nubefact genera el XML UBL 2.1, lo firma y lo envía a SUNAT.
  - Las boletas quedan «Pendiente» hasta el resumen diario.
  - Un proceso consulta los pendientes cada 5 minutos, y también se puede pulsar «Actualizar estado».
  - Al aceptarse, el comprobante se envía por correo al cliente con sus enlaces PDF y XML.
- **Baja** (solo administrador): comunicación de baja hasta 7 días después de la emisión, si el comprobante no tiene notas de crédito.
- **Notas de crédito** (solo administrador; ficha o pantalla «Comprobantes» → **Nota de crédito**):
  - **Motivos** (catálogo 09 de SUNAT): 01 anulación de la operación, 02 error en el RUC (solo facturas), 06 devolución total y 09 disminución en el valor (por un monto).
  - **Serie propia** (`BC01` para boletas, `FC01` para facturas). Cada nota modifica un solo comprobante, como exige SUNAT desde agosto de 2026.
  - **Nota total (01, 02, 06)**: al aceptarse, el comprobante queda *neutralizado* (`anulado_con_nota_id`). Sigue siendo válido en SUNAT, la nota lo resta en el registro de ventas y se puede emitir otro, por ejemplo con el RUC correcto.
  - **Nota parcial (09)**: baja el total de la reserva. Si SUNAT la rechaza, la rebaja se revierte.
  - No mueven dinero: si hay que devolver, se hace desde el pago.
- **Pantalla** «Comprobantes»: registro de ventas por fechas, donde las notas de crédito restan. Muestra totales (gravada, exportación, IGV) y exporta a CSV. Para Power BI está la vista `vw_comprobantes_powerbi` (columna `total_neto`).

### Consumos adicionales y notas de débito
- **Dónde**: ficha de la reserva → **Consumos adicionales** → **Agregar consumo**. Categorías: restaurante, bar, tour, minibar, late check-out y otros; descripción, cantidad y precio unitario en soles con IGV incluido.
- El consumo aumenta el total y el saldo; los cobros, la caja y los reportes usan ese total. Los consumos llevan IGV incluso si el hospedaje es exportación: el comprobante conserva ambas bases y muestra cada consumo como línea separada.
- Antes de emitir, recepción puede agregar consumos y el administrador puede anularlos con motivo. Los consumos documentados se conservan. Al cambiar de habitación con recálculo, solo se recalcula el hospedaje, manteniendo los consumos.
- Si ya hay boleta o factura aceptada, agregar un consumo requiere administrador y crea una **nota de débito** por aumento de valor. Si el comprobante está pendiente, hay que esperar su respuesta.
- Desde la ficha o «Comprobantes», el administrador también puede emitir una nota de débito directamente: **01 intereses por mora, 02 aumento de valor, 03 penalidades**. Cada nota referencia una boleta o factura aceptada y vigente; no puede modificar otra nota.
- Series propias `BD01` / `FD01`, configurables con `SERIE_ND_BOLETA` y `SERIE_ND_FACTURA`. La nota sube el saldo, suma en el registro de ventas, CSV y Power BI y se envía por correo al aceptarse. Si el OSE la rechaza, se revierte el cargo y se anula el consumo asociado.
- Un comprobante con notas de débito vigentes no se da de baja ni se neutraliza mediante una nota de crédito total desde este flujo. Las notas de crédito parciales siguen disponibles sobre el importe original.

### Cambio de habitación de una reserva en curso
- **Dónde**: ficha de la reserva (confirmada o con el huésped en el hotel) → **Cambiar habitación**.
- **Opciones**: solo habitaciones libres para las noches restantes y con capacidad suficiente.
- **Tarifa**:
  - **Mantener**: cortesía, mantenimiento o reubicación.
  - **Recalcular**: las noches ya usadas conservan su precio y las restantes toman la tarifa nueva. No se permite si ya hay comprobante emitido.
- **Huésped en el hotel**: el cambio rige desde hoy.
  - La reserva guarda `habitacion_desde` y la restricción anti-cruces de PostgreSQL solo considera ese tramo, así que las noches ya pasadas no bloquean a la nueva habitación.
  - La habitación anterior pasa a «Por limpiar».
- **Historial** en `cambios_habitacion` y en la bitácora, con el motivo.

### Encuesta de satisfacción
- **Envío**: el correo tras el check-out lleva un enlace único (`/encuesta?token=…`, imposible de adivinar).
- **Qué pregunta**: calificación de 1 a 5, recomendación de 0 a 10 y un comentario opcional. Se responde **una sola vez**.
- **Resultados** (Reportes → «Satisfacción de los huéspedes», solo administrador):
  - Calificación promedio, distribución y tasa de respuesta.
  - **NPS**: promotores (9–10) menos detractores (0–6).
  - Últimos comentarios.

### Bitácora de auditoría (`apps/api/src/auditoria`)
- **Qué registra**: quién hizo qué, cuándo y desde qué IP.
  - Sesiones: ingresos, fallos y bloqueos.
  - Reservas, pagos y anulaciones.
  - Check-out con saldo y cambios de habitación.
  - Tarifas, con el precio anterior y el nuevo.
  - Habitaciones, clientes y usuarios, con los campos que cambiaron.
  - Devoluciones, notas de crédito y encuestas respondidas.
  - Reclamos, comprobantes y correos reenviados.
- **Cómo**: el usuario y la IP salen de un contexto por petición (`AsyncLocalStorage`). El registro se guarda **en la misma transacción** que la operación.
- **Solo inserción**: un trigger de PostgreSQL rechaza `UPDATE`, `DELETE` y `TRUNCATE`. Las contraseñas nunca se guardan; solo consta que fueron restablecidas.
- **Pantalla** «Bitácora» (solo administrador): filtros, detalle con el valor anterior y el nuevo, y exportación a CSV. Además, la ficha de cada reserva muestra su historial.

### Antes de producción
Las integraciones reales se escribieron según la documentación oficial y sus contratos están probados con `fetch` simulado. **Aún no se han probado contra los servicios reales**: valídalas con las cuentas de prueba (sandbox) de cada proveedor.
- **Niubiz**:
  - Los campos antifraude `MDD` los define Niubiz para cada comercio; ajústalos en `pasarelas.ts`.
  - Habilita las API de devoluciones y prueba registros, consultas y conciliaciones con ventas liquidadas. El proveedor documenta hosts distintos en sandbox para registro y consulta; se pueden configurar con `NIUBIZ_DEVOLUCIONES_URL` y `NIUBIZ_CONSULTA_DEVOLUCIONES_URL`.
- **Culqi**: prueba el 3-D Secure con las tarjetas de prueba que lo exigen. La documentación de Culqi se contradice sobre el código HTTP (200 o 201) del cargo que pide 3DS, así que la API decide por el cuerpo de la respuesta (`object: "charge"` o `action_code: "REVIEW"`).
- **Nubefact**:
  - Revisa con la cuenta DEMO los códigos de la exportación (`sunat_transaction`, `tipo_de_igv`, `total_inafecta`) y de las notas de crédito (`tipo_de_comprobante: 3`, `documento_que_se_modifica_*`, `tipo_de_nota_de_credito`, sustento en `observaciones`), todos en `proveedores.ts`.
  - Registra en Nubefact las series de notas de crédito (`SERIE_NC_BOLETA`, `SERIE_NC_FACTURA`).
  - Registra también las series de débito (`SERIE_ND_BOLETA`, `SERIE_ND_FACTURA`) y valida las notas (`tipo_de_comprobante: 4`, `tipo_de_nota_de_debito`) y las cuentas con líneas gravadas y exportadas.
  - Confirma con tu contador el tratamiento tributario del hospedaje a no domiciliados.
- **Mercado Pago**: necesita `API_URL_PUBLICA` con HTTPS accesible desde Internet para los webhooks.
- **Correos programados**: con datos de demostración (`npm run db:demo`) y SMTP configurado, se enviarían recordatorios y encuestas a correos ficticios. Usa `CORREOS_PROGRAMADOS=false` en ese caso.

---

## Marca
Logo original: el sol poniéndose sobre el Pacífico, un cielo de atardecer (dorado, durazno y coral), dos trazos de brisa marina y el reflejo del sol sobre el mar, en un aro dorado.

| Archivo (`apps/web/public/marca/`) | Uso |
|---|---|
| `logotipo.svg` / `logotipo-claro.svg` | Emblema con el nombre, para fondo claro u oscuro (documentos, firmas, impresos) |
| `isotipo.svg` / `isotipo-512.png` | Solo el emblema (redes sociales, sellos) |
| `isotipo-mini.svg` | Versión simplificada para tamaños pequeños; es el favicon |

En el código, el componente `<Emblema />` (`apps/web/src/components/logo.tsx`) dibuja el logo con la misma geometría, y el PDF de confirmación lo reproduce con react-pdf.

Las fotos de excursiones están en `apps/web/public/img/tours/`, en formato WebP optimizado (unos 630 KB en total). Antes de publicar el sitio, confirma que tienes derecho a usar cada foto.

## Accesibilidad
Se auditó con axe-core (WCAG 2.1 AA) en escritorio y móvil: 10 páginas públicas y 30 pantallas del panel (secciones, modales, ficha y guía), sin errores. Entre otras cosas:
- Contraste de al menos 4.5:1.
- Etiquetas asociadas y errores anunciados.
- Modales con `<dialog>` nativo (foco atrapado y tecla Escape).
- Carrusel con pausa, teclado y respeto por «reducir movimiento».
- Navegación completa con teclado: la tecla `/` abre el buscador y Enter abre filas.

## Problemas frecuentes

| Síntoma | Solución |
|---|---|
| `npm run db` no conecta | PostgreSQL no está instalado o su servicio está detenido (`services.msc` → «postgresql-x64-…») |
| «La contraseña de postgres no es correcta» | Escribe la que pusiste al instalar; el script la guarda en `apps/api/.env` |
| El login dice «No se pudo conectar con la API» | Ejecuta `npm run dev` y revisa que http://localhost:4000/api/salud responda |
| «El puerto 3000/4000 ya está en uso» | Cierra la otra ventana con `npm run dev` |
| Error de CORS | Agrega tu URL en `CORS_ORIGENES` (`apps/api/.env`) |
| «Cerramos tu sesión por inactividad» | Pasaron 30 min sin uso; ajusta `NEXT_PUBLIC_PANEL_INACTIVIDAD_MIN` en `apps/web/.env.local` |
| Error `relation "bitacora" does not exist`, `function pagado_neto does not exist` (o `devoluciones`, `encuestas`, `turnos_caja`, `limpiezas`, `mantenimientos`…) | La base es anterior a las mejoras: ejecuta `npm run db:migrar` |
| «Abre tu turno de caja para cobrar» | En «Caja y pagos» pulsa «Abrir turno» con el fondo inicial (también aparece el botón en el cobro) |
| La campana avisa de correos fallidos | Abre «Correos», revisa el error (dirección inexistente, SMTP rechazado…) y pulsa «Reintentar» |
| Los correos aparecen como «Simulado» | No hay `SMTP_HOST` en `apps/api/.env`: se registran pero no se envían |
| No aparece «Pagar en línea» | Revisa `PASARELA` y sus credenciales (al arrancar, la API indica qué pasarela está activa) |
| `npm run test:e2e` falla por la contraseña de postgres | Las pruebas leen `apps/api/.env`: ejecuta antes `npm run db` para guardarla |

## Publicar
- **Web**: Vercel u otro hosting de Node. Define `NEXT_PUBLIC_API_URL` y `NEXT_PUBLIC_WHATSAPP`.
- **API**: VPS o Render.
  - Define `JWT_SECRETO` y `JWT_SECRETO_RENOVACION` (textos largos y aleatorios; la API no arranca en producción sin ellos), las variables `PG*` y `CORS_ORIGENES`.
  - Define también `WEB_URL`, `API_URL_PUBLICA`, `SMTP_*`, `PASARELA` con sus credenciales y `FACTURACION` con las de Nubefact.
  - Con `NODE_ENV=production` no se activan la pasarela ni el OSE simulados.
  - `TRUST_PROXY` (por defecto `1`) indica cuántos proxies hay delante. Detrás de Render o nginx deja `1`; si la API recibe las conexiones directamente, pon `false`. Si no, cualquiera puede elegir su IP con `X-Forwarded-For`, saltarse el límite de intentos y dejar una IP falsa en la bitácora.
- **Base de datos**: cualquier PostgreSQL 14+ con permiso para `CREATE EXTENSION btree_gist`.
- **Usuarios**: cambia las contraseñas iniciales.

## Referencias de las integraciones
- [Guía de pruebas sandbox](docs/pruebas-sandbox.md): credenciales requeridas, base separada, selección de `.env.sandbox` y casos de pago, devolución y comprobantes. La revisión local de variables no sustituye la validación contra el proveedor.
- [Niubiz: registro individual de devoluciones](https://desarrolladores.niubiz.com.pe/docs/api-de-registro-individual-copy).
- [Niubiz: consulta del estado de devolución](https://desarrolladores.niubiz.com.pe/docs/api-de-consulta-devolución-copy).
- [Nubefact: documentación oficial y manual JSON para facturas, boletas y notas](https://www.nubefact.com/integracion).
