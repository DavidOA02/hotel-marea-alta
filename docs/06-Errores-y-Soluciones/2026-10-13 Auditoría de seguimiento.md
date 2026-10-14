# Auditoría de seguimiento — 13/10/2026

Continúa la [[2026-10-12 Auditoría general]] sin repetirla. Se revisaron las áreas que no cubrió: permisos por rol en cada ruta, reservas duplicadas, CRUD de habitaciones, dependencias y la interfaz en tableta. Las pruebas usaron la base `hotel_marea_alta_test`; la base `hotel_marea_alta` no se tocó. Sin commit.

**Verificación final:** tipos de API y web sin errores · lint sin errores · 40 pruebas unitarias del paquete compartido · 37 de la API · 13 del verificador sandbox · 62 e2e · `npm run build` correcto.

| # | Hallazgo | Gravedad | Estado |
|---|---|---|---|
| 1 | La página Correos del panel tenía scroll horizontal en tableta | Baja | Corregido |
| 2 | Faltaba una prueba de permisos para la mayoría de las rutas de administrador | Media | Prueba añadida |
| 3 | Vulnerabilidades en dependencias de desarrollo | Baja | Críticas corregidas; quedan las que exigen cambio mayor |

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
- Desarrollo: 27 avisos. Los 2 críticos son de `shell-quote`, que usa `concurrently` solo con los scripts del `package.json`. Ningún dato externo llega ahí, así que el riesgo real es mínimo. **Corregido** después con `npm audit fix` (sin `--force`): `shell-quote` 1.9.0 → 1.12.0, `concurrently` 9.2.4 → 9.2.5 y `babel-plugin-istanbul` 8.0.0 → 8.0.2. Solo cambian 10 líneas de `package-lock.json` y ningún `package.json`. Quedan 25 avisos (20 moderados, 5 altos) y ninguno crítico.
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

---

## Validación antes de fusionar `develop` en `main`

`develop` es `main` más el commit `b7aa251`: `main` está en el mismo árbol que `652a7d0`. Una fusión de prueba en memoria (`git merge-tree`) no da conflictos.

| Comprobación | Resultado |
|---|---|
| Lint (`npm run lint`) | 0 errores, 22 advertencias (las mismas aceptadas en el README) |
| Tipos: shared, API y web (`tsc --noEmit`) | Sin errores |
| Pruebas unitarias (`npm test`) | 40 + 37 correctas |
| Verificador sandbox (`npm run test:sandbox`) | 13 correctas |
| E2E con PostgreSQL local (`npm run test:e2e`) | 62 correctas |
| Compilación de producción (`npm run build`) | Correcta, 25 rutas web |
| Prueba de permisos: mutación | Sin `@Roles` en `GET suscriptores`, la prueba falla. Restaurado |

**Corrección aplicada.** `.gitignore` ahora excluye `receipts/` y `review-receipts/` en cualquier carpeta (registros de las herramientas del agente) y `docs/.obsidian/workspace.json` (estado personal de Obsidian). Ningún archivo con seguimiento cae en esas rutas.

**Seguridad de reservas revisada.**
- «Mi reserva», cancelar y crear una orden de pago exigen código + correo del titular.
- Las órdenes de pago y las encuestas usan UUID.
- El pago simulado se rechaza en producción por `NODE_ENV` y por la pasarela de la orden.
- Las reservas cruzadas se impiden con bloqueo por tipo + `EXCLUDE`, con prueba de concurrencia.

**Resuelto después de la validación (sin commit):**
- **GitHub Actions.** Antes no había ninguna validación automática de pull requests. Nuevo `.github/workflows/ci.yml`: en cada push o pull request a `main`/`develop` ejecuta `npm ci`, lint, compilación, pruebas unitarias, del verificador sandbox y e2e. Las e2e usan un PostgreSQL 17 desechable del runner (Node 24, permisos `contents: read`).
- **`apps/web/next-env.d.ts`.** `next dev` y `next build` lo reescribían con rutas distintas y dejaban un cambio pendiente cada vez. La documentación de Next 16 (`02-typescript.md`) dice: «Add it to `.gitignore`. If your project already tracks the file, remove it from Git». Se añadió al `.gitignore` y se retiró del índice con `git rm --cached`; el archivo sigue en disco. El script `tipos` de la web ahora ejecuta `next typegen && tsc --noEmit`, para regenerarlo en un clon limpio.
- **Dependencias críticas:** ver el punto 3.

**Verificación.** Se clonó `develop` en una carpeta temporal y se le aplicaron los cambios, sin `next-env.d.ts`. Luego se ejecutaron los pasos del CI en orden:
- `npm ci`: correcto, el lockfile es coherente.
- `tipos`: correcto, regenera `next-env.d.ts`.
- Lint: 0 errores.
- Compilación: correcta.
- Pruebas: 40 + 37 unitarias, 13 del verificador sandbox y 62 e2e, todas correctas.

El `next-env.d.ts` regenerado ya no aparece en `git status`.

**Sin bloquear la fusión:** `npm ls` marca `ajv-formats` 3.0.1 como inválido para `@hookform/resolvers`. Es una dependencia *peer* opcional del validador AJV, que la web no usa (usa Zod). Ya estaba igual en `main`.

## Continuación: identidad del cliente bajo concurrencia

**Estado inicial.** Rama `develop`, árbol limpio. El README describe funcionalidades existentes; los pendientes concretos están en estas auditorías y en la guía sandbox.

**Causa encontrada en el código.** Dos reservas públicas de categorías distintas adquieren bloqueos de disponibilidad distintos. Si ambas buscan un documento aún no registrado, ambas pueden llegar al `INSERT` de clientes. El `ON CONFLICT DO UPDATE` anterior no comprobaba el correo y podía sustituir la ficha creada por la otra transacción. El `SELECT FOR UPDATE` inicial no bloquea una fila inexistente.

**Corrección.** En `apps/api/src/reservas/reservas.service.ts`, el propio `ON CONFLICT` condiciona la actualización pública a que coincida el correo registrado, ignorando espacios exteriores y mayúsculas. Si no coincide, recupera el ID del titular sin modificar sus datos y activa `correoRegistrado`. Conserva el envío al correo del titular y el contacto propuesto en la bitácora. Recepción mantiene su comportamiento. Sin cambios de esquema ni de contrato público.

**Validación ejecutada.**
- `npm.cmd test`: 40 pruebas shared y 40 API correctas. Las tres nuevas en `identidad.spec.ts` simulan una fila confirmada entre la búsqueda y el INSERT: otro correo público, mismo correo con mayúsculas y reserva de recepción. Verifican ficha, destinatario, vinculación de reserva y bitácora.
- `npm.cmd run test:sandbox`: 13 correctas, sin red ni credenciales.
- `npm.cmd run lint`: 0 errores, 22 advertencias en la web.
- `npm.cmd run build`: shared, API y web correctos; 25 páginas generadas.
- `git diff --check`: correcto.

**Limitaciones.** Las pruebas nuevas usan dobles de base de datos: no demuestran el bloqueo real en PostgreSQL. No se ejecutó `test:e2e`: su preparación elimina `hotel_marea_alta_test` usando la conexión local, y no se verificó que esa base fuera desechable. No se iniciaron servicios, se enviaron mensajes ni se ejecutaron migraciones o acciones de Git de publicación. PowerShell bloqueó `npm.ps1`; se usó `npm.cmd` sin cambiar la política de ejecución.

**Pendientes priorizados.**
1. Validar esta carrera con PostgreSQL desechable y añadir una prueba de dos categorías con el mismo documento. Asegurar el aislamiento del preparador e2e antes de ejecutarlo localmente.
2. Truncamiento del código desde el ID 100000: corregido en la continuación siguiente; falta validarlo en la suite e2e aislada.
3. Ejecutar los casos de pagos, devoluciones y comprobantes de `docs/pruebas-sandbox.md` con cuentas oficiales de prueba; la validación local no sustituye esa evidencia.
4. Completar la revisión de navegador de las páginas de administrador en recursos de prueba aislados.

## Continuación: códigos de reserva desde el ID 100000

**Causa.** `lpad(id::text, 5, '0')` trunca los IDs largos: 100000 se convertía en 10000 y podía colisionar con una reserva anterior del mismo año. La columna `codigo` admite 20 caracteres y los validadores públicos aceptan al menos siete dígitos después de `MA`; no hace falta una migración ni cambiar códigos históricos.

**Cambio.** `reservas.service.ts` calcula el correlativo con `String(res.id).padStart(5, '0')` y lo pasa como parámetro SQL. Conserva el prefijo y el año generado por PostgreSQL. `database/02_datos_demo.sql` usa `greatest(5, length(id::text))` como longitud de relleno para mantener el mismo formato en futuras bases demo. Este script no se ejecutó.

**Pruebas.** `identidad.spec.ts` verifica la generación con IDs 42, 99999, 100000, 100001 y 2147483647 para los tres casos de identidad ya cubiertos (15 casos). El doble de base comprueba el correlativo recibido en el UPDATE y el código devuelto; no ejecuta PostgreSQL. `shared.test.ts` confirma que pago en línea acepta los códigos largos.

**Validación ejecutada.** `npm.cmd test`: 40 shared y 52 API correctas. `npm.cmd run lint -- --quiet`: correcto, sin errores (omite advertencias). `npm.cmd run build`: shared, API y web correctos, 25 páginas generadas. `git diff --check`: correcto. Tras ajustar la ficha ficticia de las pruebas para que también use el código generado, se repitió la prueba de identidad.

**Sin ejecutar.** E2E, SQL demo, migraciones y pruebas de navegador. Sin conexiones a bases de datos, mensajes, cobros, commits ni publicación. Los cambios de identidad anteriores se conservaron.

## Continuación: validación con PostgreSQL de los pendientes 1 y 2

**Aislamiento.** `hotel_marea_alta_test` es desechable por diseño: `test/preparar-bd.ts` la crea desde cero en cada ejecución y no toca otra base. La conexión es al PostgreSQL local (`PGHOST=localhost`, sin túnel SSH). Antes de ejecutar se comprobó que no hubiera otra suite e2e en curso.

**Pruebas nuevas en `apps/api/test/api.e2e-spec.ts`:**
- **«Dos reservas web simultáneas de tipos distintos con el mismo documento nuevo no se pisan la ficha».** 5 pares en paralelo (Duna y Pleamar), cada uno con otro correo. En cada par, una respuesta tiene `correoRegistrado`, la ficha conserva el correo de la otra y las dos reservas son del mismo cliente. La prueba aislada se repitió 3 veces (15 pares) sin fallos.
- **«El código de reserva no se recorta desde el id 100000».** Adelanta la identidad de `reservas` en la base de prueba (`ALTER TABLE … RESTART WITH 100000`) y comprueba el código `MA` + año + `100000` y su consulta en «Mi reserva». Va la última porque cambia la numeración.

**Validación.**
- E2E: 64 correctas (antes 62).
- Lint: 0 errores.
- `npm run build`: correcto.
- Unitarias: 40 + 52.
- Verificador sandbox: 13.
- `git diff --check`: correcto.

**Pendientes 1 y 2:** cerrados. Siguen abiertos el 3 (sandbox con cuentas oficiales) y el 4 (navegador en las páginas de administrador).

## Continuación: aislamiento de la preparación e2e

**Estado inicial.** `develop` limpio, con las correcciones y las 64 e2e anteriores ya incorporadas. No se alteraron esos commits.

**Riesgo confirmado.** El preparador ejecutaba `DROP DATABASE IF EXISTS hotel_marea_alta_test WITH (FORCE)` antes de crear la base. El nombre fijo y el uso habitual para pruebas no garantizan que su contenido sea descartable, y dos ejecuciones podían interferir. La validación anterior no eliminaba ese riesgo del código.

**Cambio.** `apps/api/test/preparar-bd.ts` genera un nombre `hotel_marea_alta_e2e_<uuid>` y ejecuta CREATE sin borrar bases previamente existentes. Solo registra la propiedad de la base cuando CREATE termina correctamente. `limpiar-bd.ts`, configurado como globalTeardown de Jest, elimina exclusivamente esa base, sin FORCE. Si falla la carga del esquema, también limpia únicamente la base recién creada. El estado de propiedad se conserva en memoria entre setup y teardown; no se persisten credenciales.

Los workers reciben el nombre generado mediante `MAREA_E2E_BD`, validan su formato y lo usan como `PGDATABASE`. Se retiraron las dos asignaciones al nombre fijo. La conexión se rechaza antes de abrirse si apunta a un host remoto, usa SSH o SSL, tiene un puerto inválido o indica producción. Se mantienen las pasarelas simuladas, SMTP vacío y los procesos automáticos desactivados.

**Pruebas y comandos.**
- `npm.cmd test`: 40 shared, 52 API y 16 salvaguardas de aislamiento correctas. Las últimas se ejecutan sin PostgreSQL y quedan incluidas en el comando habitual y en CI.
- `npm.cmd run test:e2e`: 64 correctas con PostgreSQL local y una base nueva; incluyen concurrencia de identidad y código desde ID 100000.
- `npm.cmd run build`: shared, API y web correctos, 25 páginas generadas.
- `npm.cmd run lint -- --quiet`: inicialmente detectó un salto de línea en una llamada de la prueba nueva; corregido y repetido sin errores. Las advertencias no se muestran con `--quiet`.
- `npm.cmd run test:aislamiento -w @marea/api`: repetido tras corregir el formato, 16 correctas.
- Verificación adicional mediante `node` y una transacción READ ONLY sobre `postgres`: 0 bases con el prefijo temporal e2e al terminar. Solo se consultó `pg_database`.
- `git diff --check`: correcto.

**Documentación.** El README explica el ciclo de vida de las bases aisladas y los requisitos del usuario local. Su solución a errores de contraseña ya no recomienda ejecutar `npm run db`, que borra la base de la aplicación.

**Acciones sobre datos y límites.** Se creó, inicializó y eliminó únicamente la base aleatoria de esta ejecución. No se reinició `hotel_marea_alta_test` ni se modificaron bases de la aplicación. Los SQL de esquema y mejoras se ejecutaron solo dentro de la base nueva. Sin proveedores externos, mensajes reales, cambios de arquitectura, commits ni publicación. Una interrupción del proceso o un fallo de limpieza puede dejar la base temporal; no se elimina automáticamente en otra ejecución. Las pruebas sandbox oficiales y la revisión de navegador de administrador siguen pendientes.

## Continuación: revisión de administrador y foco del menú móvil

**Entorno.** Se conservaron los cambios de aislamiento sin commit. Se creó otra base aleatoria con el preparador revisado, sin reutilizar bases existentes. Se inició NestJS desde el código actual en `127.0.0.1:4100` y Next.js en `127.0.0.1:3100`, con `NEXT_PUBLIC_API_URL` apuntando a esa API. Pagos y facturación simulados, SMTP vacío y procesos automáticos apagados. Se usó Playwright y el axe-core ya instalado; no se añadieron dependencias.

**Defecto reproducido.** En `apps/web/src/app/panel/(app)/layout.tsx`, el menú cerrado solo se desplazaba fuera de pantalla mediante `-translate-x-full`. A 390 px, después de los enlaces para saltar al contenido, Tab enfocaba «Cerrar menú», «Dashboard», «Recepción» y otros enlaces con coordenadas negativas. El usuario de teclado no podía ver el foco. Axe-core no detectó este problema: lo identificó la comprobación de teclado.

**Corrección.** El menú cerrado usa además `invisible`, con `lg:visible` para mantener la navegación de escritorio. Al abrirlo usa `visible`. El botón «Abrir menú» declara `aria-controls="menu-principal"` y `aria-expanded` según el estado. Cambio limitado a dos líneas del layout; sin modificar autenticación, contratos, diseño o esquema.

**Verificación de navegador.**
- Administrador: inicio de sesión, cambio obligatorio de contraseña temporal y nuevo acceso con la contraseña cambiada, sin omitir el flujo normal.
- Reportes, Tipos y tarifas, Usuarios y Bitácora a 1440, 768 y 390 px (12 vistas): sin desbordamiento horizontal, alertas de error ni excepciones de JavaScript. Axe-core con etiquetas WCAG 2 A/AA y 2.1 AA: cero incidencias, repetido después de la corrección.
- Menú: ocho pasos de Tab por ancho a 390, 768, 1024 y 1440 px. En móvil/tableta, ningún paso entra en el menú cerrado ni sale de pantalla. En escritorio, los enlaces permanecen accesibles. Abrir/cerrar funciona y actualiza `aria-expanded`.
- Usuarios: validación de campos vacíos y creación de un usuario ficticio. El diálogo contiene el foco durante Tab, Escape lo cierra y el foco vuelve al botón de apertura. Diálogo sin incidencias axe-core.
- Tarifas: edición de la tarifa ficticia Duna de 450 a 455 y confirmación del valor guardado. Diálogo sin incidencias axe-core. Bitácora: filtro de texto y apertura del detalle muestran `tipo.editar`, importe anterior y nuevo.
- Reportes: filtro «Mes pasado» y descarga CSV con nombre correspondiente al periodo. Se revisó el estado sin reservas; no se verificaron gráficos con datos de ocupación.
- Recepción: acceso normal con cambio de contraseña; las cuatro páginas exclusivas muestran la restricción. La API responde 403 a lectura de reportes, usuarios y bitácora, y a actualización de tarifas. La lectura de tipos responde 200, necesaria para registrar reservas y consistente con el contrato existente.

**Comandos ejecutados.** `npm.cmd run lint -- --quiet` sin errores; `npm.cmd run tipos -w @marea/web` correcto; `npm.cmd run build -w @marea/web` correcto (25 páginas); `git diff --check` correcto. No se repitieron las pruebas unitarias o e2e de backend: el cambio afecta a visibilidad CSS y atributos del menú, verificados en navegador real.

**Limpieza.** Se cerraron navegador, API y servidor Next.js. Se ejecutó el manejador de cierre de la API y la limpieza del preparador sobre su base propia; la consola confirmó su eliminación. Una consulta READ ONLY a `pg_database` confirmó cero bases con prefijo temporal e2e. Se retiraron el script temporal de revisión y los archivos generados por Playwright (solo datos ficticios). Sin correos, cobros reales, modificación de bases existentes, commits ni publicación.

**Estado de pendientes.** Revisión de las páginas exclusivas de administrador completada en el alcance anterior, con el defecto de teclado corregido. La auditoría automática no constituye certificación integral de accesibilidad. Continúan pendientes los casos con cuentas sandbox oficiales de proveedores; no se ejecutaron en esta sesión.

## Continuación: variables heredadas antes de iniciar sandbox

**Hallazgo.** `cargarEnv` conserva la prioridad del entorno del proceso sobre el archivo. El verificador sandbox revisaba solamente el archivo, como advertía la guía: un archivo correcto podía obtener código 0 aunque el terminal heredara otra base, llaves de producción, SMTP activo o procesos automáticos. No se encontró `apps/api/.env.sandbox`; no se inspeccionaron ni crearon credenciales.

**Cambio.** `tools/sandbox-verificar.js` incorpora `--entorno` como opción explícita. Compara las variables heredadas relevantes y las variables declaradas en el archivo, rechazando discrepancias y valores heredados no declarados. Comprueba también que `API_ENV_ARCHIVO` seleccione el archivo revisado. Los mensajes muestran únicamente nombres de variables. No completa campos con el entorno, no lo modifica y no inicia la API. El modo predeterminado conserva su comprobación exclusiva del archivo.

**Pruebas.** Se añadieron cinco casos a `sandbox-verificar.test.js`: cambios heredados de base/proveedor/barreras; valores coincidentes y variables ajenas; selección de archivo; campos faltantes que no se completan con secretos del terminal; y argumentos repetidos o inválidos. Los casos cubren contraseña, llaves, SMTP, SSH, opciones PostgreSQL/Node, producción y procesos automáticos, sin red ni PostgreSQL.

**Documentación.** README y `docs/pruebas-sandbox.md` explican la opción. La secuencia recomendada verifica el mismo terminal después de seleccionar `API_ENV_ARCHIVO` y detiene el arranque si el verificador no termina con código 0. No se recomienda copiar secretos de producción al archivo para superar el control.

**Validación ejecutada.**
- `npm.cmd run test:sandbox`: 18 correctas (antes 13).
- `npm.cmd run lint -- --quiet`: sin errores.
- `node tools/sandbox-verificar.js --ayuda`: código 0, incluye la opción nueva.
- `npm.cmd run sandbox:verificar -- --proveedor culqi --entorno`: código 1 esperado porque no existe `.env.sandbox`; mensaje sin secretos y sin conexiones.
- `git diff --check`: correcto.

**Límites y estado.** Se revisaron herramientas y documentación; no se modificó la aplicación, se conectó a bases, se arrancaron servicios ni se ejecutaron pagos o mensajes. No se repitieron compilación o e2e porque el cambio se verifica con las pruebas de esta herramienta. La comprobación es una lectura puntual: debe repetirse si se cambia el terminal, archivo o entorno. No sustituye las pruebas oficiales ni demuestra que una cuenta externa sea sandbox. Esas pruebas siguen pendientes de credenciales y cuentas de prueba. Cambios anteriores conservados; sin commits ni publicación.

## Continuación: errores de carga en páginas administrativas

**Causa verificada.** Usuarios, Tipos y tarifas y Bitácora leían solamente `datos` de `useDatos`. Si fallaba la primera petición, el hook guardaba el error y terminaba la carga, pero `datos` seguía siendo null: la página mostraba «Cargando…» indefinidamente. Si fallaba un filtro con datos anteriores, tampoco informaba del fallo.

**Cambio.** `ErrorCarga` en `apps/web/src/components/panel/base.tsx` reutiliza los estilos de error y `BotonP`, anuncia el mensaje con `role="alert"` y permite reintentar. Mientras se ejecuta la petición, el botón está deshabilitado y muestra «Reintentando…». Las tres páginas consumen `error`, `cargando` y `recargar` y dan prioridad al error sobre la tabla o las tarjetas. No cambia `useDatos`, sus controles de concurrencia, contratos ni permisos.

**Pruebas de navegador.** Se usó una base aleatoria nueva, API local aislada y Next.js en 4100/3100. El administrador inició sesión y cambió la contraseña temporal mediante el flujo real. Playwright interceptó únicamente las peticiones de lectura seleccionadas para devolver un HTTP 500 controlado; al quitar esa interceptación, el reintento consultó la API real y sus datos ficticios. Las tres páginas mostraron una alerta, ningún indicador «Cargando…» y recuperaron su contenido sin recargar la página. Se repitieron las tres recuperaciones a 390 px, sin desbordes horizontales. Dos recorridos más amplios se interrumpieron al cerrarse el contexto de Playwright; se repitió la recuperación en una pestaña propia y solo se dan por aprobados los casos que devolvieron un resultado completo. No se afirma una nueva auditoría axe-core de estos estados.

**Comandos.** `npm.cmd run lint -- --quiet` sin errores; `npm.cmd run tipos -w @marea/web` correcto; `npm.cmd run build -w @marea/web` correcto, 25 páginas; `git diff --check` correcto. No se repitieron unitarias o e2e del backend para este cambio de presentación.

**Datos y limpieza.** El preparador creó e inicializó únicamente la base temporal; los únicos cambios de datos de la revisión fueron el acceso y cambio de contraseña del administrador ficticio. API cerrada y base propia eliminada por el manejador de limpieza. Consulta READ ONLY a `pg_database`: cero bases temporales restantes. Servidor Next.js cerrado y puertos de revisión sin listeners; script temporal y artefactos de Playwright retirados. Sin modificación de bases existentes, proveedores externos, mensajes reales, commits ni publicación. Cambios anteriores conservados.
