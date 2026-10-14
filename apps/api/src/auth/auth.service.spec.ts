import { JwtService } from '@nestjs/jwt';
import { Bitacora } from '../auditoria/bitacora.service';
import { Db } from '../db/db.service';
import { AuthService, UsuarioBd } from './auth.service';
import { selloUsuario } from './claves';

describe('Separación de tokens de acceso y renovación', () => {
  const jwt = new JwtService();
  const secreto = 'secreto-ficticio-exclusivo-de-pruebas';
  const usuario = { id: 1, nombre: 'Prueba', email: 'prueba@example.test', rol: 'Recepcionista', activo: true, claveHash: 'hash-ficticio' } as UsuarioBd;
  const variables = ['NODE_ENV', 'JWT_SECRETO', 'JWT_SECRETO_RENOVACION'];
  let anteriores: (string | undefined)[];
  let auth: AuthService;
  let uno: jest.Mock;
  const firmar = (extra: Record<string, unknown> = {}) => jwt.sign(
    { sub: usuario.id, sello: selloUsuario(usuario), ...extra }, { secret: secreto, expiresIn: 3600 });

  beforeEach(() => {
    anteriores = variables.map(v => process.env[v]);
    process.env.NODE_ENV = 'test';
    process.env.JWT_SECRETO = secreto;
    process.env.JWT_SECRETO_RENOVACION = secreto;
    uno = jest.fn().mockResolvedValue(usuario);
    auth = new AuthService({ uno } as unknown as Db, jwt, {} as Bitacora);
  });
  afterEach(() => {
    variables.forEach((v, i) => {
      if (anteriores[i] === undefined) delete process.env[v];
      else process.env[v] = anteriores[i];
    });
  });

  it('acepta acceso válido y emite tokens al renovar', async () => {
    await expect(auth.validarAcceso(firmar())).resolves.toMatchObject({ id: 1, rol: usuario.rol });
    const sesion = await auth.renovar(firmar({ tipo: 'renovacion' }));
    expect(jwt.verify(sesion.refreshToken, { secret: secreto }).tipo).toBe('renovacion');
    await expect(auth.validarAcceso(sesion.accessToken)).resolves.toMatchObject({ id: 1 });
  });

  it('rechaza renovación como acceso incluso con secretos iguales, antes de consultar la base', async () => {
    await expect(auth.validarAcceso(firmar({ tipo: 'renovacion' }))).rejects.toMatchObject({ status: 401 });
    expect(uno).not.toHaveBeenCalled();
  });

  it('rechaza acceso como renovación antes de consultar la base', async () => {
    await expect(auth.renovar(firmar())).rejects.toMatchObject({ status: 401 });
    expect(uno).not.toHaveBeenCalled();
  });

  it.each([{ sub: '1' }, { sub: -1 }, { sub: 1.5 }, { sello: null }])('rechaza claims inválidos: %j', async extra => {
    await expect(auth.validarAcceso(firmar(extra))).rejects.toMatchObject({ status: 401 });
    await expect(auth.renovar(firmar({ ...extra, tipo: 'renovacion' }))).rejects.toMatchObject({ status: 401 });
    expect(uno).not.toHaveBeenCalled();
  });

  it('preserva la invalidación por sello o usuario inactivo', async () => {
    await expect(auth.validarAcceso(firmar({ sello: 'anterior' }))).rejects.toMatchObject({ status: 401 });
    uno.mockResolvedValue({ ...usuario, activo: false });
    await expect(auth.renovar(firmar({ tipo: 'renovacion' }))).rejects.toMatchObject({ status: 401 });
  });
});
