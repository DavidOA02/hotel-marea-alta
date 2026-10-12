import { cancelacionReserva, comprobanteEmitido, confirmacionReserva, devolucionRealizada, encuestaEstadia, pagoRecibido, recordatorioLlegada, ReservaCorreo } from './plantillas';

const r:ReservaCorreo = { codigo:'MA2600001', cliente:'Ana <script> & Smith', tipoHabitacion:'Duna', habitacion:'101', fechaEntrada:'2026-10-15',fechaSalida:'2026-10-17',noches:2,huespedes:2,
  subtotal:900,igv:0,total:900,exoneradoIgv:true,pagado:200,saldo:700,residencia:'EXT' };
describe('Correos bilingües',()=>{
  it('traduce todas las notificaciones de la estadía y escapa los datos del huésped',()=>{
    const mensajes=[confirmacionReserva(r,true), cancelacionReserva(r), pagoRecibido(r,{monto:200,pasarela:'Niubiz',referencia:'tx'}), recordatorioLlegada(r,true),encuestaEstadia(r,'token'),
      devolucionRealizada(r,{monto:59,medio:'Pasarela',pasarela:'Niubiz',metodo:'Tarjeta',motivo:'<script>refund</script>'}),
      comprobanteEmitido({tipo:'08',serie:'FD01',numero:1,fechaEmision:'2026-10-15',clienteNombre:r.cliente,gravada:50,exportacion:0,igv:9,total:59,enlacePdf:null,enlaceXml:null,proveedor:'Simulado',codigoReserva:r.codigo,idioma:'en'})];
    for(const m of mensajes){ expect(m.html).toContain('lang="en"');expect(m.html).not.toContain('<script>');expect(m.texto).not.toContain('Código de reserva'); }
    expect(mensajes[0].texto).toContain('Thursday, 15 October 2026');
    expect(mensajes[6].asunto).toContain('Electronic debit note');
  });
  it('respeta el idioma explícito independientemente de la residencia',()=>{
    expect(confirmacionReserva({...r,idioma:'es'},true).html).toContain('lang="es"');
    expect(confirmacionReserva({...r,residencia:'PE',idioma:'en'},true).html).toContain('lang="en"');
    expect(confirmacionReserva({...r,residencia:'PE'},true).asunto).toContain('Reserva');
  });
});
