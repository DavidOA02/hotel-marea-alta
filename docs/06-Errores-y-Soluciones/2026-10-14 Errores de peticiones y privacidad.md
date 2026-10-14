# Errores de peticiones y privacidad

## Defectos verificados

El filtro global no reconocía `entity.too.large`, el error del parser para
cuerpos que superan el límite. Se respondía 500 en lugar de 413.

Los avisos de errores PostgreSQL de formato incluían `e.message`. Ese mensaje
puede contener el valor enviado por el cliente, incluidos datos personales.

## Corrección

- Los cuerpos demasiado grandes reciben 413 con `{ mensaje, campo }.
- Los errores SQL de formato conservan 400 y registran únicamente el código
  SQLSTATE, sin el mensaje ni los valores de entrada.
- Se mantienen los mensajes de negocio y los conflictos de reservas,
  unicidad, serialización y deadlock.

## Validación

- `npm.cmd run test -w @marea/api -- --runInBand`: 75 pruebas aprobadas en
  11 suites. Las 13 nuevas pruebas cubren errores del parser, privacidad
  de avisos SQL, conflictos, errores de negocio, rutas y errores internos.
- `npm.cmd run build -w @marea/api`: aprobado.
- `npx.cmd eslint apps/api/src/comun/errores.ts apps/api/src/comun/errores.spec.ts`:
  aprobado sin advertencias.

Las pruebas invocan el filtro con errores simulados; no prueban el parser
mediante HTTP. No se conectó a bases ni se ejecutaron E2E, proveedores,
correos o despliegues. No se cambiaron límites de tamaño ni reglas de negocio.

## Alcance pendiente

Esta corrección protege los avisos SQL de formato del filtro. No constituye
una depuración completa de todos los registros: los errores inesperados
siguen registrando su stack y otros servicios mantienen sus propios logs.
La revisión de certificados PostgreSQL sigue pendiente.
