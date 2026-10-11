# Hotel Marea Alta · Paracas — v2 (Next.js + NestJS + PostgreSQL)

Sitio web del hotel con reservas en línea y sistema de gestión hotelera con login por roles.

| Capa | Tecnologías | Carpeta |
|---|---|---|
| Web pública + panel | **Next.js 16.3** (App Router), **React 19**, **Tailwind 4**, **Zustand**, **TanStack Table 9**, **React Hook Form + Zod**, **react-pdf**, carrusel **Embla**, Recharts | `apps/web` |
| API | **NestJS 11**, **pg** (PostgreSQL), **ssh2** (túnel opcional), JWT | `apps/api` |
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
  - Mi reserva, Libro de Reclamaciones (Ley 29571) y privacidad.
- **Panel** (`/panel`):
  - Dashboard, recepción, reservas, habitaciones (tablero por piso), clientes, caja, reportes, tarifas, reclamaciones, usuarios y mi cuenta.
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
- `packages/shared`: tarifas e IGV, documentos, fechas hábiles, prorrateo de métricas y esquemas Zod.
- `apps/api` (unitarias): contraseñas y política de cancelación.
- `apps/api/test` (de punta a punta, contra PostgreSQL real):
  - Reservas, validaciones y libro de reclamaciones.
  - Roles, bloqueo de cuenta y renovación de sesión.
  - Walk-in → pago → check-out.
  - Anulación de pagos, CRUD de habitaciones y clientes.
  - **Concurrencia**: 6 personas reservan a la vez las 4 suites y se confirman exactamente 4, sin cruces.

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

## Publicar
- **Web**: Vercel u otro hosting de Node. Define `NEXT_PUBLIC_API_URL` y `NEXT_PUBLIC_WHATSAPP`.
- **API**: VPS o Render. Define `JWT_SECRETO` y `JWT_SECRETO_RENOVACION` (textos largos y aleatorios; la API no arranca en producción sin ellos), las variables `PG*` y `CORS_ORIGENES`.
- **Base de datos**: cualquier PostgreSQL 14+ con permiso para `CREATE EXTENSION btree_gist`.
- **Usuarios**: cambia las contraseñas iniciales.

## Mejoras posibles
- Correos automáticos para la confirmación y la respuesta a reclamos.
- Pasarela de pago (Niubiz, Culqi, Mercado Pago).
- Facturación electrónica SUNAT mediante un OSE.
- Cambio de habitación de una reserva en curso.
- Bitácora de auditoría.
