import { serializarCsv } from './index';

describe('CSV del panel', () => {
  it.each(['=1+1', '+1+1', '-1+1', '@SUM(A1)', '  =1+1', '\t=1+1', '\r=1+1', '\n=1+1', '\ttexto', '\ufeff=1+1'])('protege el texto %j contra interpretación como fórmula', texto => {
    expect(serializarCsv([[texto]])).toBe(`"'${texto}"`);
  });

  it('conserva importes numéricos y protege números recibidos como texto', () => {
    expect(serializarCsv([[-25.5, 0, 30, '-25.5', '+51999999999']]))
      .toBe('"-25.5";"0";"30";"\'-25.5";"\'+51999999999"');
  });

  it('mantiene texto normal, Unicode, vacíos y el formato existente', () => {
    expect(serializarCsv([['Nombre', 'Importe'], ['José', null], [undefined, '']]))
      .toBe('"Nombre";"Importe"\r\n"José";""\r\n"";""');
    expect(serializarCsv([])).toBe('');
  });

  it('escapa comillas, separadores y saltos sin permitir nuevas celdas', () => {
    expect(serializarCsv([['texto;=1+1', 'Dice "hola"\nsegunda línea', '=HYPERLINK("ejemplo")']]))
      .toBe('"texto;=1+1";"Dice ""hola""\nsegunda línea";"\'=HYPERLINK(""ejemplo"")"');
  });

  it('no modifica las filas originales', () => {
    const filas = Object.freeze([Object.freeze(['=1+1', -10])]);
    serializarCsv(filas);
    expect(filas[0]).toEqual(['=1+1', -10]);
  });
});
