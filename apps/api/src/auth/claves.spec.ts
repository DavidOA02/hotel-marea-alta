import { hashClave, selloUsuario, verificarClave } from './claves';

describe('Contraseñas (PBKDF2-SHA256)', () => {
  it('verifica la contraseña correcta y rechaza otra', () => {
    const h = hashClave('Admin2026!');
    expect(h.startsWith('PBKDF2-SHA256$100000$')).toBe(true);
    expect(verificarClave('Admin2026!', h)).toBe(true);
    expect(verificarClave('admin2026!', h)).toBe(false);
  });
  it('usa sal aleatoria (dos hashes de la misma clave son distintos)', () => {
    expect(hashClave('x1234567')).not.toBe(hashClave('x1234567'));
  });
  it('rechaza formatos desconocidos sin lanzar error', () => {
    expect(verificarClave('a', 'texto-plano')).toBe(false);
  });
  it('el sello cambia si cambian clave, rol o estado', () => {
    const base = { claveHash: 'h', activo: true, rol: 'Recepcionista' };
    const s = selloUsuario(base);
    expect(selloUsuario({ ...base, activo: false })).not.toBe(s);
    expect(selloUsuario({ ...base, rol: 'Administrador' })).not.toBe(s);
    expect(selloUsuario({ ...base, claveHash: 'otro' })).not.toBe(s);
  });
});
