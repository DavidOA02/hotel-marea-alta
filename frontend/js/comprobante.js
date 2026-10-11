/* ==========================================================
   HOTEL MAREA ALTA — Confirmación de reserva imprimible / PDF
   Uso: MareaComprobante.imprimir({ codigo, titular, ... })
   Se usa en la web (al reservar y en «Mi reserva») y en el panel.
   ========================================================== */
(function () {
  'use strict';
  const HOTEL = {
    nombre: 'Hotel Marea Alta', razon: 'Marea Alta Hoteles S.A.C.', ruc: '20000000000',
    direccion: 'Av. Paracas Mz. A Lt. 10, Paracas, Pisco – Ica', telefono: '+51 56 000 000', email: 'reservas@mareaalta.pe'
  };
  const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const S = n => 'S/ ' + Number(n || 0).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const F = iso => { const d = new Date(String(iso).slice(0, 10) + 'T12:00:00'); return `${DIAS[d.getDay()]} ${d.getDate()} de ${MESES[d.getMonth()]} de ${d.getFullYear()}`; };
  const ESTADOS = { Confirmada: 'Confirmada', CheckIn: 'En el hotel', CheckOut: 'Finalizada', Cancelada: 'Cancelada', NoShow: 'No se presentó' };

  function html(r) {
    const saldo = r.pagado != null ? Number(r.total) - Number(r.pagado) : null;
    return `<!doctype html><html lang="es-PE"><head><meta charset="utf-8"><title>Reserva ${esc(r.codigo)} · ${HOTEL.nombre}</title>
<style>
  *{box-sizing:border-box} body{font-family:"Segoe UI",Arial,sans-serif;color:#1E2A2E;margin:0;background:#F3F4F1}
  .hoja{max-width:760px;margin:24px auto;background:#fff;padding:44px 48px;border-top:6px solid #12303A}
  .top{display:flex;justify-content:space-between;align-items:flex-start;gap:20px;border-bottom:1px solid #E4E2DC;padding-bottom:22px}
  .marca{font-family:Georgia,serif;font-size:28px;letter-spacing:.12em;text-transform:uppercase;color:#12303A}
  .marca small{display:block;font-family:Arial,sans-serif;font-size:10px;letter-spacing:.3em;color:#7A5C30}
  .datos-hotel{font-size:12px;color:#5A635F;text-align:right;line-height:1.6}
  h1{font-family:Georgia,serif;font-weight:400;font-size:26px;color:#12303A;margin:26px 0 4px}
  .codigo{display:inline-block;font-family:Consolas,monospace;font-size:22px;font-weight:700;letter-spacing:.06em;background:#F4ECDD;color:#5f4727;padding:6px 14px;border-radius:6px;margin:8px 0 22px}
  .estado{font-size:13px;color:#1F6B3E;margin-left:10px}
  table{width:100%;border-collapse:collapse;font-size:14px}
  .det td{padding:9px 0;border-bottom:1px solid #EFEDE7;vertical-align:top} .det td:first-child{color:#5A635F;width:42%}
  .montos{margin-top:22px;background:#FAF8F4;border:1px solid #E4E2DC;border-radius:8px;padding:12px 18px}
  .montos td{padding:5px 0} .montos td:last-child{text-align:right} .montos .tot td{border-top:1px solid #E4E2DC;padding-top:10px;font-weight:700;font-size:16px}
  .nota{font-size:12px;color:#5A635F;line-height:1.6;margin-top:24px}
  .nota strong{color:#1E2A2E}
  .acciones{max-width:760px;margin:0 auto 24px;text-align:right}
  .acciones button{font:inherit;padding:10px 18px;border:0;border-radius:6px;background:#12303A;color:#fff;cursor:pointer}
  @media print{body{background:#fff}.hoja{margin:0;padding:0;border:0}.acciones{display:none}}
</style></head><body>
<div class="hoja">
  <div class="top"><div class="marca">Marea Alta<small>Paracas · Perú</small></div>
    <div class="datos-hotel">${HOTEL.razon} · RUC ${HOTEL.ruc}<br>${HOTEL.direccion}<br>${HOTEL.telefono} · ${HOTEL.email}</div></div>
  <h1>Confirmación de reserva</h1>
  <div><span class="codigo">${esc(r.codigo)}</span>${r.estado ? `<span class="estado">● ${esc(ESTADOS[r.estado] || r.estado)}</span>` : ''}</div>
  <table class="det">
    <tr><td>Titular</td><td><strong>${esc(r.titular)}</strong>${r.documento ? '<br>' + esc(r.documento) : ''}</td></tr>
    <tr><td>Habitación</td><td>${esc(r.tipoHabitacion)}${r.habitacion ? ' · N.° ' + esc(r.habitacion) : ''}</td></tr>
    <tr><td>Llegada</td><td>${F(r.fechaEntrada)} · desde las 15:00</td></tr>
    <tr><td>Salida</td><td>${F(r.fechaSalida)} · hasta las 12:00</td></tr>
    <tr><td>Noches / huéspedes</td><td>${r.noches} ${r.noches === 1 ? 'noche' : 'noches'} · ${r.huespedes} huésped(es)</td></tr>
  </table>
  <table class="montos">
    <tr><td>Valor de venta</td><td>${S(r.subtotal)}</td></tr>
    <tr><td>IGV (18 %)</td><td>${r.exoneradoIgv ? 'Exonerado' : S(r.igv)}</td></tr>
    <tr class="tot"><td>Total</td><td>${S(r.total)}</td></tr>
    ${r.pagado != null ? `<tr><td>Pagado</td><td>${S(r.pagado)}</td></tr><tr><td><strong>Saldo</strong></td><td><strong>${S(saldo)}</strong></td></tr>` : ''}
  </table>
  <div class="nota">
    <strong>Política de cancelación:</strong> sin costo hasta 72 horas antes de las 15:00 del día de llegada. Consulta o cancela en mareaalta.pe/mi-reserva con tu código y correo.<br>
    ${r.exoneradoIgv ? '<strong>Exoneración de IGV:</strong> presenta tu pasaporte y la Tarjeta Andina de Migración al registrarte.<br>' : ''}
    <strong>Medios de pago:</strong> tarjetas, Yape, Plin, transferencia o efectivo. Desayuno buffet, Wi-Fi y estacionamiento incluidos.<br>
    Este documento confirma la reserva; no es un comprobante de pago. Emitido el ${new Date().toLocaleString('es-PE')}.
  </div>
</div>
<div class="acciones"><button onclick="window.print()">Imprimir o guardar en PDF</button></div>
<script>setTimeout(function(){window.print()},400)<\/script>
</body></html>`;
  }

  function imprimir(r) {
    const w = window.open('', '_blank');
    if (!w) { alert('Permite las ventanas emergentes para imprimir la confirmación.'); return; }
    w.document.open();
    w.document.write(html(r));
    w.document.close();
  }

  window.MareaComprobante = { imprimir };
})();
