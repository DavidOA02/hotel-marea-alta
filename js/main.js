/* ==========================================================
   HOTEL MAREA ALTA · PARACAS — Interacción del sitio
   ========================================================== */

/* ----------------------------------------------------------
   CONFIGURACIÓN — edita estos valores antes de publicar
   ---------------------------------------------------------- */
const CONFIG = {
  whatsapp: '51999999999',      // número con código de país, sin + ni espacios
  formEndpoint: '',             // p. ej. 'https://formspree.io/f/XXXXXXX' (vacío = modo demostración)
  tipoCambio: 3.70,             // soles por dólar (referencial; actualízalo)
  igv: 0.18,
  rooms: {                      // tarifas por noche en soles, IGV incluido
    duna:      { name: 'Habitación Duna',      price: 450,  cap: 2 },
    horizonte: { name: 'Habitación Horizonte', price: 650,  cap: 3 },
    pleamar:   { name: 'Suite Pleamar',        price: 1090, cap: 4 }
  }
};

(function () {
  'use strict';

  const $ = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const scrollToEl = el => el && el.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth' });
  const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/;

  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* sin almacenamiento */ } }
  };

  /* ======================================================
     COMÚN A TODAS LAS PÁGINAS
     ====================================================== */

  // Imágenes que aún no existen: se ocultan y queda el degradado de respaldo
  $$('.media img').forEach(img => {
    const hide = () => img.classList.add('is-broken');
    if (img.complete && img.naturalWidth === 0) hide();
    img.addEventListener('error', hide);
  });

  // Encabezado: transparente sobre la portada, sólido al bajar
  const header = $('.site-header');
  if (header && !header.classList.contains('is-static')) {
    const onScroll = () => header.classList.toggle('is-solid', window.scrollY > 60);
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  // Menú móvil
  const toggle = $('.nav-toggle');
  const menu = $('#menu');
  if (toggle && menu) {
    const setMenu = open => {
      menu.hidden = !open;
      document.body.classList.toggle('menu-open', open);
      toggle.setAttribute('aria-expanded', String(open));
      toggle.setAttribute('aria-label', open ? 'Cerrar menú' : 'Abrir menú');
    };
    toggle.addEventListener('click', () => setMenu(menu.hidden));
    $$('a', menu).forEach(a => a.addEventListener('click', () => setMenu(false)));
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && !menu.hidden) { setMenu(false); toggle.focus(); }
    });
  }

  // Enlaces de WhatsApp con el número configurado
  $$('#wa-float').forEach(a => {
    a.href = `https://wa.me/${CONFIG.whatsapp}?text=${encodeURIComponent('Hola, quisiera información sobre el Hotel Marea Alta.')}`;
  });

  // Boletín
  const nl = $('#newsletter');
  if (nl) {
    nl.addEventListener('submit', e => {
      e.preventDefault();
      const input = $('#nl-mail'), msg = $('#nl-msg');
      if (!EMAIL_RE.test(input.value.trim())) { msg.textContent = 'Escribe un correo válido.'; input.focus(); return; }
      msg.textContent = '¡Gracias! Te enviaremos nuestras ofertas.';
      input.value = '';
    });
  }

  // Aparición suave
  const revealEls = $$('.reveal');
  if ('IntersectionObserver' in window && !reduceMotion) {
    const io = new IntersectionObserver(entries => {
      entries.forEach(en => { if (en.isIntersecting) { en.target.classList.add('is-visible'); io.unobserve(en.target); } });
    }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
    revealEls.forEach(el => io.observe(el));
  } else {
    revealEls.forEach(el => el.classList.add('is-visible'));
  }

  $$('#year').forEach(el => { el.textContent = new Date().getFullYear(); });

  /* ======================================================
     PÁGINA PRINCIPAL: moneda, habitaciones y reserva
     ====================================================== */
  const form = $('#booking');
  if (!form) return;

  const ROOMS = CONFIG.rooms;
  const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  const state = {
    checkIn: '', checkOut: '', guests: '2', room: 'horizonte',
    residency: 'PE',
    currency: store.get('ma-currency') === 'USD' ? 'USD' : 'PEN'
  };

  /* ---------- Formato de moneda (Perú) ---------- */
  const fmtPEN = new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN', minimumFractionDigits: 2 });
  const num2 = new Intl.NumberFormat('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const num0 = new Intl.NumberFormat('es-PE', { maximumFractionDigits: 0 });
  const fmtUSD = { format: n => 'US$ ' + num2.format(n) };
  const fmtPEN0 = new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN', maximumFractionDigits: 0 });
  const fmtUSD0 = { format: n => 'US$ ' + num0.format(n) };
  const round2 = n => Math.round(n * 100) / 100;
  const money = (pen, decimals = true) => state.currency === 'USD'
    ? (decimals ? fmtUSD : fmtUSD0).format(pen / CONFIG.tipoCambio)
    : (decimals ? fmtPEN : fmtPEN0).format(pen);

  /* ---------- Fechas ---------- */
  const toISO = d => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  const today = toISO(new Date());
  $$('input[type="date"]').forEach(i => { i.min = today; });
  const fmtDate = s => { if (!s) return ''; const [, m, d] = s.split('-'); return Number(d) + ' ' + MONTHS[Number(m) - 1]; };
  const nights = () => {
    if (!state.checkIn || !state.checkOut) return 0;
    const n = Math.round((new Date(state.checkOut) - new Date(state.checkIn)) / 86400000);
    return n > 0 ? n : 0;
  };

  /* ---------- Cálculo con IGV ----------
     Las tarifas incluyen IGV. Para extranjeros no domiciliados el
     hospedaje está exonerado: se cobra solo el valor sin IGV.        */
  function quote() {
    const room = ROOMS[state.room];
    const n = nights();
    const gross = room.price * n;
    const base = round2(gross / (1 + CONFIG.igv));
    const exempt = state.residency === 'EXT';
    return { room, n, base, igv: exempt ? 0 : round2(gross - base), total: exempt ? base : gross, exempt };
  }

  /* ---------- Moneda ---------- */
  function setCurrency(cur) {
    state.currency = cur;
    store.set('ma-currency', cur);
    $$('[data-currency]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.currency === cur)));
    $$('[data-price]').forEach(el => { el.textContent = money(Number(el.dataset.price), false); });
    render();
  }
  $$('[data-currency]').forEach(b => b.addEventListener('click', () => setCurrency(b.dataset.currency)));

  /* ---------- Sincronizar barra de portada ↔ formulario ---------- */
  function setValue(key, value) {
    state[key] = value;
    $$(`[data-sync="${key}"]`).forEach(el => { if (el.value !== value) el.value = value; });
    if (key === 'checkIn') {
      $$('[data-sync="checkOut"]').forEach(el => {
        el.min = value || today;
        if (value && state.checkOut && state.checkOut <= value) { state.checkOut = ''; el.value = ''; }
      });
    }
    hideError();
    render();
  }
  $$('[data-sync]').forEach(el => el.addEventListener('change', () => setValue(el.dataset.sync, el.value)));

  $('#quick').addEventListener('submit', e => { e.preventDefault(); scrollToEl($('#reservar')); });
  $$('.room-pick').forEach(btn => btn.addEventListener('click', () => {
    setValue('room', btn.dataset.pick);
    scrollToEl($('#reservar'));
  }));

  /* ---------- Residencia y documento ---------- */
  const f = form.elements;
  const docHints = { DNI: 'numeric', CE: 'text', PAS: 'text' };
  $$('input[name="residency"]').forEach(r => r.addEventListener('change', () => {
    state.residency = r.value;
    if (r.value === 'EXT' && f.docType.value === 'DNI') f.docType.value = 'PAS';
    if (r.value === 'PE' && f.docType.value === 'PAS') f.docType.value = 'DNI';
    f.docNumber.inputMode = docHints[f.docType.value];
    $('#igv-hint').textContent = r.value === 'EXT'
      ? 'Hospedaje exonerado de IGV para extranjeros no domiciliados (estadías de hasta 60 días). Presenta tu pasaporte y Tarjeta Andina de Migración al registrarte.'
      : 'Las tarifas incluyen IGV (18 %).';
    render();
  }));
  f.docType.addEventListener('change', () => { f.docNumber.inputMode = docHints[f.docType.value]; });

  /* ---------- Resumen ---------- */
  function render() {
    const q = quote();
    $('#s-room').textContent = q.room.name;
    $('#s-dates').textContent = state.checkIn && state.checkOut ? `${fmtDate(state.checkIn)} – ${fmtDate(state.checkOut)}` : 'Elige fechas';
    $('#s-nights').textContent = q.n || '—';
    $('#s-guests').textContent = state.guests;
    $('#s-rate').textContent = money(q.exempt ? q.room.price / (1 + CONFIG.igv) : q.room.price);
    $('#s-sub').textContent = q.n ? money(q.base) : '—';
    $('#s-igv').textContent = q.exempt ? 'Exonerado' : (q.n ? money(q.igv) : '—');
    $('#s-total').textContent = q.n ? money(q.total) : '—';
    $('#s-fx').textContent = state.currency === 'USD'
      ? `Tipo de cambio referencial S/ ${CONFIG.tipoCambio.toFixed(2)}. Total en soles: ${q.n ? fmtPEN.format(q.total) : '—'}.`
      : '';

    $$('.room').forEach(card => {
      const sel = card.dataset.room === state.room;
      card.classList.toggle('is-selected', sel);
      const b = $('.room-pick', card);
      b.textContent = sel ? 'Seleccionada' : 'Reservar';
      b.setAttribute('aria-pressed', String(sel));
    });
  }

  /* ---------- Validación ---------- */
  const errorBox = $('#form-error');
  const clearInvalid = () => $$('#booking [aria-invalid]').forEach(el => el.removeAttribute('aria-invalid'));
  function showError(msg, field) {
    errorBox.textContent = msg;
    errorBox.hidden = false;
    clearInvalid();
    if (field) { field.setAttribute('aria-invalid', 'true'); field.focus(); }
    return false;
  }
  function hideError() { errorBox.hidden = true; clearInvalid(); }

  const DOC_RULES = {
    DNI: { re: /^\d{8}$/, msg: 'El DNI debe tener 8 dígitos.' },
    CE:  { re: /^[A-Za-z0-9]{9,12}$/, msg: 'El carné de extranjería debe tener entre 9 y 12 caracteres.' },
    PAS: { re: /^[A-Za-z0-9]{6,12}$/, msg: 'El pasaporte debe tener entre 6 y 12 letras o números.' }
  };

  function validate(requireAll = true) {
    const q = quote();
    if (!state.checkIn) return showError('Elige la fecha de llegada.', f.checkIn);
    if (!state.checkOut) return showError('Elige la fecha de salida.', f.checkOut);
    if (!q.n) return showError('La salida debe ser al menos un día después de la llegada.', f.checkOut);
    if (Number(state.guests) > q.room.cap)
      return showError(`${q.room.name} admite hasta ${q.room.cap} huéspedes. Elige otra habitación o reduce el número.`, f.guests);
    if (!f.firstName.value.trim()) return showError('Escribe tus nombres.', f.firstName);
    if (!f.lastName.value.trim()) return showError('Escribe tus apellidos.', f.lastName);
    if (!requireAll) return true;
    if (state.residency === 'EXT' && f.docType.value !== 'PAS')
      return showError('Para la exoneración de IGV se requiere pasaporte. Cambia el tipo de documento.', f.docType);
    const rule = DOC_RULES[f.docType.value];
    if (!rule.re.test(f.docNumber.value.trim())) return showError(rule.msg, f.docNumber);
    const phone = f.phone.value.replace(/\D/g, '');
    if (f.countryCode.value === '51' ? !/^9\d{8}$/.test(phone) : !/^\d{6,14}$/.test(phone))
      return showError(f.countryCode.value === '51' ? 'El celular debe tener 9 dígitos y empezar con 9.' : 'Escribe un número de teléfono válido.', f.phone);
    if (!EMAIL_RE.test(f.email.value.trim())) return showError('Escribe un correo válido, por ejemplo nombre@correo.com.', f.email);
    if (!f.privacy.checked) return showError('Debes aceptar la Política de privacidad para continuar.', f.privacy);
    return true;
  }

  /* ---------- Mensaje para WhatsApp ---------- */
  function waMessage(code) {
    const q = quote();
    const lines = [
      `Hola, quisiera ${code ? 'confirmar mi solicitud de reserva ' + code : 'reservar'} en Marea Alta:`,
      `• ${q.room.name}`,
      `• Del ${fmtDate(state.checkIn)} al ${fmtDate(state.checkOut)} (${q.n} ${q.n === 1 ? 'noche' : 'noches'})`,
      `• ${state.guests} huésped(es)`,
      `• Total: ${fmtPEN.format(q.total)}${q.exempt ? ' (exonerado de IGV, turista extranjero)' : ' (IGV incluido)'}`,
      `• A nombre de: ${f.firstName.value.trim()} ${f.lastName.value.trim()}`
    ];
    if (f.notes.value.trim()) lines.push(`• Notas: ${f.notes.value.trim()}`);
    return `https://wa.me/${CONFIG.whatsapp}?text=${encodeURIComponent(lines.join('\n'))}`;
  }

  $('#wa-book').addEventListener('click', () => {
    if (!validate(false)) return;
    window.open(waMessage(), '_blank', 'noopener');
  });

  /* ---------- Envío de la solicitud ---------- */
  const done = $('#booking-done');
  const submitBtn = $('button[type="submit"]', form);

  form.addEventListener('submit', async e => {
    e.preventDefault();
    if (!validate(true)) return;

    const q = quote();
    const code = 'MA-' + new Date().getFullYear().toString().slice(2) + Math.floor(10000 + Math.random() * 90000);
    const data = {
      codigo: code,
      habitacion: q.room.name,
      llegada: state.checkIn, salida: state.checkOut, noches: q.n,
      huespedes: state.guests,
      residencia: state.residency === 'EXT' ? 'Extranjero no domiciliado' : 'Residente en Perú',
      total_soles: q.total.toFixed(2), igv_soles: q.igv.toFixed(2),
      nombres: f.firstName.value.trim(), apellidos: f.lastName.value.trim(),
      documento: `${f.docType.value} ${f.docNumber.value.trim()}`,
      celular: `+${f.countryCode.value} ${f.phone.value.trim()}`,
      email: f.email.value.trim(),
      hora_llegada: f.arrival.value, notas: f.notes.value.trim(),
      acepta_publicidad: f.marketing.checked ? 'Sí' : 'No'
    };

    if (CONFIG.formEndpoint) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Enviando…';
      try {
        const res = await fetch(CONFIG.formEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify(data)
        });
        if (!res.ok) throw new Error(res.status);
      } catch (err) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Solicitar reserva';
        showError('No pudimos enviar tu solicitud. Revisa tu conexión o usa el botón «Reservar por WhatsApp».');
        return;
      }
    }

    $('#d-code').textContent = 'Solicitud ' + code;
    $('#d-title').textContent = `Gracias, ${data.nombres.split(' ')[0]}. Recibimos tu solicitud`;
    $('#d-text').textContent = `${q.room.name}, del ${fmtDate(state.checkIn)} al ${fmtDate(state.checkOut)} (${q.n} ${q.n === 1 ? 'noche' : 'noches'}) para ${state.guests} huésped(es). Total: ${fmtPEN.format(q.total)}${q.exempt ? ', exonerado de IGV' : ', IGV incluido'}.`;
    $('#d-mail').textContent = `Te confirmaremos en menos de dos horas a ${data.email} o por WhatsApp.`;
    $('#d-wa').href = waMessage(code);

    form.hidden = true;
    done.hidden = false;
    done.focus();
    scrollToEl(done);
  });

  $('#d-reset').addEventListener('click', () => {
    form.reset();
    Object.assign(state, { checkIn: '', checkOut: '', guests: '2', room: 'horizonte', residency: 'PE' });
    $$('[data-sync]').forEach(el => { el.value = state[el.dataset.sync]; });
    $('#igv-hint').textContent = 'Las tarifas incluyen IGV (18 %).';
    submitBtn.disabled = false;
    submitBtn.textContent = 'Solicitar reserva';
    done.hidden = true;
    form.hidden = false;
    hideError();
    render();
    f.room.focus();
  });

  setCurrency(state.currency);
})();
