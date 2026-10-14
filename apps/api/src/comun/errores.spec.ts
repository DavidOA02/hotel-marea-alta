import { ArgumentsHost, HttpException, Logger } from '@nestjs/common';
import { falla, FiltroErrores } from './errores';

describe('Filtro global de errores (sin PostgreSQL)', () => {
  let filtro: FiltroErrores;
  let status: jest.Mock;
  let json: jest.Mock;
  let host: ArgumentsHost;
  let warn: jest.SpyInstance;
  let error: jest.SpyInstance;

  beforeEach(() => {
    filtro = new FiltroErrores();
    json = jest.fn();
    status = jest.fn().mockReturnValue({ json });
    host = { switchToHttp: () => ({ getResponse: () => ({ status }) }) } as unknown as ArgumentsHost;
    warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    error = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => jest.restoreAllMocks());

  it.each([
    ['entity.parse.failed', 400, 'El cuerpo de la petición no es un JSON válido.'],
    ['entity.too.large', 413, 'El cuerpo de la petición es demasiado grande.'],
  ])('traduce %s sin registrar el cuerpo recibido', (type, codigo, mensaje) => {
    filtro.catch({ type, message: 'contenido privado ficticio', body: 'contenido privado ficticio' }, host);
    expect(status).toHaveBeenCalledWith(codigo);
    expect(json).toHaveBeenCalledWith({ mensaje, campo: null });
    expect(error).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
  });

  it.each(['22P02', '22003', '22007', '22008'])('no registra datos recibidos al rechazar formato SQL %s', code => {
    filtro.catch({ code, message: 'invalid input: documento-ficticio', detail: 'documento-ficticio' }, host);
    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith({ mensaje: expect.any(String), campo: null });
    expect(warn).toHaveBeenCalledWith(`Dato rechazado por PostgreSQL (${code}).`);
    expect(error).not.toHaveBeenCalled();
  });

  it.each(['23P01', '23505', '40001', '40P01'])('preserva el conflicto SQL %s', code => {
    filtro.catch({ code }, host);
    expect(status).toHaveBeenCalledWith(409);
    expect(json).toHaveBeenCalledWith({ mensaje: expect.any(String), campo: code === '23P01' ? 'fechaEntrada' : null });
  });

  it('preserva mensaje y campo de los errores de negocio', () => {
    filtro.catch(falla(400, 'Fecha no válida.', 'fechaEntrada'), host);
    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith({ mensaje: 'Fecha no válida.', campo: 'fechaEntrada' });
  });

  it('traduce errores 404 de rutas sin reflejar la URL', () => {
    filtro.catch(new HttpException({ message: 'Cannot GET /dato-ficticio' }, 404), host);
    expect(status).toHaveBeenCalledWith(404);
    expect(json).toHaveBeenCalledWith({ mensaje: 'No encontrado.', campo: null });
  });

  it('no expone detalles internos en la respuesta de un error inesperado', () => {
    filtro.catch(new Error('detalle interno ficticio'), host);
    expect(status).toHaveBeenCalledWith(500);
    expect(json).toHaveBeenCalledWith({ mensaje: 'Ocurrió un error en el servidor. Inténtalo más tarde.', campo: null });
    expect(error).toHaveBeenCalledTimes(1);
  });
});
