import { Devoluciones } from './devoluciones.service';

describe('Sondeo de devoluciones Niubiz', () => {
  it('consulta todos los pendientes persistentes y vuelve al inicio después de varios lotes', async () => {
    const pendientes = Array.from({ length: 135 }, (_, i) => ({ id: i + 1 }));
    const db = { query: jest.fn(async (sql: string, params: unknown[] = []) => {
      const cursor = /id\s*>\s*\$1/.test(sql) ? Number(params[0]) : 0;
      return pendientes.filter(d => d.id > cursor).slice(0, 50);
    }) };
    const servicio = new Devoluciones(db as never, undefined as never, undefined as never, undefined as never, undefined as never);
    const ejecutar = jest.spyOn(servicio as any, 'ejecutar').mockResolvedValue(undefined);
    const proceso = servicio as unknown as { consultarPendientes(): void; enCurso: Promise<void> | null };

    for (let ciclo = 0; ciclo < 4; ciclo++) {
      proceso.consultarPendientes();
      await proceso.enCurso;
    }

    const consultados = ejecutar.mock.calls.map(([id]) => id);
    expect(consultados.slice(0, 135)).toEqual(pendientes.map(d => d.id));
    expect(consultados.slice(135)).toEqual(pendientes.slice(0, 50).map(d => d.id));
    expect(consultados).toHaveLength(185);
  });
});
