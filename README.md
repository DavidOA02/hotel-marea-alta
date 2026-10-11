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
| `npm run build` y luego `npm start` | Compilación de producción y arranque |

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
  - Dashboard, recepción, reservas, habitaciones (tablero por piso), clientes, caja, comprobantes electrónicos, reportes, tarifas, reclamaciones, usuarios, bitácora de auditoría y mi cuenta.
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
- `apps/api` (unitarias): contraseñas, política de cancelación y **contratos de las integraciones** con `fetch` simulado (Culqi, Mercado Pago y la firma de su webhook, Niubiz y Nubefact).
- `apps/api/test` (de punta a punta, contra PostgreSQL real; leen `apps/api/.env` y fuerzan los modos simulados, así nunca envían correos ni cobran):
  - Reservas, validaciones y libro de reclamaciones.
  - Roles, bloqueo de cuenta y renovación de sesión.
  - Walk-in → pago → check-out.
  - Anulación de pagos, CRUD de habitaciones y clientes.
  - **Concurrencia**: 6 personas reservan a la vez las 4 suites y se confirman exactamente 4, sin cruces.
  - Correos encolados (y su HTML escapado), cambio de habitación (incluido el huésped en curso sin falsos cruces), pagos en línea **idempotentes** (avisos repetidos o simultáneos registran un solo pago), boletas, facturas y exportación con **correlativo sin huecos** aunque se emitan a la vez, y bitácora inmodificable.

---

## Correos, pagos en línea, facturación, cambio de habitación y bitácora

Todo funciona en desarrollo **sin credenciales**: los correos quedan como «Simulado», la pasarela de pago es simulada (botones «aprobar» o «rechazar») y el OSE simulado acepta los comprobantes sin validez tributaria. En producción, los modos simulados se desactivan solos. Las variables están documentadas en `apps/api/.env.ejemplo`, y al arrancar la API muestra qué está activo.

Si ya tienes la base con datos, ejecuta `npm run db:migrar` (no borra nada).

### Correos automáticos (`apps/api/src/correo`)
- Se envían:
  - **Al reservar** (web o panel): la confirmación.
  - **Al cancelar**: el aviso de cancelación.
  - **Con un pago en línea**: el recibo del pago.
  - **Al aceptarse un comprobante**: el comprobante electrónico.
  - **Por el Libro de Reclamaciones**: la constancia de la hoja y la **respuesta** que registra el administrador.
- **Bandeja de salida** (tabla `correos`): el correo se guarda en la misma transacción que la operación y un proceso lo envía por SMTP (`nodemailer`) con reintentos (1, 5, 15 y 60 min). Un servidor de correo caído nunca hace fallar una reserva.
- En la ficha de la reserva y en la hoja de reclamación se ve si cada correo se envió. Se puede reenviar la confirmación o reintentar un correo fallido.
- Las plantillas escapan todo dato que escribe el usuario (evita inyección de HTML).

### Pagos en línea (`apps/api/src/pagos-en-linea`)
- **Flujo**: «Mi reserva» o la confirmación de la reserva → **Pagar en línea** → página `/pago`.
  - Cada intento es una *orden* con un id imposible de adivinar.
  - El **monto lo fija la API** (el saldo de la reserva).
  - El resultado **siempre se verifica con la pasarela**, nunca con lo que diga el navegador.
- **Pasarelas** (`PASARELA=…`):
  - **Culqi**: Checkout Custom tokeniza la tarjeta o Yape en el navegador y la API crea el cargo con la llave secreta.
  - **Mercado Pago**: Checkout Pro por redirección. El pago se confirma consultando `/v1/payments` al volver y con el webhook `POST /api/webhooks/mercadopago`, que valida la firma `x-signature`.
  - **Niubiz**: botón de pago web. Primero se obtienen el token de seguridad y la sesión; luego el formulario de Niubiz envía el `transactionToken` a la API, que autoriza (`ACTION_CODE 000`) y devuelve al huésped a la web.
- **Idempotente**: si la pasarela avisa dos veces (retorno y webhook), el pago se registra una sola vez. Un pago aprobado se registra aunque la orden haya vencido.
- La reserva se **bloquea** mientras se registra cualquier pago, así dos cobros simultáneos (web y recepción) no superan el saldo.
- Si aun así queda saldo a favor, se marca en la bitácora para devolverlo.
- Anular en Caja un pago hecho por pasarela avisa que la devolución se hace desde el panel de la pasarela.

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
- **Anulación** (solo administrador): comunicación de baja hasta 7 días después de la emisión. Pasado ese plazo corresponde una nota de crédito, que aún no está incluida.
- **Pantalla** «Comprobantes»: registro de ventas por fechas con totales (gravada, exportación, IGV) y CSV. Para Power BI está la vista `vw_comprobantes_powerbi`.

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

### Bitácora de auditoría (`apps/api/src/auditoria`)
- **Qué registra**: quién hizo qué, cuándo y desde qué IP.
  - Sesiones: ingresos, fallos y bloqueos.
  - Reservas, pagos y anulaciones.
  - Check-out con saldo y cambios de habitación.
  - Tarifas, con el precio anterior y el nuevo.
  - Habitaciones, clientes y usuarios, con los campos que cambiaron.
  - Reclamos, comprobantes y correos reenviados.
- **Cómo**: el usuario y la IP salen de un contexto por petición (`AsyncLocalStorage`). El registro se guarda **en la misma transacción** que la operación.
- **Solo inserción**: un trigger de PostgreSQL rechaza `UPDATE`, `DELETE` y `TRUNCATE`. Las contraseñas nunca se guardan; solo consta que fueron restablecidas.
- **Pantalla** «Bitácora» (solo administrador): filtros, detalle con el valor anterior y el nuevo, y exportación a CSV. Además, la ficha de cada reserva muestra su historial.

### Antes de producción
Las integraciones reales se escribieron según la documentación oficial y sus contratos están probados con `fetch` simulado. **Aún no se han probado contra los servicios reales**: valídalas con las cuentas de prueba (sandbox) de cada proveedor.
- **Niubiz**: los campos antifraude `MDD` los define Niubiz para cada comercio; ajústalos en `pasarelas.ts`.
- **Culqi**: las tarjetas que piden 3-D Secure se rechazan con un mensaje claro (el flujo 3DS no está implementado).
- **Nubefact**: revisa con la cuenta DEMO los códigos de la exportación (`sunat_transaction`, `tipo_de_igv`, `total_inafecta` en `proveedores.ts`). Confirma con tu contador el tratamiento tributario del hospedaje a no domiciliados.
- **Mercado Pago**: necesita `API_URL_PUBLICA` con HTTPS accesible desde Internet para los webhooks.

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
| Error `relation "bitacora" does not exist` (o `correos`, `comprobantes`…) | La base es anterior a las mejoras: ejecuta `npm run db:migrar` |
| Los correos aparecen como «Simulado» | No hay `SMTP_HOST` en `apps/api/.env`: se registran pero no se envían |
| No aparece «Pagar en línea» | Revisa `PASARELA` y sus credenciales (al arrancar, la API indica qué pasarela está activa) |
| `npm run test:e2e` falla por la contraseña de postgres | Las pruebas leen `apps/api/.env`: ejecuta antes `npm run db` para guardarla |

## Publicar
- **Web**: Vercel u otro hosting de Node. Define `NEXT_PUBLIC_API_URL` y `NEXT_PUBLIC_WHATSAPP`.
- **API**: VPS o Render.
  - Define `JWT_SECRETO` y `JWT_SECRETO_RENOVACION` (textos largos y aleatorios; la API no arranca en producción sin ellos), las variables `PG*` y `CORS_ORIGENES`.
  - Define también `WEB_URL`, `API_URL_PUBLICA`, `SMTP_*`, `PASARELA` con sus credenciales y `FACTURACION` con las de Nubefact.
  - Con `NODE_ENV=production` no se activan la pasarela ni el OSE simulados.
- **Base de datos**: cualquier PostgreSQL 14+ con permiso para `CREATE EXTENSION btree_gist`.
- **Usuarios**: cambia las contraseñas iniciales.

## Mejoras posibles
- Notas de crédito electrónicas (anulación pasado el plazo de baja y devoluciones parciales).
- Flujo 3-D Secure de Culqi y devoluciones automáticas desde el panel.
- Recordatorio por correo dos días antes de la llegada y encuesta tras el check-out.
- Panel de correos fallidos con alerta en la campana.
