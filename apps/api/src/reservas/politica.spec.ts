import { hoyLima, sumarDias } from '@marea/shared';
import { ReservasService } from './reservas.service';

describe('Política de cancelación (72 h antes de las 15:00 del día de llegada)', () => {
  it('permite cancelar con más de 72 h', () => {
    expect(ReservasService.politicaCancelacion('Confirmada', sumarDias(hoyLima(), 10)).puede).toBe(true);
  });
  it('no permite cancelar con menos de 72 h', () => {
    const r = ReservasService.politicaCancelacion('Confirmada', sumarDias(hoyLima(), 1));
    expect(r.puede).toBe(false);
    expect(r.motivo).toContain('72 horas');
  });
  it('no permite cancelar reservas que no están confirmadas', () => {
    expect(ReservasService.politicaCancelacion('CheckIn', sumarDias(hoyLima(), 10)).puede).toBe(false);
  });
});
