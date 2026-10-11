/* Libro de Reclamaciones virtual (Ley N.° 29571) */
(function () {
  'use strict';
  const form = document.getElementById('claim');
  if (!form) return;
  const $ = id => document.getElementById(id);
  const f = form.elements;
  const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/;

  // Correlativo: año + número. En producción debe generarlo el servidor.
  const now = new Date();
  const number = `${String(Math.floor(1 + Math.random() * 99999)).padStart(5, '0')}-${now.getFullYear()}`;
  const dateText = now.toLocaleDateString('es-PE', { day: '2-digit', month: 'long', year: 'numeric' });
  $('c-number').textContent = number;
  $('c-date').textContent = dateText;

  $('c-minor').addEventListener('change', e => { $('c-parent-wrap').hidden = !e.target.checked; });

  const box = $('c-error');
  function fail(msg, field) {
    box.textContent = msg; box.hidden = false;
    form.querySelectorAll('[aria-invalid]').forEach(el => el.removeAttribute('aria-invalid'));
    if (field) { field.setAttribute('aria-invalid', 'true'); field.focus(); }
  }

  form.addEventListener('submit', e => {
    e.preventDefault();
    const req = [['name', 'Escribe tus nombres y apellidos.'], ['docNumber', 'Escribe tu número de documento.'],
      ['address', 'Escribe tu domicilio.'], ['phone', 'Escribe tu teléfono.'], ['item', 'Describe el producto o servicio contratado.'],
      ['detail', 'Escribe el detalle de tu reclamación.'], ['request', 'Indica tu pedido.']];
    for (const [k, msg] of req) if (!f[k].value.trim()) return fail(msg, f[k]);
    if (f.docType.value === 'DNI' && !/^\d{8}$/.test(f.docNumber.value.trim())) return fail('El DNI debe tener 8 dígitos.', f.docNumber);
    if (f.docType.value === 'RUC' && !/^(10|15|17|20)\d{9}$/.test(f.docNumber.value.trim())) return fail('El RUC debe tener 11 dígitos.', f.docNumber);
    if (!EMAIL_RE.test(f.email.value.trim())) return fail('Escribe un correo válido.', f.email);
    if ($('c-minor').checked && !f.parent.value.trim()) return fail('Indica el nombre del padre, madre o apoderado.', f.parent);
    if (!f.truth.checked) return fail('Confirma que la información es verdadera.', f.truth);
    if (!f.privacy.checked) return fail('Acepta la Política de privacidad para continuar.', f.privacy);

    // Aquí debes enviar la hoja a tu servidor o correo (obligatorio en un sitio real).
    $('cd-kind').textContent = f.kind.value.toLowerCase();
    $('cd-number').textContent = number;
    $('cd-date').textContent = dateText;
    $('cd-mail').textContent = f.email.value.trim();
    form.hidden = true;
    const done = $('claim-done');
    done.hidden = false;
    done.focus();
  });

  $('cd-print').addEventListener('click', () => window.print());
})();
