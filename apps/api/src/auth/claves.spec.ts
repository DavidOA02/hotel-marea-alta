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
  it.each(['0', '-1', 'NaN', '1.5', '1000000000', '1e5', '0100000'])('rechaza iteraciones inválidas o no soportadas: %s', iter => {
    const sal = Buffer.alloc(16).toString('base64');
    const hash = Buffer.alloc(32).toString('base64');
    expect(verificarClave('a', `PBKDF2-SHA256$${iter}$${sal}$${hash}`)).toBe(false);
  });
  it.each([
    ['!!!!', '!!!!'],
    [Buffer.alloc(15).toString('base64'), Buffer.alloc(32).toString('base64')],
    [Buffer.alloc(16).toString('base64'), Buffer.alloc(31).toString('base64')],
    ['!'.repeat(24), '!'.repeat(44)],
    [Buffer.alloc(16).toString('base64'), Buffer.alloc(32).toString('base64').slice(0, -1) + '!'],
  ])('rechaza sal o hash malformados sin lanzar error: %j / %j', (sal, hash) => {
    expect(verificarClave('a', `PBKDF2-SHA256$100000$${sal}$${hash}`)).toBe(false);
  });
  it('rechaza campos extra y registros demasiado largos', () => {
    const hash = hashClave('Prueba2026!');
    expect(verificarClave('Prueba2026!', `${hash}$extra`)).toBe(false);
    expect(verificarClave('a', 'x'.repeat(1000))).toBe(false);
  });
  it('conserva compatibilidad con los hashes iniciales del esquema', () => {
    expect(verificarClave('Admin2026!', 'PBKDF2-SHA256$100000$yqPiouVbz+TnnRzEpj1b0Q==$n288Xx2NaXWRNgQoXVciaXwF/g64Q/EdHa+BxFRh/hc=')).toBe(true);
    expect(verificarClave('Recepcion2026!', 'PBKDF2-SHA256$100000$C1Ko2Dg4peLgjhDf5FPoEw==$AwjUDgJS7KpaLhhvfeEWLVPg/CRGb5fAB8Wn9JW8nNw=')).toBe(true);
  });
  it('el sello cambia si cambian clave, rol o estado', () => {
    const base = { claveHash: 'h', activo: true, rol: 'Recepcionista' };
    const s = selloUsuario(base);
    expect(selloUsuario({ ...base, activo: false })).not.toBe(s);
    expect(selloUsuario({ ...base, rol: 'Administrador' })).not.toBe(s);
    expect(selloUsuario({ ...base, claveHash: 'otro' })).not.toBe(s);
  });
});
