/* Libro de Reclamaciones virtual (Ley N.° 29571)
   Con API: el número correlativo lo asigna el servidor y queda en la base de datos.
   Sin API: modo demostración (el número es provisional). */
(function () {
  'use strict';
  const form = document.getElementById('claim');
  if (!form) return;
  const API = window.MareaAPI;
  const $ = id => document.getElementById(id);
  const f = form.elements;
  const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/;

  const now = new Date();
  const fmtFecha = d => d.toLocaleDateString('es-PE', { day: '2-digit', month: 'long', year: 'numeric' });
  const provisional = `${String(Math.floor(1 + Math.random() * 99999)).padStart(5, '0')}-${now.getFullYear()}`;
  let online = false;
  $('c-date').textContent = fmtFecha(now);
  $('c-number').textContent = '…';
  API.ready().then(ok => {
    online = ok;
    $('c-number').textContent = ok ? 'se asigna al enviar' : provisional;
  });

  $('c-minor').addEventListener('change', e => { $('c-parent-wrap').hidden = !e.target.checked; });

  const box = $('c-error');
  const campos = {
    nombreCompleto: f.name, numeroDocumento: f.docNumber, domicilio: f.address, telefono: f.phone, email: f.email,
    apoderado: f.parent, descripcionBien: f.descripcion, detalle: f.detail, pedido: f.request,
    declaraVeracidad: f.truth, aceptaPrivacidad: f.privacy
  };
  function fail(msg, field) {
    box.textContent = msg; box.hidden = false;
    form.querySelectorAll('.is-invalid').forEach(el => { el.classList.remove('is-invalid'); el.removeAttribute('aria-invalid'); });
    if (field) { field.classList.add('is-invalid'); field.setAttribute('aria-invalid', 'true'); field.focus(); }
  }

  function mostrarConstancia(numero, fecha, limite) {
    $('cd-kind').textContent = f.kind.value.toLowerCase();
    $('cd-number').textContent = numero;
    $('cd-date').textContent = fecha;
    $('cd-mail').textContent = f.email.value.trim();
    $('cd-limit').textContent = limite ? ` a más tardar el ${limite}` : ' en un plazo máximo de 15 días hábiles';
    form.hidden = true;
    const done = $('claim-done');
    done.hidden = false;
    done.focus();
  }

  form.addEventListener('submit', async e => {
    e.preventDefault();
    const req = [['name', 'Escribe tus nombres y apellidos.'], ['docNumber', 'Escribe tu número de documento.'],
      ['address', 'Escribe tu domicilio.'], ['phone', 'Escribe tu teléfono.'], ['descripcion', 'Describe el producto o servicio contratado.'],
      ['detail', 'Escribe el detalle de tu reclamación.'], ['request', 'Indica tu pedido.']];
    for (const [k, msg] of req) if (!f[k].value.trim()) return fail(msg, f[k]);
    if (f.docType.value === 'DNI' && !/^\d{8}$/.test(f.docNumber.value.trim())) return fail('El DNI debe tener 8 dígitos.', f.docNumber);
    if (f.docType.value === 'RUC' && !/^(10|15|17|20)\d{9}$/.test(f.docNumber.value.trim())) return fail('El RUC debe tener 11 dígitos.', f.docNumber);
    if (!EMAIL_RE.test(f.email.value.trim())) return fail('Escribe un correo válido.', f.email);
    if ($('c-minor').checked && !f.parent.value.trim()) return fail('Indica el nombre del padre, madre o apoderado.', f.parent);
    if (!f.truth.checked) return fail('Confirma que la información es verdadera.', f.truth);
    if (!f.privacy.checked) return fail('Acepta la Política de privacidad para continuar.', f.privacy);
    box.hidden = true;

    if (!online) {
      // Modo demostración: en un sitio real la hoja DEBE guardarse en un servidor
      return mostrarConstancia(provisional, fmtFecha(now), null);
    }

    const btn = form.querySelector('button[type=submit]');
    btn.disabled = true;
    btn.textContent = 'Enviando…';
    try {
      const monto = f.amount.value.trim();
      const r = await API.request('/reclamaciones', { method: 'POST', body: {
        tipo: f.kind.value,
        nombreCompleto: f.name.value.trim(),
        tipoDocumento: f.docType.value, numeroDocumento: f.docNumber.value.trim(),
        domicilio: f.address.value.trim(), telefono: f.phone.value.trim(), email: f.email.value.trim(),
        esMenor: $('c-minor').checked, apoderado: f.parent.value.trim() || null,
        bienTipo: f.itemType.value, montoReclamado: monto ? Number(monto) : null,
        codigoReserva: f.booking.value.trim() || null,
        descripcionBien: f.descripcion.value.trim(), detalle: f.detail.value.trim(), pedido: f.request.value.trim(),
        declaraVeracidad: f.truth.checked, aceptaPrivacidad: f.privacy.checked
      } });
      $('c-number').textContent = r.numero;
      mostrarConstancia(r.numero, fmtFecha(new Date(r.fecha)), API.fecha(r.fechaLimiteRespuesta, true));
    } catch (err) {
      fail(err.message, campos[err.campo] || null);
    } finally {
      btn.disabled = false;
      btn.textContent = 'Enviar reclamación';
    }
  });

  $('cd-print').addEventListener('click', () => window.print());
})();
