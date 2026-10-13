import { ReservasService, Solicitud } from './reservas.service';

describe('Identidad del cliente al crear reservas concurrentes', () => {
  const solicitud: Solicitud = {
    tipoHabitacion: 'DUNA', fechaEntrada: '2027-01-10', fechaSalida: '2027-01-12',
    huespedes: 1, residencia: 'PE', canal: 'Web', webPublica: true,
    cliente: { nombres: 'Contacto', apellidos: 'Ficticio', tipoDocumento: 'DNI',
      numeroDocumento: '12345678', email: 'nuevo@example.test', codigoPais: '51', telefono: '900000000' }
  };

  describe.each([
    [42, '00042'], [99999, '99999'], [100000, '100000'],
    [100001, '100001'], [2147483647, '2147483647']
  ])('ID %i: correlativo %s sin truncar', (id, correlativo) => {
    it.each([
      ['otro correo público', true, 'titular@example.test', true],
      ['mismo correo público con mayúsculas', true, ' NUEVO@EXAMPLE.TEST ', false],
      ['reserva de recepción', false, 'titular@example.test', false]
    ])('%s: respeta la política incluso si el documento aparece después de la búsqueda', async (_, webPublica, email, protegido) => {
      const titular = { id: 7, email, nombres: 'Titular' };
      const tx = { query: jest.fn().mockResolvedValue({ rows: [], rowCount: 1 }) };
      const db = {
        transaccion: jest.fn(async (fn: (c: unknown) => Promise<unknown>) => fn(tx)),
        uno: jest.fn(async (sql: string, params: unknown[] = []) => {
          if (sql.includes('FROM tipos_habitacion WHERE codigo')) return { id: 1, nombre: 'Duna', capacidad: 2, precioNoche: 100 };
          if (sql.includes('SELECT h.id, h.numero')) return { id: 1, numero: '101' };
          if (sql.includes('SELECT id, email FROM clientes')) return null; // aún no existía al buscar
          if (sql.includes('INSERT INTO clientes')) {
            // Modela el conflicto con la fila que acaba de confirmar otra transacción.
            const condicionado = sql.includes('WHERE NOT $11::boolean') && params[10];
            if (condicionado && titular.email.trim().toLowerCase() !== String(params[4]).trim().toLowerCase()) return null;
            titular.email = String(params[4]);
            titular.nombres = String(params[0]);
            return { id: titular.id };
          }
          if (sql.includes('SELECT id FROM clientes')) return { id: titular.id };
          if (sql.includes('INSERT INTO reservas')) {
            expect(params[0]).toBe(titular.id);
            return { id };
          }
          if (sql.includes('UPDATE reservas SET codigo')) {
            expect(sql).toContain("to_char(now(), 'YY') || $2");
            expect(params).toEqual([id, correlativo]);
            return { codigo: `MA27${correlativo}` };
          }
          if (sql.includes('WHERE r.id = $1')) return {
            codigo: `MA27${correlativo}`, cliente: `${titular.nombres} Ficticio`, email: titular.email,
            tipoHabitacion: 'Duna', habitacion: '101', fechaEntrada: solicitud.fechaEntrada,
            fechaSalida: solicitud.fechaSalida, noches: 2, huespedes: 1, total: 200, saldo: 200
          };
          throw new Error('Consulta inesperada en la prueba');
        })
      };
      const bitacora = { registrar: jest.fn().mockResolvedValue(undefined) };
      const correos = { encolar: jest.fn().mockResolvedValue(undefined) };
      const servicio = new ReservasService(db as never, bitacora as never, correos as never, undefined as never);

      const resultado = await servicio.crear({ ...solicitud, webPublica });

      expect(resultado.codigo).toBe(`MA27${correlativo}`);
      expect(resultado.correoRegistrado).toBe(protegido);
      expect(titular.email).toBe(protegido ? email : solicitud.cliente!.email);
      expect(titular.nombres).toBe(protegido ? 'Titular' : 'Contacto');
      expect(correos.encolar).toHaveBeenCalledWith(expect.objectContaining({ para: titular.email }), tx);
      expect(bitacora.registrar).toHaveBeenCalledWith(expect.objectContaining({
        datos: protegido ? expect.objectContaining({ contactoWeb: expect.objectContaining({ email: solicitud.cliente!.email }) })
          : expect.not.objectContaining({ contactoWeb: expect.anything() })
      }), tx);
  });
  });
});
