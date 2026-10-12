import { cuerpoNubefact, DocumentoElectronico, ErrorOse, interpretarNubefact, Nubefact } from './proveedores';

const boleta: DocumentoElectronico = {
  tipo: '03', serie: 'B001', numero: 7, fechaEmision: '2026-10-11', tipoOperacion: '0101', clienteTipoDoc: '1', clienteNumDoc: '41000001',
  clienteNombre: 'ANA QUISPE', clienteDireccion: null, clienteEmail: 'ana@correo.pe', gravada: 762.71, exportacion: 0, igv: 137.29, total: 900,
  items: [{ codigo: 'MA2600042', descripcion: 'Servicio de hospedaje', unidad: 'ZZ', cantidad: 1, valorUnitario: 762.71, precioUnitario: 900, afectacion: '10', igv: 137.29, total: 900 }]
};
const exportacion: DocumentoElectronico = { ...boleta, tipo: '01', serie: 'F001', tipoOperacion: '0202', clienteTipoDoc: '7', clienteNumDoc: 'US1234567',
  gravada: 0, exportacion: 762.71, igv: 0, total: 762.71, items: [{ ...boleta.items[0], valorUnitario: 762.71, precioUnitario: 762.71, afectacion: '40', igv: 0, total: 762.71 }] };

describe('Nubefact (OSE/PSE)', () => {
  it('arma la boleta con los códigos de su API', () => {
    expect(cuerpoNubefact(boleta)).toMatchObject({ operacion: 'generar_comprobante', tipo_de_comprobante: 2, serie: 'B001', numero: 7, sunat_transaction: 1,
      cliente_tipo_de_documento: '1', fecha_de_emision: '11-10-2026', moneda: 1, total_gravada: 762.71, total_igv: 137.29, total: 900, codigo_unico: 'B001-7',
      items: [{ unidad_de_medida: 'ZZ', tipo_de_igv: 1, valor_unitario: 762.71, precio_unitario: 900, subtotal: 762.71, igv: 137.29, total: 900 }] });
  });
  it('exportación de hospedaje: factura, operación 2 e IGV tipo 16', () => {
    expect(cuerpoNubefact(exportacion)).toMatchObject({ tipo_de_comprobante: 1, sunat_transaction: 2, cliente_tipo_de_documento: '7', total_inafecta: 762.71, total_igv: 0,
      items: [{ tipo_de_igv: 16, igv: 0 }] });
  });
  it('nota de crédito: tipo 3 con el documento que modifica y el motivo del catálogo 09', () => {
    const nota: DocumentoElectronico = { ...boleta, tipo: '07', serie: 'BC01', numero: 1, gravada: 169.49, igv: 30.51, total: 200,
      nota: { tipo: '03', serie: 'B001', numero: 7, motivo: '09', sustento: 'Descuento por reclamo' } };
    expect(cuerpoNubefact(nota)).toMatchObject({ tipo_de_comprobante: 3, serie: 'BC01', documento_que_se_modifica_tipo: 2, documento_que_se_modifica_serie: 'B001',
      documento_que_se_modifica_numero: 7, tipo_de_nota_de_credito: 9, observaciones: 'Descuento por reclamo', total: 200 });
    expect(cuerpoNubefact(boleta)).not.toHaveProperty('documento_que_se_modifica_tipo');
  });
  it('interpreta la respuesta: aceptado, observado, rechazado o pendiente (resumen diario)', () => {
    expect(interpretarNubefact({ aceptada_por_sunat: true, sunat_responsecode: '0', sunat_description: 'La Boleta numero B001-7, ha sido aceptada', enlace_del_pdf: 'https://x/pdf' }))
      .toMatchObject({ estado: 'Aceptado', enlacePdf: 'https://x/pdf' });
    expect(interpretarNubefact({ aceptada_por_sunat: true, sunat_responsecode: '4252', sunat_note: 'Observación' }).estado).toBe('Observado');
    expect(interpretarNubefact({ aceptada_por_sunat: false, sunat_responsecode: '2800', sunat_description: 'El dato ingresado no cumple' }).estado).toBe('Rechazado');
    expect(interpretarNubefact({ aceptada_por_sunat: false, sunat_responsecode: '' }).estado).toBe('Pendiente');
  });
  it('envía el token en la cabecera; si el documento ya existe lo consulta; sin red es un error transitorio', async () => {
    process.env.NUBEFACT_RUTA = 'https://api.nubefact.com/api/v1/ruta-demo';
    process.env.NUBEFACT_TOKEN = 'tok';
    const llamadas: any[] = [];
    const rs = [{ status: 422, json: { errors: 'Este documento ya existe en NubeFacT', codigo: 23 } }, { status: 200, json: { aceptada_por_sunat: true, sunat_responsecode: '0' } }];
    global.fetch = jest.fn(async (url: any, init: any) => { llamadas.push({ url, init }); const r = rs.shift()!; return new Response(JSON.stringify(r.json), { status: r.status }); }) as any;
    expect((await Nubefact.emitir(boleta)).estado).toBe('Aceptado');
    expect(llamadas[0].init.headers.Authorization).toBe('Token token="tok"');
    expect(JSON.parse(llamadas[1].init.body)).toMatchObject({ operacion: 'consultar_comprobante', tipo_de_comprobante: 2, serie: 'B001', numero: 7 });
    global.fetch = jest.fn(async () => { throw new Error('ECONNRESET'); }) as any;
    await expect(Nubefact.emitir(boleta)).rejects.toMatchObject({ transitorio: true });
    await expect(Nubefact.emitir(boleta)).rejects.toBeInstanceOf(ErrorOse);
  });
});
