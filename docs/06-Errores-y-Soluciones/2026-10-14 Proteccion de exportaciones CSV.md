# Protección de exportaciones CSV

## Problema confirmado

Todas las descargas del panel pasan por `descargarCsv`. Su serialización
escapaba comillas, pero no protegía texto que una hoja de cálculo puede
interpretar como fórmula. Los archivos contienen nombres, motivos y otros
campos de texto procedentes de usuarios.

## Cambio

La función pura `serializarCsv` del paquete compartido antepone un apóstrofo
a cadenas que comienzan con =, +, - o @, también tras espacios, o con
tabulación/retorno/salto de línea. Después aplica el escape CSV habitual.
Las comillas por sí solas no evitan la interpretación como fórmula.

Se conservan separador punto y coma, comillas, finales CRLF y el BOM UTF-8
que agrega la descarga. Los valores number, incluidos negativos, mantienen
su representación. El texto potencialmente peligroso puede mostrar un
apóstrofo en lectores CSV que no lo traten como marcador de texto; es un
cambio intencional del archivo exportado. Los datos originales no cambian.

## Validación

- `npm.cmd test`: 161 pruebas aprobadas (54 shared, 91 API, 16 aislamiento).
  Las 14 pruebas nuevas cubren fórmulas, espacios, controles, teléfonos con
  signo +, negativos numéricos, Unicode, comillas y saltos de línea.
- `npm.cmd run build`: aprobado para shared, API y web (25 páginas).
- ESLint sobre csv.ts, csv.test.ts, index.ts y base.tsx: ningún error;
  una advertencia existente de set-state-in-effect en useDatos.
- El test paralelo volvió a avisar de un worker de API sin cierre limpio.
  La ejecución anterior con --runInBand --detectOpenHandles terminó sin
  recursos abiertos; la causa del aviso paralelo sigue pendiente.

No se probó la importación en Excel/LibreOffice, la descarga en navegador ni
E2E contra PostgreSQL. La protección no garantiza conservar su efecto si
un tercero transforma o vuelve a exportar el archivo con otras reglas.
Sin operaciones de base de datos, dependencias nuevas, commits o publicación.

La mejora previa de validación de hashes permanece conservada sin commit.
