import * as fs from 'fs';
import * as path from 'path';
import { cargarEnv } from './env';

jest.mock('fs', () => ({ existsSync: jest.fn(), readFileSync: jest.fn() }));

describe('Archivo de configuración de la API', () => {
  const nombres = ['API_ENV_ARCHIVO', 'PRUEBA_ENV'];
  let anterior: Record<string, string | undefined>;
  beforeEach(() => {
    anterior = Object.fromEntries(nombres.map(n => [n, process.env[n]]));
    nombres.forEach(n => delete process.env[n]);
    jest.clearAllMocks();
    jest.mocked(fs.existsSync).mockReturnValue(true);
    jest.mocked(fs.readFileSync).mockReturnValue('PRUEBA_ENV=sandbox');
  });
  afterEach(() => {
    nombres.forEach(n => { if (anterior[n] === undefined) delete process.env[n]; else process.env[n] = anterior[n]; });
  });

  it('carga solo el archivo sandbox seleccionado, sin consultar el .env habitual', () => {
    process.env.API_ENV_ARCHIVO = 'apps/api/.env.sandbox';
    cargarEnv();
    expect(fs.readFileSync).toHaveBeenCalledTimes(1);
    expect(fs.readFileSync).toHaveBeenCalledWith(path.resolve('apps/api/.env.sandbox'), 'utf8');
    expect(process.env.PRUEBA_ENV).toBe('sandbox');
  });
  it('detiene el arranque si el archivo seleccionado no existe', () => {
    process.env.API_ENV_ARCHIVO = 'apps/api/.env.sandbox';
    jest.mocked(fs.existsSync).mockReturnValue(false);
    expect(() => cargarEnv()).toThrow('API_ENV_ARCHIVO');
    expect(fs.readFileSync).not.toHaveBeenCalled();
  });
  it('conserva la prioridad de las variables del sistema', () => {
    process.env.PRUEBA_ENV = 'sistema';
    cargarEnv();
    expect(process.env.PRUEBA_ENV).toBe('sistema');
  });
  it('permite el arranque sin .env cuando no se seleccionó un archivo explícito', () => {
    jest.mocked(fs.existsSync).mockReturnValue(false);
    expect(() => cargarEnv()).not.toThrow();
  });
});
