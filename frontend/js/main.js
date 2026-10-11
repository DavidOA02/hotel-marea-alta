/* ==========================================================
   HOTEL MAREA ALTA · PARACAS — Interacción del sitio
   ========================================================== */

/* La configuración está en js/config.js (window.CONFIG) y el
   cliente de la API en js/api.js (window.MareaAPI). */

(function () {
  'use strict';

  const CONFIG = window.CONFIG;
  const API = window.MareaAPI;
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

  const BS = window.bootstrap;   // Bootstrap 5 (vendor/bootstrap/bootstrap.bundle.min.js)

  // Menú móvil (Offcanvas): cierra el panel y luego navega a la sección
  const menu = $('#menu');
  if (menu && BS) {
    const oc = BS.Offcanvas.getOrCreateInstance(menu);
    $$('a[href^="#"]', menu).forEach(a => a.addEventListener('click', e => {
      e.preventDefault();
      const target = $(a.getAttribute('href'));
      menu.addEventListener('hidden.bs.offcanvas', () => scrollToEl(target), { once: true });
      oc.hide();
    }));
  }

  // Tooltips de Bootstrap
  if (BS) $$('[data-bs-toggle="tooltip"]').forEach(el => new BS.Tooltip(el));

  // Galería: abre el carrusel en la foto elegida
  const galleryCarousel = $('#galleryCarousel');
  if (galleryCarousel && BS) {
    const car = BS.Carousel.getOrCreateInstance(galleryCarousel, { interval: false, ride: false });
    $$('.gallery-item').forEach(btn => btn.addEventListener('click', () => car.to(Number(btn.dataset.index))));
  }

  // Notificación (Bootstrap Toast)
  function toast(msg, icon = 'check-circle') {
    const el = $('#toast');
    if (!el || !BS) return;
    $('#toast-body').innerHTML = `<i class="bi bi-${icon}" aria-hidden="true"></i><span></span>`;
    $('#toast-body span').textContent = msg;
    BS.Toast.getOrCreateInstance(el, { delay: 5000 }).show();
  }

  // Enlaces de WhatsApp con el número configurado
  $$('#wa-float').forEach(a => {
    a.href = `https://wa.me/${CONFIG.whatsapp}?text=${encodeURIComponent('Hola, quisiera información sobre el Hotel Marea Alta.')}`;
  });
  $$('a[data-wa]').forEach(a => { a.href = `https://wa.me/${CONFIG.whatsapp}`; });

  // Boletín
  const nl = $('#newsletter');
  if (nl) {
    nl.addEventListener('submit', e => {
      e.preventDefault();
      const input = $('#nl-mail'), msg = $('#nl-msg');
      if (!EMAIL_RE.test(input.value.trim())) { msg.textContent = 'Escribe un correo válido.'; input.focus(); return; }
      msg.textContent = '';
      const email = input.value.trim();
      API.ready().then(online => online
        ? API.request('/suscriptores', { method: 'POST', body: { email } })
        : null)
        .then(() => { input.value = ''; toast('¡Gracias! Te enviaremos nuestras ofertas exclusivas.', 'envelope-check'); })
        .catch(err => { msg.textContent = err.message; });
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
    currency: store.get('ma-currency') === 'USD' ? 'USD' : 'PEN',
    online: false,          // ¿API disponible?
    avail: null             // { duna: 5, horizonte: 0, ... } habitaciones libres
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
    if (['checkIn', 'checkOut', 'guests'].includes(key)) consultarDisponibilidad();
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

    // Disponibilidad en tiempo real (solo con API)
    const availEl = $('#s-avail');
    const libres = state.avail ? state.avail[state.room] : null;
    availEl.hidden = libres === null || libres === undefined;
    if (!availEl.hidden) {
      availEl.className = 'avail ' + (libres === 0 ? 'avail-none' : libres <= 3 ? 'avail-low' : 'avail-ok');
      availEl.innerHTML = libres === 0
        ? '<i class="bi bi-x-circle"></i> Sin disponibilidad para estas fechas'
        : libres <= 3
          ? `<i class="bi bi-exclamation-circle"></i> ¡Quedan ${libres} ${libres === 1 ? 'habitación' : 'habitaciones'}!`
          : '<i class="bi bi-check-circle"></i> Disponible para tus fechas';
    }
    $$('.room').forEach(card => {
      let tag = $('.room-avail', card);
      const n = state.avail ? state.avail[card.dataset.room] : null;
      if (n === null || n === undefined) { if (tag) tag.remove(); return; }
      if (!tag) { tag = document.createElement('p'); tag.className = 'room-avail'; $('.room-foot', card).before(tag); }
      tag.className = 'room-avail ' + (n === 0 ? 'avail-none' : n <= 3 ? 'avail-low' : 'avail-ok');
      tag.textContent = n === 0 ? 'Agotada en tus fechas' : n <= 3 ? `Quedan ${n} en tus fechas` : 'Disponible en tus fechas';
    });

    $$('.room').forEach(card => {
      const sel = card.dataset.room === state.room;
      card.classList.toggle('is-selected', sel);
      const b = $('.room-pick', card);
      b.textContent = sel ? 'Seleccionada' : 'Reservar';
      b.setAttribute('aria-pressed', String(sel));
    });
  }

  /* ---------- Conexión con la API (backend ASP.NET Core) ---------- */
  async function cargarTipos() {
    try {
      const tipos = await API.request('/habitaciones/tipos');
      tipos.forEach(t => {
        if (!ROOMS[t.codigo]) return;
        Object.assign(ROOMS[t.codigo], { name: t.nombre, price: Number(t.precioNoche), cap: t.capacidad });
        const precio = $(`.room[data-room="${t.codigo}"] [data-price]`);
        if (precio) precio.dataset.price = t.precioNoche;
      });
      setCurrency(state.currency);
    } catch (err) { console.warn('[Marea Alta] No se pudieron cargar las tarifas:', err.message); }
  }

  let dispTimer = null;
  function consultarDisponibilidad() {
    clearTimeout(dispTimer);
    if (!state.online || !nights()) { if (state.avail) { state.avail = null; render(); } return; }
    dispTimer = setTimeout(async () => {
      try {
        const qs = new URLSearchParams({ entrada: state.checkIn, salida: state.checkOut, huespedes: state.guests });
        const lista = await API.request('/disponibilidad?' + qs);
        state.avail = Object.fromEntries(lista.map(x => [x.codigo, x.disponibles]));
      } catch (err) {
        state.avail = null;
      }
      render();
    }, 250);
  }

  API.ready().then(online => {
    state.online = online;
    $('#api-badge').hidden = !online;
    if (online) {
      $('#booking button[type="submit"]').textContent = 'Reservar ahora';
      cargarTipos();
      consultarDisponibilidad();
    }
  });

  /* ---------- Validación (estilo Bootstrap: .is-invalid + .invalid-feedback) ---------- */
  const errorBox = $('#form-error');
  function clearInvalid(el) {
    const list = el ? [el] : $$('#booking .is-invalid');
    list.forEach(f => {
      f.classList.remove('is-invalid');
      f.removeAttribute('aria-invalid');
      const fb = f.dataset.fb && document.getElementById(f.dataset.fb);
      if (fb) fb.textContent = '';
    });
  }
  function feedbackFor(field) {
    if (field.dataset.fb) return document.getElementById(field.dataset.fb);
    const box = field.closest('.form-check') || field.closest('.field');
    const fb = document.createElement('div');
    fb.className = 'invalid-feedback';
    fb.id = 'fb-' + (field.id || field.name);
    box.appendChild(fb);
    field.dataset.fb = fb.id;
    field.setAttribute('aria-describedby', fb.id);
    return fb;
  }
  function showError(msg, field) {
    clearInvalid();
    if (field) {
      errorBox.hidden = true;
      feedbackFor(field).textContent = msg;
      field.classList.add('is-invalid');
      field.setAttribute('aria-invalid', 'true');
      field.focus();
    } else {
      errorBox.textContent = msg;
      errorBox.hidden = false;
    }
    return false;
  }
  function hideError() { errorBox.hidden = true; clearInvalid(); }
  form.addEventListener('input', e => { if (e.target.classList.contains('is-invalid')) clearInvalid(e.target); });
  form.addEventListener('change', e => { if (e.target.classList.contains('is-invalid')) clearInvalid(e.target); });

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

    // --- Con backend: la API valida, asigna habitación y calcula el total ---
    if (state.online) {
      if (state.avail && state.avail[state.room] === 0)
        return showError('No quedan habitaciones de este tipo para tus fechas. Elige otro tipo o cambia las fechas.', f.room);
      submitBtn.disabled = true;
      submitBtn.textContent = 'Reservando…';
      try {
        const r = await API.request('/reservas', { method: 'POST', body: {
          tipoHabitacion: state.room,
          fechaEntrada: state.checkIn, fechaSalida: state.checkOut,
          huespedes: Number(state.guests),
          residencia: state.residency,
          nombres: data.nombres, apellidos: data.apellidos,
          tipoDocumento: f.docType.value, numeroDocumento: f.docNumber.value.trim(),
          codigoPais: f.countryCode.value, telefono: f.phone.value.replace(/\D/g, ''),
          email: data.email,
          horaLlegada: f.arrival.value || null, notas: data.notas || null,
          aceptaPrivacidad: f.privacy.checked, aceptaPublicidad: f.marketing.checked,
          canal: 'Web'
        } });
        ultimaReserva = {
          codigo: r.codigo, estado: r.estado, titular: `${data.nombres} ${data.apellidos}`, documento: data.documento,
          tipoHabitacion: r.tipoHabitacion, habitacion: r.habitacion, fechaEntrada: r.fechaEntrada, fechaSalida: r.fechaSalida,
          noches: r.noches, huespedes: r.huespedes, subtotal: r.subtotal, igv: r.igv, total: r.total, exoneradoIgv: r.exoneradoIgv
        };
        mostrarConfirmacion({
          codigo: r.codigo, confirmada: true,
          titulo: `¡Listo, ${data.nombres.split(' ')[0]}! Tu reserva está confirmada`,
          texto: `${r.tipoHabitacion} N.° ${r.habitacion}, del ${fmtDate(r.fechaEntrada)} al ${fmtDate(r.fechaSalida)} (${r.noches} ${r.noches === 1 ? 'noche' : 'noches'}) para ${r.huespedes} huésped(es). Total: ${fmtPEN.format(r.total)}${r.exoneradoIgv ? ', exonerado de IGV' : ', IGV incluido'}. Pagas al llegar.`,
          mail: `Guarda tu código. Puedes consultar o cancelar tu reserva (hasta 72 h antes) en «Mi reserva».`
        });
      } catch (err) {
        const campos = {
          fechaEntrada: f.checkIn, fechaSalida: f.checkOut, huespedes: f.guests, tipoHabitacion: f.room,
          nombres: f.firstName, apellidos: f.lastName, tipoDocumento: f.docType, numeroDocumento: f.docNumber,
          telefono: f.phone, codigoPais: f.countryCode, email: f.email, aceptaPrivacidad: f.privacy
        };
        showError(err.message, campos[err.campo] || null);
        if (err.status === 409) consultarDisponibilidad();
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Reservar ahora';
      }
      return;
    }

    // --- Sin backend: Formspree (si está configurado) o modo demostración ---
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

    mostrarConfirmacion({
      codigo: code, confirmada: false,
      titulo: `Gracias, ${data.nombres.split(' ')[0]}. Recibimos tu solicitud`,
      texto: `${q.room.name}, del ${fmtDate(state.checkIn)} al ${fmtDate(state.checkOut)} (${q.n} ${q.n === 1 ? 'noche' : 'noches'}) para ${state.guests} huésped(es). Total: ${fmtPEN.format(q.total)}${q.exempt ? ', exonerado de IGV' : ', IGV incluido'}.`,
      mail: `Te confirmaremos en menos de dos horas a ${data.email} o por WhatsApp.`
    });
  });

  let ultimaReserva = null;
  $('#d-print').addEventListener('click', () => ultimaReserva && window.MareaComprobante && window.MareaComprobante.imprimir(ultimaReserva));

  function mostrarConfirmacion({ codigo, confirmada, titulo, texto, mail }) {
    $('#d-print').hidden = !confirmada;
    $('#d-code').textContent = (confirmada ? 'Código de reserva ' : 'Solicitud ') + codigo;
    $('#d-title').textContent = titulo;
    $('#d-text').textContent = texto;
    $('#d-mail').textContent = mail;
    $('#d-wa').href = waMessage(codigo);
    const link = $('#d-mine');
    link.hidden = !confirmada;
    link.href = 'mi-reserva.html?codigo=' + encodeURIComponent(codigo);
    form.hidden = true;
    done.hidden = false;
    done.focus();
    scrollToEl(done);
  }

  $('#d-reset').addEventListener('click', () => {
    form.reset();
    Object.assign(state, { checkIn: '', checkOut: '', guests: '2', room: 'horizonte', residency: 'PE' });
    $$('[data-sync]').forEach(el => { el.value = state[el.dataset.sync]; });
    $('#igv-hint').textContent = 'Las tarifas incluyen IGV (18 %).';
    submitBtn.disabled = false;
    submitBtn.textContent = state.online ? 'Reservar ahora' : 'Solicitar reserva';
    done.hidden = true;
    form.hidden = false;
    hideError();
    state.avail = null;
    render();
    f.room.focus();
  });

  setCurrency(state.currency);
})();
