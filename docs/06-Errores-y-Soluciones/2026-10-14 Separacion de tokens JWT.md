# Separación de tokens JWT

## Causa verificada

`AuthService.validarAcceso` verificaba firma y sello del usuario, pero no
rechazaba tokens de renovación. Si `JWT_SECRETO` y
`JWT_SECRETO_RENOVACION` coincidían, un token de renovación válido durante
12 horas podía usarse directamente como acceso, cuya duración prevista es
una hora. La reproducción usa JWT reales y una base simulada.

## Cambio

Antes de consultar la base, se verifica que el identificador sea un entero
positivo seguro y que el sello sea una cadena. El acceso rechaza tokens con
`tipo`; la renovación exige `tipo: 'renovacion'`. Los tokens que emite el
servicio mantienen su formato. Siguen comprobándose usuario activo, roles
vigentes y sello para invalidar sesiones anteriores.

## Validación

- `npm.cmd run test -w @marea/api -- --runInBand`: 62 pruebas aprobadas en
  10 suites, incluidas ocho nuevas pruebas de autenticación.
- `npm.cmd run build -w @marea/api`: aprobado.
- `npm.cmd run build -w @marea/web`: aprobado; 25 páginas generadas.
- `npx.cmd eslint apps/api/src/auth/auth.service.ts apps/api/src/auth/auth.service.spec.ts`:
  aprobado sin advertencias.
- `git diff --check`: aprobado antes de añadir este registro.

No se ejecutaron pruebas E2E ni se conectó a PostgreSQL. No se cambiaron
secretos, datos, dependencias, contratos públicos o configuración de producción.
Los secretos JWT de producción deben seguir siendo aleatorios e independientes.

## Hallazgo pendiente

La configuración de PostgreSQL usa `rejectUnauthorized: false` cuando
`PGSSL=true`. Cambiarla requiere revisar la cadena de confianza y los
certificados del servidor para evitar interrumpir conexiones existentes;
no se modificó ni se probó contra un servidor real en esta revisión.
