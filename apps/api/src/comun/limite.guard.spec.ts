import { ExecutionContext, HttpException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { LimiteGuard } from './limite.guard';

describe('Límite por IP (sin servicios externos)', () => {
  const handler = function login() {};
  const controlador = class AuthController {};
  const ctx = (ip: string) => ({
    getHandler: () => handler,
    getClass: () => controlador,
    switchToHttp: () => ({ getRequest: () => ({ ip }) }),
  }) as unknown as ExecutionContext;
  let guard: LimiteGuard;
  const original = process.env.SIN_LIMITES;

  beforeEach(() => {
    delete process.env.SIN_LIMITES;
    jest.spyOn(Date, 'now').mockReturnValue(1000);
    const reflector = new Reflector();
    jest.spyOn(reflector, 'get').mockReturnValue({ max: 2, ventanaMs: 60_000 });
    guard = new LimiteGuard(reflector);
  });
  afterEach(() => {
    jest.restoreAllMocks();
    if (original === undefined) delete process.env.SIN_LIMITES;
    else process.env.SIN_LIMITES = original;
  });

  const esperar429 = (ip: string) => {
    try {
      guard.canActivate(ctx(ip));
      throw new Error('La solicitud debería rechazarse');
    } catch (error) {
      expect(error).toBeInstanceOf(HttpException);
      expect((error as HttpException).getStatus()).toBe(429);
    }
  };

  it('aplica el límite por IP y reinicia en el instante de vencimiento', () => {
    expect(guard.canActivate(ctx('a'))).toBe(true);
    expect(guard.canActivate(ctx('a'))).toBe(true);
    esperar429('a');
    expect(guard.canActivate(ctx('b'))).toBe(true);
    jest.mocked(Date.now).mockReturnValue(61_000);
    expect(guard.canActivate(ctx('a'))).toBe(true);
  });

  it('rechaza nuevas IP al saturarse sin perder los contadores activos y recupera capacidad al vencer', () => {
    for (let i = 0; i < 10_000; i++) guard.canActivate(ctx(`ip-${i}`));
    for (let i = 0; i < 20; i++) esperar429(`extra-${i}`);
    expect(guard.canActivate(ctx('ip-0'))).toBe(true);
    esperar429('ip-0');
    jest.mocked(Date.now).mockReturnValue(61_000);
    expect(guard.canActivate(ctx('extra-0'))).toBe(true);
    expect(guard.canActivate(ctx('ip-0'))).toBe(true);
  });

  it('evita recorrer el mapa en cada rechazo mientras no haya vencimientos', () => {
    for (let i = 0; i < 10_000; i++) guard.canActivate(ctx(`ip-${i}`));
    const recorrer = jest.spyOn(Map.prototype, Symbol.iterator);
    for (let i = 0; i < 100; i++) esperar429(`extra-${i}`);
    expect(recorrer).not.toHaveBeenCalled();
    jest.mocked(Date.now).mockReturnValue(61_000);
    expect(guard.canActivate(ctx('nueva'))).toBe(true);
    expect(recorrer).toHaveBeenCalledTimes(1);
  });

  it('recupera capacidad con vencimientos escalonados sin borrar ventanas aún activas', () => {
    guard.canActivate(ctx('temprana'));
    jest.mocked(Date.now).mockReturnValue(2000);
    for (let i = 1; i < 10_000; i++) guard.canActivate(ctx(`ip-${i}`));
    jest.mocked(Date.now).mockReturnValue(61_000);
    expect(guard.canActivate(ctx('nueva'))).toBe(true);
    const recorrer = jest.spyOn(Map.prototype, Symbol.iterator);
    esperar429('otra');
    expect(recorrer).not.toHaveBeenCalled();
    expect(guard.canActivate(ctx('ip-1'))).toBe(true);
    esperar429('ip-1');
    jest.mocked(Date.now).mockReturnValue(62_000);
    expect(guard.canActivate(ctx('otra'))).toBe(true);
    expect(recorrer).toHaveBeenCalledTimes(1);
    expect(guard.canActivate(ctx('nueva'))).toBe(true);
    esperar429('nueva');
  });
});
