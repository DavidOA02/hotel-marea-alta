# Límite de memoria del control de solicitudes

## Defecto confirmado

`apps/api/src/comun/limite.guard.ts` eliminaba ventanas vencidas al alcanzar
10 000 entradas, pero seguía admitiendo entradas nuevas si todas estaban activas.
Por ello, numerosas IP distintas podían aumentar la memoria sin límite.

## Corrección

- Se limita el mapa a 10 000 ventanas por proceso.
- Al saturarse, las solicitudes de claves nuevas reciben el mismo error 429
  existente. Se conservan los contadores activos para evitar reiniciar límites.
- Las ventanas vencen exactamente al alcanzar su instante final.
- Las solicitudes rechazadas no incrementan indefinidamente el contador.

No se modificaron contratos públicos, roles, datos, esquema ni dependencias.

## Validación

- `npm.cmd test`: 40 pruebas compartidas, 52 de API y 16 de aislamiento aprobadas
  antes del cambio.
- `npm.cmd run test -w @marea/api -- --runInBand`: 54 pruebas aprobadas tras
  el cambio, incluidas saturación, conservación de contadores y recuperación.
- `npm.cmd run test:sandbox`: 18 pruebas aprobadas sin red ni PostgreSQL.
- `npm.cmd run build -w @marea/shared`: aprobado.
- `npm.cmd run build -w @marea/api`: aprobado.
- `npm.cmd run tipos -w @marea/web`: aprobado.
- Lint general inicial: ningún error y 22 advertencias existentes de frontend.

## Limitaciones

El control sigue siendo local a cada proceso; no coordina varias instancias.
Durante la saturación, IP nuevas reciben 429 hasta que haya capacidad disponible.
No se ejecutaron E2E contra PostgreSQL, pruebas de proveedores reales ni pruebas
de navegador. No se conectó a bases de datos ni se realizaron acciones de Git
de publicación o despliegues. Los cambios previos del usuario se conservaron.

## Seguimiento: coste de limpieza bajo saturación

La primera corrección recorría hasta 10 000 entradas por cada IP nueva
rechazada, incluso sin ventanas vencidas. Se conserva ahora el próximo
vencimiento para omitir esos recorridos hasta que pueda liberarse capacidad.
Al limpiar se calcula el siguiente vencimiento entre las ventanas activas;
las nuevas ventanas también actualizan ese instante.

Dos pruebas adicionales verifican que 100 rechazos consecutivos no recorren
el mapa y que los vencimientos escalonados recuperen capacidad sin reiniciar
contadores de ventanas todavía activas. No se midió rendimiento mediante
benchmark; se verificó la ausencia de recorridos innecesarios.

- `npm.cmd run test -w @marea/api -- --runInBand`: 77 pruebas aprobadas
  en 11 suites tras este seguimiento.
- `npm.cmd run build -w @marea/api`: aprobado.
- `npx.cmd eslint apps/api/src/comun/limite.guard.ts apps/api/src/comun/limite.guard.spec.ts`:
  aprobado sin advertencias.

Se mantienen el límite de 10 000 ventanas por proceso, la respuesta 429
durante la saturación y las limitaciones de despliegues con varias instancias.
