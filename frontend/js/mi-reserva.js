/* Mi reserva: consulta y cancelación con código + correo (requiere la API) */
(function () {
  'use strict';
  const API = window.MareaAPI;
  const $ = id => document.getElementById(id);
  const form = $('lookup');
  if (!form || !API) return;

  const ESTADOS = {
    Confirmada: ['Confirmada', 'ok'], CheckIn: ['En el hotel', 'info'], CheckOut: ['Finalizada', 'muted'],
    Cancelada: ['Cancelada', 'bad'], NoShow: ['No se presentó', 'bad']
  };
  let actual = null;   // { codigo, email }

  // Prellenar el código desde la URL (?codigo=MA2600042)
  const qs = new URLSearchParams(location.search);
  if (qs.get('codigo')) form.elements.codigo.value = qs.get('codigo');
  document.querySelectorAll('a[data-wa]').forEach(a => { a.href = `https://wa.me/${window.CONFIG.whatsapp}`; });

  API.ready().then(online => {
    $('mr-offline').hidden = online;
    form.querySelector('button[type=submit]').disabled = !online;
  });

  function error(box, msg) { box.textContent = msg; box.hidden = !msg; }

  async function buscar(codigo, email) {
    const r = await API.request(`/reservas/${encodeURIComponent(codigo)}?email=${encodeURIComponent(email)}`);
    actual = { codigo: r.codigo, email, datos: r };
    const [txt, tono] = ESTADOS[r.estado] || [r.estado, 'muted'];
    $('mr-r-code').textContent = r.codigo;
    $('mr-r-room').textContent = r.tipoHabitacion;
    $('mr-r-state').textContent = txt;
    $('mr-r-state').className = 'state-badge state-' + tono;
    $('mr-r-holder').textContent = r.titular;
    $('mr-r-in').textContent = API.fecha(r.fechaEntrada, true) + ' · desde 15:00';
    $('mr-r-out').textContent = API.fecha(r.fechaSalida, true) + ' · hasta 12:00';
    $('mr-r-nights').textContent = r.noches;
    $('mr-r-guests').textContent = r.huespedes;
    $('mr-r-number').textContent = r.habitacion;
    $('mr-r-sub').textContent = API.soles(r.subtotal);
    $('mr-r-igv').textContent = r.exoneradoIgv ? 'Exonerado' : API.soles(r.igv);
    $('mr-r-total').textContent = API.soles(r.total);
    $('mr-r-paid').textContent = API.soles(r.pagado);
    $('mr-r-policy').textContent = r.puedeCancelar
      ? 'Puedes cancelar sin costo hasta 72 horas antes de tu llegada.'
      : (r.motivoNoCancelable || '');
    $('mr-cancel').hidden = !r.puedeCancelar;
    $('mr-wa').href = `https://wa.me/${window.CONFIG.whatsapp}?text=${encodeURIComponent('Hola, tengo una consulta sobre mi reserva ' + r.codigo + '.')}`;
    form.hidden = true;
    $('mr-result').hidden = false;
    $('mr-result').focus();
  }

  form.addEventListener('submit', async e => {
    e.preventDefault();
    const codigo = form.elements.codigo.value.trim().toUpperCase();
    const email = form.elements.email.value.trim();
    if (!/^MA\d{7,}$/.test(codigo)) return error($('mr-error'), 'El código tiene el formato MA2600042 (MA + 7 dígitos).');
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(email)) return error($('mr-error'), 'Escribe el correo con el que reservaste.');
    error($('mr-error'), '');
    const btn = form.querySelector('button[type=submit]');
    btn.disabled = true;
    try { await buscar(codigo, email); }
    catch (err) { error($('mr-error'), err.message); }
    finally { btn.disabled = false; }
  });

  $('mr-print').addEventListener('click', () => {
    if (!actual || !window.MareaComprobante) return;
    const r = actual.datos;
    window.MareaComprobante.imprimir({ ...r, titular: r.titular, pagado: r.pagado });
  });

  $('mr-new').addEventListener('click', () => {
    $('mr-result').hidden = true;
    form.hidden = false;
    form.elements.codigo.focus();
  });

  $('cancel-confirm').addEventListener('click', async () => {
    const btn = $('cancel-confirm');
    btn.disabled = true;
    error($('cancel-error'), '');
    try {
      const r = await API.request(`/reservas/${encodeURIComponent(actual.codigo)}/cancelar`, { method: 'POST', body: { email: actual.email } });
      bootstrap.Modal.getInstance($('cancelModal')).hide();
      await buscar(actual.codigo, actual.email);
      $('mr-r-policy').textContent = r.mensaje;
    } catch (err) {
      error($('cancel-error'), err.message);
    } finally {
      btn.disabled = false;
    }
  });
})();
