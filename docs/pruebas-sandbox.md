# Pruebas con los proveedores

El proyecto cuenta con contratos simulados. Una revisión de variables no valida la autenticación, los permisos del comercio ni una integración completa. Esta guía permite preparar pruebas reales en las cuentas de prueba de cada proveedor, con una base separada y correo desactivado.

## Preparación local

Desde la raíz del repositorio, copiar el ejemplo sin sobrescribir otro archivo ya completado:

```powershell
if (Test-Path apps/api/.env.sandbox) { throw 'Ya existe .env.sandbox; conservarlo y revisarlo.' }
Copy-Item -LiteralPath apps/api/.env.sandbox.ejemplo -Destination apps/api/.env.sandbox
```

Completar `PGPASSWORD`, dos secretos JWT locales independientes y las variables del proveedor elegido en ese archivo. Mantener `PGDATABASE=hotel_marea_alta_sandbox`, `NODE_ENV=development`, `PROCESOS_EN_SEGUNDO_PLANO=false`, `CORREOS_PROGRAMADOS=false` y las variables SMTP vacías. Las credenciales completadas deben quedar fuera de Git y del chat.

Crear una base nueva con PostgreSQL, ajustando host, puerto y usuario a los del archivo. Estos comandos piden la contraseña; no contienen tokens ni contraseñas. Si la base ya existe, no borrarla: revisar primero qué contiene. No usar `npm run db` ni `db:demo` para este procedimiento: esos scripts leen el `.env` habitual y recrean su base.

```powershell
createdb -h localhost -p 5432 -U postgres -W hotel_marea_alta_sandbox
psql -h localhost -p 5432 -U postgres -W -d hotel_marea_alta_sandbox -v ON_ERROR_STOP=1 -f database/01_esquema.sql
psql -h localhost -p 5432 -U postgres -W -d hotel_marea_alta_sandbox -v ON_ERROR_STOP=1 -f database/03_mejoras.sql
```

`01_esquema.sql` recrea las tablas de la base seleccionada. Ejecutarlo exclusivamente en la base sandbox recién creada. No cargar reservas, huéspedes ni tarjetas reales.

Elegir **un proveedor externo por ejecución**: para Culqi, Mercado Pago o Niubiz, usar `FACTURACION=simulado`; para Nubefact DEMO, usar `PASARELA=simulada`. El verificador exige esa separación.

```powershell
node tools/sandbox-verificar.js --proveedor culqi
# Cambiar culqi por mercadopago, niubiz o nubefact.
# Archivo alternativo: añadir --archivo ruta/al/archivo.sandbox
```

El comando lee el archivo indicado (por defecto `apps/api/.env.sandbox`), comprueba barreras de entorno y muestra los nombres de variables faltantes. Sale con código 1 si falta configuración o se detecta un entorno incompatible. No hace HTTP, no comprueba PostgreSQL, no autentica y no genera movimientos.

La API conserva la prioridad de las variables del sistema sobre las del archivo. Por defecto el verificador revisa únicamente el archivo. Antes de arrancar, usar `--entorno` en **el mismo terminal** para rechazar variables heredadas relevantes que difieran del archivo o estén ausentes en él (base, credenciales, SMTP, SSH, proveedores, procesos y configuración de la API). Los mensajes identifican las variables, sin mostrar sus valores. `API_ENV_ARCHIVO` debe seleccionar el archivo revisado. Eliminar del terminal las variables indicadas o hacerlas coincidir con la configuración sandbox; no copiar credenciales de producción al archivo para superar el control. Volver a verificar si se cambia de terminal o configuración.

Arrancar la API con selección explícita del archivo sandbox y verificación del entorno antes del arranque:

```powershell
$env:API_ENV_ARCHIVO = (Resolve-Path apps/api/.env.sandbox).Path
npm.cmd run sandbox:verificar -- --proveedor culqi --entorno
if ($LASTEXITCODE -ne 0) { throw 'Configuración sandbox incompatible; no iniciar la API.' }
# Cambiar culqi por el proveedor elegido. Si usas otro archivo, añadir --archivo.
npm.cmd run build -w @marea/shared
npm.cmd run dev -w @marea/api
# Al terminar con Ctrl+C:
Remove-Item Env:API_ENV_ARCHIVO
```

Esta comprobación compara valores literales y no cambia el entorno ni arranca servicios. No demuestra que una cuenta externa sea de prueba, ni inspecciona las credenciales del panel del proveedor. Mantener las confirmaciones y las pruebas reales de las secciones siguientes.

En otro terminal, iniciar la web con `npm.cmd run dev -w @marea/web`. Comprobar que `NEXT_PUBLIC_API_URL` apunta a esta API (`http://localhost:4000/api` para los puertos del ejemplo), y que no hay otra API ocupando el puerto. Para retornos o webhooks públicos, publicar mediante HTTPS solo esta instancia sandbox y ajustar `WEB_URL`, `API_URL_PUBLICA` (con `/api`) y `CORS_ORIGENES`. No exponer la base normal.

Entrar al panel con el administrador de la base nueva, cambiar su contraseña inicial y crear reservas con huéspedes ficticios y fechas futuras. Las acciones explícitas de pago y emisión sí llaman al proveedor elegido; tener procesos automáticos apagados no las desactiva. Los correos se guardan sin envío SMTP. Los estados pendientes deben consultarse manualmente desde la ficha.

## Culqi

Configurar `PASARELA=culqi`, `CULQI_LLAVE_PUBLICA=pk_test_…` y `CULQI_LLAVE_SECRETA=sk_test_…` con las llaves del mismo comercio de pruebas. El verificador bloquea las llaves `live`. Culqi distingue integración y producción mediante las llaves; usar sus [tarjetas de prueba oficiales](https://docs.culqi.com/es/documentacion/pagos-online/tarjetas-de-prueba/) y el correo indicado allí para 3-D Secure. Los detalles de llaves y devoluciones están en su [API oficial](https://apidocs.culqi.com/).

1. Crear una reserva, abrir su enlace de pago y pagar con una tarjeta de aprobación. Verificar en el panel y en Culqi un solo cargo, el mismo monto y moneda PEN, pago aprobado y saldo actualizado.
2. Repetir con una tarjeta de rechazo y con los casos 3-D Secure exitoso/fallido. Un rechazo o autenticación fallida no debe generar un pago aprobado. Recargar el retorno no debe duplicar el pago.
3. Sobre otro cargo de prueba aprobado, devolver parcialmente desde la ficha; comprobar referencia y monto tanto en Culqi como en el sistema. Devolver el remanente y verificar el acumulado. No reutilizar un cargo ya agotado.

## Mercado Pago

Configurar `PASARELA=mercadopago`, `MP_ACCESS_TOKEN`, `MP_WEBHOOK_SECRETO`, `API_URL_PUBLICA` y `WEB_URL` HTTPS. El secreto de webhook debe corresponder a la aplicación de prueba y su URL a `/api/webhooks/mercadopago`.

El verificador acepta `TEST-…`. En Checkout Pro, Mercado Pago también entrega tokens `APP_USR-…` a vendedores de prueba; ese prefijo por sí solo no distingue una cuenta real. Para ese caso, comprobar la cuenta en el panel y establecer `MP_CUENTA_PRUEBA_CONFIRMADA=true`. Se trata de una declaración local, no de autenticación. Crear comprador y vendedor ficticios del mismo país según la [guía oficial de cuentas de prueba](https://www.mercadopago.com.pe/developers/es/docs/checkout-pro-preferences/test-accounts).

1. Crear una reserva y abrir Checkout Pro con el comprador de prueba. Verificar aprobación, rechazo y pendiente con los medios de prueba documentados por Mercado Pago.
2. Confirmar que el retorno y el webhook firmado dejan un solo pago, moneda/monto correctos y el saldo correspondiente. Repetir el aviso y comprobar que no se duplica. Un aviso con firma inválida debe rechazarse.
3. Devolver parte de un pago aprobado; verificar el mismo identificador y monto en el proveedor y en la reserva. Si queda pendiente, consultar desde la ficha. Reintentar no debe crear una segunda devolución.

## Niubiz

Configurar `PASARELA=niubiz`, `NIUBIZ_COMERCIO`, `NIUBIZ_USUARIO`, `NIUBIZ_CLAVE` y `HOTEL_RUC` del comercio sandbox, con `NIUBIZ_PRODUCCION=false`. Solicitar a Niubiz los casos de prueba y permisos de devolución de ese comercio. El verificador exige estos hosts:

```dotenv
NIUBIZ_DEVOLUCIONES_URL=https://apisandbox.vnforappstest.com
NIUBIZ_CONSULTA_DEVOLUCIONES_URL=https://apitestenv.vnforapps.com
```

La sesión y autorización del adaptador usan sandbox con `NIUBIZ_PRODUCCION=false`. No se puede deducir de una contraseña que tenga los permisos requeridos. Revisar con el proveedor los campos antifraude configurados para ese comercio.

1. Crear una reserva y pagar con los datos de prueba entregados por Niubiz. Probar autorización aprobada y rechazada; comprobar número de transacción, PEN, monto, pago y saldo. El retorno debe llegar a esta API sandbox.
2. Obtener una **venta de prueba liquidada** apta para devolver. Solicitar una devolución parcial desde la ficha. El código de registro debe quedar pendiente; consultar manualmente hasta obtener su resultado. Solo una respuesta exitosa debe descontar el monto pagado.
3. Probar rechazo y consulta pendiente con los casos habilitados por Niubiz. Si se pierde la respuesta de registro, obtener el código desde Niubiz y usar «Conciliar»: deben coincidir transacción y monto. No repetir manualmente un registro cuyo resultado se desconoce.

Contratos de referencia: [registro individual](https://desarrolladores.niubiz.com.pe/docs/api-de-registro-individual-copy) y [consulta de devoluciones](https://desarrolladores.niubiz.com.pe/docs/api-de-consulta-devolución-copy).

## Nubefact DEMO

Configurar `FACTURACION=nubefact`, `PASARELA=simulada`, `NUBEFACT_RUTA`, `NUBEFACT_TOKEN` y `HOTEL_RUC` de la cuenta DEMO. Confirmar en el panel o con soporte que la cuenta sea DEMO antes de establecer `NUBEFACT_CUENTA_DEMO_CONFIRMADA=true`. Esa variable es una confirmación del operador usada solo por el verificador: no convierte una cuenta real en DEMO. El host de API no acredita el entorno.

Registrar seis series distintas en esa cuenta y configurarlas: boleta, factura, notas de crédito de ambas y notas de débito de ambas. Verificar también el siguiente correlativo disponible: reiniciar la base local no reinicia la numeración del proveedor. La [documentación oficial de integración](https://www.nubefact.com/integracion) contiene el manual JSON de facturas, boletas y notas.

1. Crear una reserva y un pago simulado. Emitir una boleta y, en otra reserva con RUC válido de prueba, una factura. Consultar las pendientes desde el panel; comparar totales, IGV, estado y enlaces PDF/XML/CDR contra Nubefact DEMO.
2. Registrar consumos antes de emitir y comprobar sus líneas y cantidades. Probar hospedaje nacional gravado y el caso mixto de hospedaje de exportación con consumos gravados; confirmar su tratamiento y aceptación con Nubefact antes de producción.
3. Crear una nota de crédito parcial y una nota de débito con su motivo, sustento y referencia original. Verificar series, correlativos, IGV y nuevo saldo. Usar otra reserva para una nota de crédito total sin notas de débito vigentes.
4. Probar un rechazo controlado y una consulta/reintento del mismo documento. Comprobar que no se crean correlativos duplicados ni cargos adicionales locales si la nota de débito es rechazada.

## Evidencia de cada prueba

Guardar fuera del archivo de credenciales una tabla con fecha, proveedor, caso, código de reserva, identificador del proveedor/documento, monto, estado esperado/obtenido y resultado. No guardar tokens, contraseñas, números completos de tarjeta ni datos reales de huéspedes. Una prueba pasa al contrastar el sistema con el panel/API del proveedor, no solo por recibir HTTP 200 ni por superar el verificador local.

Para verificar las barreras de esta herramienta sin credenciales ni red:

```powershell
node --test tools/sandbox-verificar.test.js
```
