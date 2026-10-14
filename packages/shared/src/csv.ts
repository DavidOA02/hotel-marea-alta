type ValorCsv = string | number | null | undefined;

/** CSV para las descargas del panel: separador ; y textos protegidos contra fórmulas. */
export function serializarCsv(filas: readonly (readonly ValorCsv[])[]): string {
  return filas.map(fila => fila.map(valor => {
    let texto = String(valor ?? '');
    // Las comillas CSV no impiden que una hoja de cálculo interprete una fórmula.
    // Solo proteger cadenas: los importes numéricos negativos siguen siendo números.
    if (typeof valor === 'string' && (/^\s*[=+\-@]/u.test(texto) || /^[\t\r\n]/u.test(texto))) texto = "'" + texto;
    return `"${texto.replace(/"/g, '""')}"`;
  }).join(';')).join('\r\n');
}
