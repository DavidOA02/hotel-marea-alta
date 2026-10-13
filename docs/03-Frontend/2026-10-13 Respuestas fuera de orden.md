# Respuestas fuera de orden en el panel y la web — 13/10/2026

Encontrado al revisar las advertencias de ESLint `react-hooks/set-state-in-effect` pendientes desde la [[2026-10-13 Auditoría de seguimiento]]. Sin commit.

| Gravedad | Estado |
|---|---|
| Alta en la ficha de reserva · Media en el resto | Corregido |

## Síntoma

Varios efectos piden datos al servidor y guardaban la respuesta sin comprobar si seguía siendo la vigente. Si una respuesta lenta llegaba después de una más reciente, la pantalla mostraba datos que no correspondían a lo elegido:

- **Ficha de reserva:** se abre la reserva A, se cierra y se abre la B antes de que llegue la respuesta de A. Cuando llega, la ficha muestra a A, pero los botones (check-in, check-out, cancelar, no show) actúan sobre el código vigente, que es B.
- **Listas del panel (`useDatos`):** con dos filtros elegidos seguidos, la tabla podía quedarse con el resultado del primero.
- **Buscador del panel:** resultados de un texto anterior, o un desplegable que vuelve a aparecer después de borrar el texto.
- **Nueva reserva:** búsqueda de clientes y disponibilidad de fechas anteriores.
- **Formulario web:** disponibilidad de fechas anteriores. El servidor vuelve a validar al reservar.
- **Reclamaciones:** correos de otro reclamo.

Con una red rápida es poco probable; con una conexión lenta, posible.

## Solución

Es el patrón estándar de React: al limpiar el efecto (cambio de parámetro o desmontaje), la respuesta pendiente se marca como vencida y se ignora.

| Archivo | Cambio |
|---|---|
| `apps/web/src/components/panel/base.tsx` | `useDatos` solo aplica la respuesta de la última petición (contador en `useRef`; también cubre `recargar`) |
| `apps/web/src/components/panel/reservas.tsx` | Ficha: descarta respuestas vencidas y trata como «Cargando» los datos de otro código. Nueva reserva: búsqueda de clientes y disponibilidad |
| `apps/web/src/app/panel/(app)/layout.tsx` | Buscador global |
| `apps/web/src/app/panel/(app)/reclamaciones/page.tsx` | Correos del reclamo abierto |
| `apps/web/src/components/sitio/formulario-reserva.tsx` | Disponibilidad del formulario web |

No se cambiaron los efectos cuyo parámetro no cambia en la práctica: encuesta (token), estado de facturación y opciones de cambio de habitación (fijas mientras el modal está abierto).

## Verificación

- `npm run tipos -w @marea/web`, `npm run lint` (0 errores) y `next build`: correctos.
- **Navegador, con la API simulada dentro de la página.** `fetch` interceptado y retrasos controlados; sin base de datos ni servidor real (la web se compiló apuntando a un puerto sin servicio):
  1. Buscador: «ana» lento y luego «beto» rápido → solo Beto. «ana» lento y luego texto borrado → nada.
  2. Ficha: A lenta → cerrar → B rápida → la ficha muestra B (`MA2600002`) cuando llega la respuesta de A.
  3. Lista de reservas: filtro «Cancelada» lento y luego «CheckIn» rápido → la tabla muestra el resultado de CheckIn.

  El registro de llamadas confirma que en cada caso la respuesta lenta llegó después de la rápida.
- La prueba detectó un error del primer intento de la ficha: con la ficha cerrada (`d` y `codigo` nulos) se leía `d.reserva` y el panel no cargaba. Se corrigió antes de terminar.

## Advertencias que siguen

Las 22 advertencias de ESLint se mantienen. Son patrones intencionados:

- **`set-state-in-effect` (12):** sincronizar con la URL, reiniciar formularios al abrir un modal, marcar la hidratación, detectar `localhost`.
- **`incompatible-library` (9):** el `watch()` de React Hook Form hace que el React Compiler no optimice ese componente; funciona igual. Pasar a `useWatch` es una mejora de rendimiento opcional.
- **`no-location-assign-relative-destination` (1):** el cierre de sesión recarga la página a propósito para borrar todo el estado en memoria.

## Pendiente

La web no tiene pruebas automatizadas de componentes; esta verificación fue manual en el navegador. Añadirlas (por ejemplo, Playwright con la API simulada) exige una dependencia nueva y queda a decisión del equipo.
