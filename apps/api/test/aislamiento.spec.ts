import { Client } from 'pg';
import prepararBd, { comprobarBaseE2e, configuracionLocal, limpiarBd } from './preparar-bd';

jest.mock('pg', () => ({ Client: jest.fn() }));
jest.mock('../src/config/env', () => ({ cargarEnv: jest.fn() }));

describe('Aislamiento de las bases e2e (sin PostgreSQL)', () => {
  const original = process.env;
  const clientes: { cfg: { database: string }; connect: jest.Mock; query: jest.Mock; end: jest.Mock }[] = [];

  beforeEach(() => {
    process.env = { PGHOST: 'localhost', PGPORT: '5432', NODE_ENV: 'test', PGDATABASE: 'hotel_marea_alta_test' };
    clientes.length = 0;
    (Client as unknown as jest.Mock).mockImplementation((cfg: { database: string }) => {
      const cliente = { cfg, connect: jest.fn().mockResolvedValue(undefined), query: jest.fn().mockResolvedValue({ rows: [] }), end: jest.fn().mockResolvedValue(undefined) };
      clientes.push(cliente);
      return cliente;
    });
  });
  afterEach(async () => {
    await limpiarBd();
    process.env = original;
    jest.clearAllMocks();
  });

  it('crea una base nueva, transmite su nombre y solo elimina esa base al terminar', async () => {
    await prepararBd();
    const nombre = comprobarBaseE2e(process.env.MAREA_E2E_BD);
    expect(nombre).not.toBe('hotel_marea_alta_test');
    expect(process.env.PGDATABASE).toBe(nombre);
    expect(clientes[0].query.mock.calls).toEqual([[`CREATE DATABASE "${nombre}" ENCODING 'UTF8' TEMPLATE template0`]]);
    expect(clientes[1].cfg.database).toBe(nombre);
    expect(clientes[1].query).toHaveBeenCalledTimes(2);
    await limpiarBd();
    expect(clientes[2].query.mock.calls).toEqual([[`DROP DATABASE "${nombre}"`]]);
    await limpiarBd();
    expect(clientes).toHaveLength(3); // limpieza idempotente sin DROP de otras bases
    expect(clientes.every(c => c.end.mock.calls.length === 1)).toBe(true);
  });

  it('nunca borra una base si CREATE DATABASE falla, incluso por colisión de nombre', async () => {
    (Client as unknown as jest.Mock).mockImplementationOnce(() => ({
      connect: jest.fn().mockResolvedValue(undefined),
      query: jest.fn().mockRejectedValue(new Error('duplicate_database')),
      end: jest.fn().mockResolvedValue(undefined)
    }));
    await expect(prepararBd()).rejects.toThrow('duplicate_database');
    await limpiarBd();
    expect(Client).toHaveBeenCalledTimes(1);
    expect(process.env.PGDATABASE).toBe('hotel_marea_alta_test');
    expect(process.env.MAREA_E2E_BD).toBeUndefined();
  });

  it('limpia únicamente la base propia si falla la carga del esquema', async () => {
    const crearCliente = (Client as unknown as jest.Mock).getMockImplementation()!;
    (Client as unknown as jest.Mock).mockImplementation((cfg: { database: string }) => {
      const cliente = crearCliente(cfg);
      if (cfg.database !== 'postgres') cliente.query.mockRejectedValueOnce(new Error('esquema inválido'));
      return cliente;
    });
    await expect(prepararBd()).rejects.toThrow('esquema inválido');
    const nombre = clientes[1].cfg.database;
    expect(clientes[2].query.mock.calls).toEqual([[`DROP DATABASE "${nombre}"`]]);
    expect(process.env.PGDATABASE).toBe('hotel_marea_alta_test');
  });

  it.each([
    { PGHOST: 'servidor.example.test' }, { SSH_HOST: 'servidor.example.test' },
    { PGSSL: 'true' }, { NODE_ENV: 'production' }, { PGPORT: '0' }, { PGPORT: 'no-numero' }
  ])('rechaza una conexión insegura antes de abrirla: %j', async extra => {
    Object.assign(process.env, extra);
    await expect(prepararBd()).rejects.toThrow();
    expect(Client).not.toHaveBeenCalled();
  });

  it.each([undefined, 'hotel_marea_alta', 'hotel_marea_alta_test', 'hotel_marea_alta_e2e_x"; DROP DATABASE postgres;--'])(
    'rechaza un destino no generado: %s', nombre => {
      expect(() => comprobarBaseE2e(nombre)).toThrow();
    });

  it.each(['localhost', '127.0.0.1', '::1'])('acepta conexión local: %s', host => {
    expect(configuracionLocal({ PGHOST: host }).host).toBe(host);
  });
});
