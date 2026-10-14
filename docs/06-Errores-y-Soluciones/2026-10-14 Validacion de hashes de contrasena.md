# Validación de hashes de contraseña

## Causa y alcance

`verificarClave` aceptaba la cantidad de iteraciones y la longitud del hash
almacenado como parámetros de PBKDF2 sin validar su formato. Un registro
corrupto podía lanzar una excepción durante el ingreso; iteraciones alteradas
podían aumentar el coste síncrono del cálculo. Se reprodujo que Base64 inválido
decodifica a cero bytes y que PBKDF2 con longitud cero falla en Node 24.19.0.
No se encontró ni se modificó un registro real corrupto; no se afirma que un
visitante pueda cambiar hashes de usuarios mediante los endpoints existentes.

## Cambio

Antes de calcular, se exige el formato que generan el servicio y el esquema:
cuatro campos, PBKDF2-SHA256, 100 000 iteraciones, sal de 16 bytes y hash de
32 bytes en Base64 canónico. Registros inválidos devuelven false. Se limita
también el tamaño del texto antes de dividirlo. Los hashes válidos conservan
su comprobación con timingSafeEqual y no requieren migración.

Si en el futuro se introduce otro formato o coste, debe ampliarse esta
validación junto con su estrategia de actualización; hoy solo se admite el
formato verificado del repositorio.

## Verificación

- `npm.cmd test`: 147 pruebas aprobadas (40 shared, 91 API, 16 aislamiento).
  Incluye 14 nuevas pruebas de formatos inválidos y compatibilidad con los
  hashes iniciales del esquema, usando únicamente sus credenciales ficticias.
- El primer test paralelo avisó de un worker que no cerró correctamente.
  `npm.cmd run test -w @marea/api -- --runInBand --detectOpenHandles` aprobó
  las 91 pruebas, terminó correctamente y no informó recursos abiertos.
  El aviso inicial no se reprodujo; no se atribuye una causa sin evidencia.
- `npm.cmd run build`: aprobado para shared, API y web; 25 páginas generadas.
- `npx.cmd eslint apps/api/src/auth/claves.ts apps/api/src/auth/claves.spec.ts`:
  aprobado sin advertencias.

No se ejecutaron E2E, navegadores ni proveedores reales. No se conectó a bases,
se modificaron usuarios, se añadieron dependencias ni se publicaron cambios.
La revisión priorizó autenticación; no constituye una auditoría exhaustiva
de todas las funcionalidades, rendimiento o accesibilidad.

## Pendientes conservados

Validación oficial de proveedores sandbox, certificados PostgreSQL y revisión
de logs de otros servicios. También se identificó para una revisión posterior
que descargarCsv escapa comillas, pero no neutraliza fórmulas en texto recibido
de usuarios; no se modificó el exportador en este cambio.
