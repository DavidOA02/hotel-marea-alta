import { cotizar, redondear, validarDocumento, validarTelefono, sumarDiasHabiles, diasEntre, enRango, sumarEstadias, horasParaLlegada,
  reservaWebSchema, reservaPanelSchema, pagoSchema, usuarioSchema, cambiarClaveSchema, reclamacionSchema, primerError, hoyLima, sumarDias,
  recalcularPorCambio, desglosar, cambioHabitacionSchema, comprobanteSchema, pagoEnLineaSchema, notaCreditoSchema, devolucionSchema, encuestaSchema,
  sumarDenominaciones, efectivoEsperado, abrirTurnoSchema, movimientoCajaSchema, cerrarTurnoSchema } from './index';

describe('Tarifas e IGV', () => {
  it('incluye IGV para residentes', () => {
    expect(cotizar(650, 3, false)).toEqual({ noches: 3, subtotal: 1652.54, igv: 297.46, total: 1950, exoneradoIgv: false });
  });
  it('exonera a extranjeros no domiciliados (cobra solo el valor de venta)', () => {
    expect(cotizar(650, 3, true)).toEqual({ noches: 3, subtotal: 1652.54, igv: 0, total: 1652.54, exoneradoIgv: true });
  });
  it('subtotal + IGV = total siempre', () => {
    for (const p of [120, 450, 650, 1090, 333.33]) for (let n = 1; n <= 30; n++) {
      const c = cotizar(p, n, false);
      expect(redondear(c.subtotal + c.igv)).toBe(c.total);
    }
  });
});

describe('Cambio de habitación: recálculo de tarifa', () => {
  it('a la misma tarifa el total no cambia', () => {
    expect(recalcularPorCambio(1950, 3, 2, 650, false)).toEqual(cotizar(650, 3, false));
  });
  it('mejora a suite: noche usada al precio original + noches restantes a la nueva tarifa', () => {
    // 1 noche de Horizonte (650) + 2 de Pleamar (1090) = 2830
    expect(recalcularPorCambio(1950, 3, 2, 1090, false)).toEqual({ noches: 3, subtotal: 2398.31, igv: 431.69, total: 2830, exoneradoIgv: false });
  });
  it('si el cambio es antes de llegar, se cobra todo con la nueva tarifa', () => {
    expect(recalcularPorCambio(1950, 3, 3, 450, false).total).toBe(1350);
  });
  it('extranjero exonerado: sin IGV', () => {
    const r = recalcularPorCambio(1652.54, 3, 2, 1090, true);
    expect(r).toMatchObject({ igv: 0, exoneradoIgv: true });
    expect(r.total).toBe(r.subtotal);
  });
  it('desglosar mantiene subtotal + IGV = total', () => {
    for (const t of [0.01, 99.99, 1950, 2830.5, 12345.67]) { const d = desglosar(t, 1, false); expect(redondear(d.subtotal + d.igv)).toBe(d.total); }
  });
});

describe('Documentos y teléfonos peruanos', () => {
  it.each([['DNI', '12345678', null], ['DNI', '1234567', 'El DNI debe tener 8 dígitos.'], ['PAS', 'AB123456', null], ['CE', '001234567', null], ['RUC', '20123456789', null], ['RUC', '30123456789', 'El RUC debe tener 11 dígitos.']])(
    '%s %s', (t, n, esperado) => expect(validarDocumento(t, n)).toBe(esperado));
  it('celular +51 de 9 dígitos que empieza con 9', () => {
    expect(validarTelefono('51', '987 654 321')).toBeNull();
    expect(validarTelefono('51', '812345678')).not.toBeNull();
    expect(validarTelefono('1', '555 123 4567')).toBeNull();
  });
});

describe('Fechas', () => {
  it('15 días hábiles saltan fines de semana', () => {
    expect(sumarDiasHabiles('2026-10-02', 15)).toBe('2026-10-23'); // viernes → viernes 3 semanas después
  });
  it('días entre fechas', () => expect(diasEntre('2026-12-30', '2027-01-02')).toBe(3));
  it('horas para la llegada (15:00 Lima)', () => expect(horasParaLlegada('2026-10-10', new Date('2026-10-07T20:00:00Z'))).toBe(72));
});

describe('Métricas hoteleras', () => {
  it('prorratea una estadía que cruza de mes', () => {
    const e = { entrada: '2026-01-30', salida: '2026-02-03', noches: 4, total: 2000 };
    expect(enRango(e, '2026-01-01', '2026-02-01')).toEqual({ noches: 2, ingreso: 1000 });
    expect(enRango(e, '2026-02-01', '2026-03-01')).toEqual({ noches: 2, ingreso: 1000 });
    expect(sumarEstadias([e, e], '2026-01-01', '2026-03-01')).toEqual({ noches: 8, ingreso: 4000 });
  });
});

describe('Esquemas Zod', () => {
  const hoy = hoyLima();
  const base = {
    tipoHabitacion: 'horizonte', fechaEntrada: sumarDias(hoy, 5), fechaSalida: sumarDias(hoy, 7), huespedes: 2,
    nombres: 'Ana', apellidos: 'Quispe', tipoDocumento: 'DNI', numeroDocumento: '12345678', email: 'ANA@Correo.com',
    codigoPais: '51', telefono: '987 654 321', residencia: 'PE', aceptaPrivacidad: true
  };
  it('acepta una reserva válida y normaliza datos', () => {
    const r = reservaWebSchema.parse(base);
    expect(r.email).toBe('ana@correo.com');
    expect(r.telefono).toBe('987654321');
  });
  it('rechaza fechas invertidas indicando el campo', () => {
    const r = reservaWebSchema.safeParse({ ...base, fechaSalida: base.fechaEntrada });
    expect(r.success).toBe(false);
    if (!r.success) expect(primerError(r.error)).toEqual({ mensaje: 'La salida debe ser al menos un día después de la llegada.', campo: 'fechaSalida' });
  });
  it('extranjero exonerado requiere pasaporte', () => {
    const r = reservaWebSchema.safeParse({ ...base, residencia: 'EXT' });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues.some(i => i.path[0] === 'tipoDocumento')).toBe(true);
  });
  it('exige aceptar la privacidad', () => {
    const r = reservaWebSchema.safeParse({ ...base, aceptaPrivacidad: false });
    expect(r.success).toBe(false);
  });
  it('reserva del panel: cliente existente o nuevo', () => {
    const r = reservaPanelSchema.safeParse({ tipoHabitacion: 'duna', fechaEntrada: base.fechaEntrada, fechaSalida: base.fechaSalida, huespedes: 2, residencia: 'PE', canal: 'Telefono' });
    expect(r.success).toBe(false);
    expect(reservaPanelSchema.safeParse({ clienteId: 3, tipoHabitacion: 'duna', fechaEntrada: base.fechaEntrada, fechaSalida: base.fechaSalida, huespedes: 2, residencia: 'PE', canal: 'Telefono' }).success).toBe(true);
  });
  it('pago en dólares requiere tipo de cambio', () => {
    expect(pagoSchema.safeParse({ monto: 100, moneda: 'USD', metodo: 'Tarjeta' }).success).toBe(false);
    expect(pagoSchema.safeParse({ monto: 100, moneda: 'USD', metodo: 'Tarjeta', tipoCambio: 3.7 }).success).toBe(true);
  });
  it('contraseñas seguras', () => {
    expect(usuarioSchema.safeParse({ nombre: 'Luis', email: 'l@h.pe', rol: 'Recepcionista', clave: 'corta' }).success).toBe(false);
    expect(usuarioSchema.safeParse({ nombre: 'Luis', email: 'l@h.pe', rol: 'Recepcionista', clave: 'Segura2026' }).success).toBe(true);
    expect(cambiarClaveSchema.safeParse({ claveActual: 'a', claveNueva: 'Nueva2026x', repetir: 'Otra2026x' }).success).toBe(false);
  });
  it('cambio de habitación: habitación, tarifa y motivo obligatorios', () => {
    expect(cambioHabitacionSchema.safeParse({ habitacionId: '12', tarifa: 'Mantener', motivo: 'Aire acondicionado malogrado' }).success).toBe(true);
    const r = cambioHabitacionSchema.safeParse({ habitacionId: 12, tarifa: 'Mantener', motivo: 'x' });
    expect(r.success).toBe(false);
    if (!r.success) expect(primerError(r.error).campo).toBe('motivo');
  });
  it('factura: RUC válido, razón social y dirección; boleta y exportación no los piden', () => {
    expect(comprobanteSchema.safeParse({ tipo: 'Boleta' }).success).toBe(true);
    expect(comprobanteSchema.safeParse({ tipo: 'Factura', exportacion: true }).success).toBe(true);
    const f = comprobanteSchema.safeParse({ tipo: 'Factura', ruc: '30123456789', razonSocial: 'X SAC', direccion: 'Lima' });
    expect(f.success).toBe(false);
    if (!f.success) expect(primerError(f.error).campo).toBe('ruc');
    expect(comprobanteSchema.safeParse({ tipo: 'Factura', ruc: '20123456789', razonSocial: 'Viajes SAC', direccion: 'Av. Lima 1' }).success).toBe(true);
  });
  it('pago en línea: código MA + 7 dígitos y correo', () => {
    expect(pagoEnLineaSchema.parse({ codigo: ' ma2600042 ', email: 'A@B.PE' })).toEqual({ codigo: 'MA2600042', email: 'a@b.pe' });
    expect(pagoEnLineaSchema.safeParse({ codigo: '123', email: 'a@b.pe' }).success).toBe(false);
  });
  it('nota de crédito: el monto solo es obligatorio en la disminución en el valor', () => {
    expect(notaCreditoSchema.safeParse({ motivo: '01', sustento: 'Error en los datos' }).success).toBe(true);
    const r = notaCreditoSchema.safeParse({ motivo: '09', monto: '', sustento: 'Descuento por reclamo' });
    expect(r.success).toBe(false);
    if (!r.success) expect(primerError(r.error).campo).toBe('monto');
    expect(notaCreditoSchema.parse({ motivo: '09', monto: '120.50', sustento: 'Descuento por reclamo' }).monto).toBe(120.5);
  });
  it('devolución y encuesta', () => {
    expect(devolucionSchema.parse({ monto: '50', motivo: 'Saldo a favor' })).toEqual({ monto: 50, motivo: 'Saldo a favor', reducirTotal: false });
    expect(encuestaSchema.safeParse({ calificacion: 6, recomendacion: 9 }).success).toBe(false);
    expect(encuestaSchema.parse({ calificacion: '5', recomendacion: '10', comentario: '' })).toEqual({ calificacion: 5, recomendacion: 10, comentario: null });
  });
  it('libro de reclamaciones: apoderado si es menor', () => {
    const r = { tipo: 'Reclamo', nombreCompleto: 'X', tipoDocumento: 'DNI', numeroDocumento: '12345678', domicilio: 'Lima', telefono: '9', email: 'x@y.pe',
      esMenor: true, bienTipo: 'Servicio', montoReclamado: '', descripcionBien: 'x', detalle: 'x', pedido: 'x', declaraVeracidad: true, aceptaPrivacidad: true };
    const res = reclamacionSchema.safeParse(r);
    expect(res.success).toBe(false);
    if (!res.success) expect(primerError(res.error).campo).toBe('apoderado');
  });
});

describe('Caja por turnos y arqueo', () => {
  it('suma el conteo por billetes y monedas sin errores de redondeo', () => {
    expect(sumarDenominaciones({ '200': 1, '100': 2, '20': 3, '0.5': 3, '0.2': 1, '0.1': 3 })).toBe(462);
    expect(sumarDenominaciones({ '0.1': 7 })).toBe(0.7);
    expect(sumarDenominaciones({ '50': '2', '1': '' })).toBe(100);
    expect(sumarDenominaciones({})).toBe(0);
  });
  it('efectivo esperado: fondo + cobros en efectivo − devoluciones en efectivo ± movimientos, con dólares aparte', () => {
    expect(efectivoEsperado({
      fondoInicial: 200,
      cobros: [{ metodo: 'Efectivo', moneda: 'PEN', monto: 450 }, { metodo: 'Efectivo', moneda: 'USD', monto: 100 }, { metodo: 'Tarjeta', moneda: 'PEN', monto: 650 }],
      devoluciones: [{ metodo: 'Efectivo', monto: 50 }, { metodo: 'Yape', monto: 30 }],
      movimientos: [{ tipo: 'Retiro', moneda: 'PEN', monto: 300 }, { tipo: 'Ingreso', moneda: 'PEN', monto: 20.1 }, { tipo: 'Retiro', moneda: 'USD', monto: 40 }]
    })).toEqual({ soles: 320.1, dolares: 60 });
    expect(efectivoEsperado({ fondoInicial: 0, cobros: [], devoluciones: [], movimientos: [] })).toEqual({ soles: 0, dolares: 0 });
  });
  it('esquemas de apertura, movimiento y cierre', () => {
    expect(abrirTurnoSchema.parse({ fondoInicial: '200', nota: '' })).toEqual({ fondoInicial: 200, nota: null });
    expect(abrirTurnoSchema.safeParse({ fondoInicial: -1 }).success).toBe(false);
    expect(abrirTurnoSchema.safeParse({ fondoInicial: '' }).success).toBe(false);
    expect(abrirTurnoSchema.parse({ fondoInicial: 0 }).fondoInicial).toBe(0);
    expect(movimientoCajaSchema.safeParse({ tipo: 'Retiro', moneda: 'PEN', monto: 0, motivo: 'Caja fuerte' }).success).toBe(false);
    expect(cerrarTurnoSchema.parse({ contadoSoles: '350.5' })).toEqual({ contadoSoles: 350.5, contadoDolares: 0, observaciones: null });
    expect(cerrarTurnoSchema.safeParse({ denominaciones: { '100': 3, '50': 1 }, contadoSoles: 350 }).success).toBe(true);
    const distinto = cerrarTurnoSchema.safeParse({ denominaciones: { '100': 3 }, contadoSoles: 350 });
    expect(distinto.success).toBe(false);
    if (!distinto.success) expect(primerError(distinto.error).campo).toBe('contadoSoles');
    expect(cerrarTurnoSchema.safeParse({ denominaciones: { '3': 1 }, contadoSoles: 3 }).success).toBe(false);
    expect(cerrarTurnoSchema.safeParse({ denominaciones: { '10': 1.5 }, contadoSoles: 15 }).success).toBe(false);
  });
});
