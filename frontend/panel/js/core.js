/* ==========================================================
   MAREA ALTA · PANEL — Núcleo: sesión, API, router y utilidades
   ========================================================== */
(function () {
  'use strict';
  const API = window.MareaAPI;
  const CLAVE = 'ma-panel-sesion';

  /* ---------------- Sesión ---------------- */
  const sesion = {
    get() {
      try {
        const s = JSON.parse(sessionStorage.getItem(CLAVE) || 'null');
        return s && s.refreshExpira > Date.now() ? s : null;
      } catch (e) { return null; }
    },
    guardar(tokenResp, usuario) {
      const actual = this.get() || {};
      const s = {
        token: tokenResp ? tokenResp.accessToken : actual.token,
        expira: tokenResp ? Date.now() + (tokenResp.expiresIn - 60) * 1000 : actual.expira,
        refresh: tokenResp ? tokenResp.refreshToken : actual.refresh,
        refreshExpira: tokenResp ? Date.now() + 11.5 * 3600 * 1000 : actual.refreshExpira,
        usuario: usuario || actual.usuario || null
      };
      try { sessionStorage.setItem(CLAVE, JSON.stringify(s)); } catch (e) { /* sin almacenamiento */ }
      return s;
    },
    cerrar(motivo) {
      try { sessionStorage.removeItem(CLAVE); } catch (e) { /* */ }
      location.href = 'index.html' + (motivo ? '?motivo=' + encodeURIComponent(motivo) : '');
    },
    get usuario() { const s = this.get(); return s && s.usuario; },
    get esAdmin() { const u = this.usuario; return !!u && u.rol === 'Administrador'; }
  };

  /* ---------------- API con token (se renueva solo) ---------------- */
  let renovando = null;
  function renovar() {
    const s = sesion.get();
    if (!s || !s.refresh) return Promise.reject(new Error('Sin sesión'));
    if (!renovando) {
      renovando = API.request('/auth/renovar', { method: 'POST', body: { refreshToken: s.refresh } })
        .then(t => { sesion.guardar(t, null); })
        .finally(() => { renovando = null; });
    }
    return renovando;
  }

  async function api(path, { method = 'GET', body } = {}) {
    let s = sesion.get();
    // Renueva el token si vence en menos de 5 minutos (el empleado sigue trabajando)
    if (s && !path.startsWith('/auth/') && s.expira - Date.now() < 5 * 60 * 1000) {
      try { await renovar(); s = sesion.get(); } catch (e) { sesion.cerrar('expirada'); throw e; }
    }
    try {
      return await API.request(path, { method, body, headers: s ? { Authorization: 'Bearer ' + s.token } : {} });
    } catch (err) {
      if (err.status === 401 && !path.startsWith('/auth/login')) { sesion.cerrar('expirada'); }
      if (err.status === 403) err.message = 'No tienes permiso para esta acción.';
      throw err;
    }
  }

  /* ---------------- Accesibilidad automática ----------------
     · Asocia cada .form-label con su campo (for/id) aunque la vista no lo haga.
     · Las tablas con desplazamiento horizontal reciben foco de teclado.      */
  let idSeq = 0;
  function accesible(root) {
    if (!root || !root.querySelectorAll) return;
    root.querySelectorAll('label.form-label:not([for])').forEach(l => {
      const cont = l.parentElement;
      const campo = cont && cont.querySelector('input:not([type=hidden]):not([type=checkbox]):not([type=radio]), select, textarea');
      if (!campo) return;
      if (!campo.id) campo.id = 'f' + (++idSeq);
      l.htmlFor = campo.id;
    });
    // En celular, las tablas se muestran como tarjetas: cada celda lleva su encabezado
    root.querySelectorAll('table.table-x').forEach(tb => {
      const ths = Array.from(tb.querySelectorAll('thead th')).map(th => th.textContent.trim());
      if (!ths.length) return;
      tb.classList.add('stack');
      tb.querySelectorAll('tbody tr').forEach(tr => Array.from(tr.children).forEach((td, i) => {
        if (!td.hasAttribute('data-label')) td.setAttribute('data-label', ths[i] || '');
      }));
    });
    root.querySelectorAll('.table-responsive:not([tabindex])').forEach(t => {
      t.tabIndex = 0;
      t.setAttribute('role', 'region');
      const card = t.closest('.card-x');
      const titulo = card && card.querySelector('h2');
      t.setAttribute('aria-label', titulo ? titulo.textContent.trim() : 'Tabla');
    });
  }
  new MutationObserver(muts => muts.forEach(m => m.addedNodes.forEach(n => { if (n.nodeType === 1) accesible(n.parentElement || n); })))
    .observe(document.documentElement, { childList: true, subtree: true });

  /* ---------------- Formato ---------------- */
  const nf2 = new Intl.NumberFormat('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const nf0 = new Intl.NumberFormat('es-PE', { maximumFractionDigits: 0 });
  const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  const MESES_L = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  const DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
  const fmt = {
    S: n => 'S/ ' + nf2.format(Number(n || 0)),
    S0: n => 'S/ ' + nf0.format(Number(n || 0)),
    n: n => nf0.format(Number(n || 0)),
    pct: (n, d = 0) => (Number(n || 0) * 100).toFixed(d) + ' %',
    fecha(iso, anio = true) {
      if (!iso) return '—';
      const [y, m, d] = String(iso).slice(0, 10).split('-');
      return `${Number(d)} ${MESES[Number(m) - 1]}${anio ? ' ' + y : ''}`;
    },
    fechaDia(iso) {
      if (!iso) return '—';
      const dt = new Date(String(iso).slice(0, 10) + 'T12:00:00');
      return `${DIAS[dt.getDay()]} ${dt.getDate()} ${MESES[dt.getMonth()]}`;
    },
    fechaHora(iso) {
      if (!iso) return '—';
      const d = new Date(iso);
      return `${d.getDate()} ${MESES[d.getMonth()]} ${d.getFullYear()}, ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    },
    mes(yyyyMm, corto = true) { const [y, m] = yyyyMm.split('-'); return corto ? `${MESES[Number(m) - 1]} ${y.slice(2)}` : `${MESES_L[Number(m) - 1]} ${y}`; },
    iniciales: n => String(n || '?').split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0].toUpperCase()).join('')
  };
  const hoyLima = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Lima' });
  const sumarDias = (iso, n) => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /* ---------------- Estados ---------------- */
  const ESTADOS = {
    Confirmada: ['Confirmada', 'b-info'], CheckIn: ['En el hotel', 'b-ok'], CheckOut: ['Finalizada', 'b-muted'],
    Cancelada: ['Cancelada', 'b-bad'], NoShow: ['No show', 'b-bad'],
    Aprobado: ['Aprobado', 'b-ok'], Anulado: ['Anulado', 'b-bad'],
    Pendiente: ['Pendiente', 'b-warn'], Respondido: ['Respondido', 'b-ok'],
    Operativa: ['Operativa', 'b-ok'], Mantenimiento: ['Mantenimiento', 'b-warn'], FueraDeServicio: ['Fuera de servicio', 'b-bad'],
    Limpia: ['Limpia', 'b-ok'], Sucia: ['Sucia', 'b-warn'],
    Administrador: ['Administrador', 'b-gold'], Recepcionista: ['Recepcionista', 'b-info']
  };
  const badge = e => { const [t, c] = ESTADOS[e] || [e, 'b-muted']; return `<span class="badge-x ${c}">${esc(t)}</span>`; };
  const CANALES = { Web: 'Web', WhatsApp: 'WhatsApp', Telefono: 'Teléfono', Recepcion: 'Recepción' };

  /* ---------------- UI ---------------- */
  function toast(msg, tipo = 'ok') {
    const iconos = { ok: 'check-circle', error: 'exclamation-octagon', warn: 'exclamation-triangle' };
    const el = document.createElement('div');
    el.className = `toast t-${tipo}`;
    el.setAttribute('role', tipo === 'error' ? 'alert' : 'status');
    el.innerHTML = `<div class="d-flex"><div class="toast-body"><i class="bi bi-${iconos[tipo]}"></i><span></span></div>
      <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Cerrar"></button></div>`;
    el.querySelector('span').textContent = msg;
    document.getElementById('toasts').appendChild(el);
    const t = new bootstrap.Toast(el, { delay: tipo === 'error' ? 7000 : 4500 });
    el.addEventListener('hidden.bs.toast', () => el.remove());
    t.show();
  }

  function modal({ titulo, cuerpo, pie = '', tam = '' }) {
    const dlg = document.getElementById('modal-dialog');
    dlg.className = 'modal-dialog modal-dialog-centered modal-dialog-scrollable' + (tam ? ' modal-' + tam : '');
    document.getElementById('modal-content').innerHTML = `
      <div class="modal-header"><h2 class="modal-title" id="modal-title">${titulo}</h2>
        <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Cerrar"></button></div>
      <div class="modal-body">${cuerpo}</div>
      ${pie ? `<div class="modal-footer">${pie}</div>` : ''}`;
    // Si el modal es solo de lectura (sin campos), su contenido desplazable debe poder recorrerse con el teclado
    const cuerpoEl = document.querySelector('#modal-content .modal-body');
    if (!cuerpoEl.querySelector('input, select, textarea, button, a[href]')) { cuerpoEl.tabIndex = 0; cuerpoEl.setAttribute('aria-label', 'Contenido'); }
    const el = document.getElementById('modal');
    const bs = bootstrap.Modal.getOrCreateInstance(el);
    bs.show();
    return { el: document.getElementById('modal-content'), cerrar: () => bs.hide() };
  }

  function confirmar({ titulo = '¿Confirmar?', texto = '', boton = 'Confirmar', peligro = false }) {
    return new Promise(resolve => {
      let ok = false;
      const m = modal({
        titulo, cuerpo: `<p class="mb-0">${texto}</p>`,
        pie: `<button type="button" class="btn btn-light" data-bs-dismiss="modal">Volver</button>
              <button type="button" class="btn ${peligro ? 'btn-danger' : 'btn-primary'}" id="confirm-ok">${boton}</button>`
      });
      m.el.querySelector('#confirm-ok').addEventListener('click', () => { ok = true; m.cerrar(); });
      document.getElementById('modal').addEventListener('hidden.bs.modal', () => resolve(ok), { once: true });
    });
  }

  function drawer(titulo, html) {
    document.getElementById('drawer-title').innerHTML = titulo;
    document.getElementById('drawer-body').innerHTML = html;
    const bs = bootstrap.Offcanvas.getOrCreateInstance(document.getElementById('drawer'));
    bs.show();
    return { el: document.getElementById('drawer-body'), cerrar: () => bs.hide() };
  }

  /* Formularios: lee valores y muestra errores por campo */
  function leerForm(form) {
    const o = {};
    form.querySelectorAll('[name]').forEach(el => {
      if (el.type === 'checkbox') o[el.name] = el.checked;
      else if (el.type === 'radio') { if (el.checked) o[el.name] = el.value; }
      else if (el.type === 'number') o[el.name] = el.value === '' ? null : Number(el.value);
      else o[el.name] = el.value.trim();
    });
    return o;
  }
  function limpiarErrores(form) {
    form.querySelectorAll('.is-invalid').forEach(el => el.classList.remove('is-invalid'));
    form.querySelectorAll('.invalid-feedback.dyn').forEach(el => el.remove());
    const a = form.querySelector('.form-alert'); if (a) a.hidden = true;
  }
  function errorForm(form, err) {
    limpiarErrores(form);
    const campo = err.campo && form.querySelector(`[name="${err.campo}"], [data-campo="${err.campo}"]`);
    if (campo) {
      campo.classList.add('is-invalid');
      const fb = document.createElement('div');
      fb.className = 'invalid-feedback dyn';
      fb.textContent = err.message;
      (campo.closest('.input-group') || campo).after(fb);
      campo.focus();
    } else {
      const a = form.querySelector('.form-alert');
      if (a) { a.textContent = err.message; a.hidden = false; } else toast(err.message, 'error');
    }
  }
  async function enviando(boton, fn) {
    const html = boton.innerHTML;
    boton.disabled = true;
    boton.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Guardando…';
    try { return await fn(); } finally { boton.disabled = false; boton.innerHTML = html; }
  }

  function csv(nombre, filas) {
    const txt = filas.map(f => f.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(';')).join('\r\n');
    const url = URL.createObjectURL(new Blob(['\ufeff' + txt], { type: 'text/csv;charset=utf-8' }));
    const a = Object.assign(document.createElement('a'), { href: url, download: nombre });
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const vacio = (texto, icono = 'inbox') => `<div class="empty"><i class="bi bi-${icono}"></i>${esc(texto)}</div>`;

  /* ---------------- Gráficos (Chart.js) ---------------- */
  let graficos = [];
  const COLORES = ['#12303A', '#B08D57', '#4F8A8B', '#D9A066', '#8C9A90', '#A2321A', '#6F8A91'];
  function grafico(canvas, config) {
    if (!window.Chart || !canvas) return null;
    const c = new Chart(canvas, config);
    graficos.push(c);
    return c;
  }
  function limpiarGraficos() { graficos.forEach(g => g.destroy()); graficos = []; }
  function configurarChart() {
    if (!window.Chart) return;
    Chart.defaults.font.family = 'Jost, "Segoe UI", system-ui, sans-serif';
    Chart.defaults.color = '#66706C';
    Chart.defaults.borderColor = '#ECEAE4';
    Chart.defaults.plugins.legend.labels.boxWidth = 10;
    Chart.defaults.plugins.legend.labels.usePointStyle = true;
    Chart.defaults.plugins.tooltip.backgroundColor = '#0C222A';
    Chart.defaults.plugins.tooltip.padding = 10;
    Chart.defaults.maintainAspectRatio = false;
  }

  /* ---------------- Router ---------------- */
  const rutas = {};
  function ruta(nombre, def) { rutas[nombre] = def; }

  async function navegar() {
    const partes = (location.hash.replace(/^#\/?/, '') || 'dashboard').split('/');
    const nombre = partes[0];
    const def = rutas[nombre] || rutas.dashboard;
    const vista = document.getElementById('vista');
    if (def.rol && !(sesion.usuario && sesion.usuario.rol === def.rol)) {
      vista.innerHTML = `<div class="card-x">${vacio('Esta sección es solo para administradores.', 'shield-lock')}</div>`;
      return;
    }
    limpiarGraficos();
    // Al cambiar de sección se cierran la ficha lateral y los modales abiertos
    const dr = bootstrap.Offcanvas.getInstance(document.getElementById('drawer'));
    if (dr) dr.hide();
    const md = bootstrap.Modal.getInstance(document.getElementById('modal'));
    if (md) md.hide();
    const br = document.getElementById('buscador-res');
    if (br && !br.hidden) { br.hidden = true; document.getElementById('buscador').value = ''; }
    document.querySelectorAll('#side-nav a').forEach(a => a.classList.toggle('active', a.dataset.route === nombre));
    document.getElementById('crumb').textContent = def.titulo;
    document.title = def.titulo + ' · Panel Marea Alta';
    document.getElementById('sidebar').classList.remove('open');
    vista.innerHTML = '<div class="loading-overlay"><div class="spinner-border text-secondary" role="status"><span class="visually-hidden">Cargando…</span></div></div>';
    try {
      await def.render(vista, partes.slice(1));
    } catch (err) {
      vista.innerHTML = `<div class="card-x">${vacio(err.message || 'No se pudo cargar la sección.', 'wifi-off')}
        <div class="text-center"><button class="btn btn-light" onclick="location.reload()"><i class="bi bi-arrow-clockwise"></i> Reintentar</button></div></div>`;
    }
    vista.focus({ preventScroll: true });
    window.scrollTo(0, 0);
    actualizarAlertas();
  }

  /* ---------------- Alertas operativas (campana) ---------------- */
  async function actualizarAlertas() {
    const lista = document.getElementById('alertas-lista');
    if (!lista) return;
    try {
      const [rec, recl] = await Promise.all([api('/gestion/recepcion'), api('/gestion/reclamaciones?estado=Pendiente')]);
      const hoy = hoyLima();
      const vencidos = recl.filter(r => r.fechaLimiteRespuesta < hoy).length;
      const salidasSaldo = rec.salidas.filter(r => r.saldo > 0.009).length;
      const items = [
        [rec.llegadas.length, 'box-arrow-in-right', 'b-info', `${rec.llegadas.length} llegada(s) pendientes de check-in`, '#/recepcion'],
        [rec.salidas.length, 'box-arrow-right', 'b-warn', `${rec.salidas.length} salida(s) de hoy${salidasSaldo ? `, ${salidasSaldo} con saldo` : ''}`, '#/recepcion'],
        [rec.limpieza.length, 'stars', 'b-warn', `${rec.limpieza.length} habitación(es) por limpiar`, '#/habitaciones'],
        [vencidos, 'exclamation-octagon', 'b-bad', `${vencidos} reclamo(s) con plazo vencido`, '#/reclamaciones'],
        [recl.length - vencidos, 'journal-text', 'b-gold', `${recl.length - vencidos} reclamo(s) por responder`, '#/reclamaciones']
      ].filter(x => x[0] > 0);
      const total = items.reduce((a, x) => a + x[0], 0);
      const badgeEl = document.getElementById('alertas-n');
      badgeEl.textContent = total > 99 ? '99+' : total;
      badgeEl.hidden = !total;
      document.getElementById('alertas-btn').setAttribute('aria-label', total ? `Alertas: ${total} pendientes` : 'Alertas: nada pendiente');
      lista.innerHTML = items.length
        ? items.map(([, ic, tono, txt, href]) => `<a class="dropdown-item alerta" href="${href}"><span class="badge-x ${tono} p-2"><i class="bi bi-${ic}"></i></span><span>${esc(txt)}</span></a>`).join('')
        : '<div class="px-3 py-3 text-muted small"><i class="bi bi-check2-circle text-success"></i> Todo al día. No hay pendientes.</div>';
      const nav = document.getElementById('nav-reclamos');
      if (nav) { nav.textContent = recl.length; nav.hidden = !recl.length; }
    } catch (e) { /* las alertas no deben interrumpir el trabajo */ }
  }

  /* ---------------- Buscador global (tecla /) ---------------- */
  function iniciarBuscador() {
    const input = document.getElementById('buscador');
    const caja = document.getElementById('buscador-res');
    let t, items = [];
    const cerrar = () => { caja.hidden = true; input.setAttribute('aria-expanded', 'false'); };
    const pintar = (reservas, clientes, q) => {
      items = [];
      const bloque = (titulo, filas) => filas.length ? `<div class="sr-group">${titulo}</div>` + filas.join('') : '';
      const fr = reservas.map(r => { items.push({ tipo: 'r', v: r.codigo }); return `<button type="button" class="sr-item" data-i="${items.length - 1}" role="option">
        <i class="bi bi-calendar-check"></i><span><strong class="code">${esc(r.codigo)}</strong> · ${esc(r.cliente)}<small>${esc(r.habitacion)} · ${fmt.fechaDia(r.fechaEntrada)} → ${fmt.fechaDia(r.fechaSalida)}</small></span>${badge(r.estado)}</button>`; });
      const fc = clientes.map(c => { items.push({ tipo: 'c', v: c.id }); return `<button type="button" class="sr-item" data-i="${items.length - 1}" role="option">
        <i class="bi bi-person"></i><span><strong>${esc(c.nombres)} ${esc(c.apellidos)}</strong><small>${esc(c.tipoDocumento)} ${esc(c.numeroDocumento)} · ${esc(c.email)}</small></span></button>`; });
      caja.innerHTML = (bloque('Reservas', fr) + bloque('Clientes', fc)) || `<div class="p-3 small text-muted">Sin resultados para «${esc(q)}».</div>`;
      caja.hidden = false;
      input.setAttribute('aria-expanded', 'true');
    };
    const abrir = i => {
      const it = items[i]; if (!it) return;
      cerrar(); input.value = ''; input.blur();
      if (it.tipo === 'r') window.Panel.verReserva(it.v); else location.hash = '#/clientes/' + it.v;
    };
    input.addEventListener('input', () => {
      clearTimeout(t);
      const q = input.value.trim();
      if (q.length < 2) { cerrar(); return; }
      t = setTimeout(async () => {
        try {
          const [r, c] = await Promise.all([api('/gestion/reservas?limite=5&buscar=' + encodeURIComponent(q)), api('/gestion/clientes?limite=5&buscar=' + encodeURIComponent(q))]);
          if (input.value.trim() === q) pintar(r, c, q);
        } catch (e) { /* */ }
      }, 250);
    });
    input.addEventListener('keydown', e => {
      if (e.key === 'Escape') { cerrar(); input.blur(); }
      if (e.key === 'Enter') { e.preventDefault(); abrir(0); }
      if (e.key === 'ArrowDown') { const b = caja.querySelector('.sr-item'); if (b) { e.preventDefault(); b.focus(); } }
    });
    caja.addEventListener('click', e => { const b = e.target.closest('.sr-item'); if (b) abrir(Number(b.dataset.i)); });
    caja.addEventListener('keydown', e => {
      const bs = Array.from(caja.querySelectorAll('.sr-item')); const i = bs.indexOf(document.activeElement);
      if (e.key === 'ArrowDown' && i < bs.length - 1) { e.preventDefault(); bs[i + 1].focus(); }
      if (e.key === 'ArrowUp') { e.preventDefault(); (i > 0 ? bs[i - 1] : input).focus(); }
      if (e.key === 'Escape') { cerrar(); input.focus(); }
    });
    document.addEventListener('click', e => { if (!e.target.closest('.buscador')) cerrar(); });
    document.addEventListener('keydown', e => {
      const escribiendo = /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName) || document.activeElement.isContentEditable;
      if (e.key === '/' && !escribiendo && !document.querySelector('.modal.show')) { e.preventDefault(); input.focus(); }
    });
  }

  /* ---------------- Cierre por inactividad ---------------- */
  function iniciarInactividad() {
    const limite = ((window.CONFIG && window.CONFIG.panelInactividadMin) || 30) * 60 * 1000;
    const aviso = 2 * 60 * 1000;
    let ultima = Date.now();
    const banner = document.getElementById('idle-warning');
    const marcar = () => { ultima = Date.now(); if (!banner.hidden) banner.hidden = true; };
    ['mousedown', 'keydown', 'touchstart', 'wheel'].forEach(ev => document.addEventListener(ev, marcar, { passive: true }));
    let movTimer = 0;
    document.addEventListener('mousemove', () => { const n = Date.now(); if (n - movTimer > 5000) { movTimer = n; marcar(); } }, { passive: true });
    document.getElementById('idle-seguir').addEventListener('click', marcar);
    setInterval(() => {
      const quieto = Date.now() - ultima;
      if (quieto >= limite) return sesion.cerrar('inactividad');
      if (quieto >= limite - aviso) {
        const s = Math.ceil((limite - quieto) / 1000);
        document.getElementById('idle-seg').textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
        banner.hidden = false;
      }
    }, 1000);
  }

  /* ---------------- Guía rápida según el rol ---------------- */
  function guia() {
    const admin = sesion.esAdmin;
    const paso = (ic, t, d) => `<div class="guia-paso"><span class="kpi-icon"><i class="bi bi-${ic}"></i></span><div><strong>${t}</strong><p>${d}</p></div></div>`;
    const comun = [
      paso('sunrise', 'Al empezar el turno', 'Abre <b>Recepción</b>: ahí están las llegadas y salidas de hoy, los huéspedes en el hotel y las habitaciones por limpiar. La campana <i class="bi bi-bell"></i> resume lo pendiente.'),
      paso('box-arrow-in-right', 'Check-in', 'En «Llegadas de hoy» pulsa <b>Check-in</b>. Verifica el documento. Si el huésped es extranjero exonerado de IGV, pide su pasaporte y la Tarjeta Andina de Migración.'),
      paso('cash-coin', 'Cobrar', 'En la ficha de la reserva pulsa <b>Registrar pago</b>. Para Yape, Plin o transferencia anota el N.° de operación en «Referencia».'),
      paso('box-arrow-right', 'Check-out', 'Solo con saldo S/ 0.00. La habitación pasa a <b>Por limpiar</b>; cuando esté lista márcala como <b>Limpia</b> en Recepción o en Habitaciones.'),
      paso('telephone', 'Reservas por teléfono y walk-in', 'Usa <b>Reserva telefónica</b> o <b>Walk-in</b> (con check-in inmediato). El sistema asigna la habitación y calcula el total con o sin IGV.'),
      paso('printer', 'Confirmación para el huésped', 'En la ficha de la reserva pulsa <b>Imprimir</b> para entregar o enviar la confirmación en PDF.'),
      paso('search', 'Buscar rápido', 'Pulsa la tecla <kbd>/</kbd> y escribe un código, nombre, documento o correo.'),
      paso('shield-lock', 'Seguridad', `La sesión se cierra tras ${(window.CONFIG && window.CONFIG.panelInactividadMin) || 30} minutos sin actividad. No compartas tu cuenta: cada pago y reserva queda registrado con tu nombre.`)
    ];
    const extra = admin ? [
      paso('bar-chart-line', 'Reportes', 'Ocupación, ADR, RevPAR, canales y cobros por periodo. Exporta a CSV o imprime en PDF.'),
      paso('tags', 'Tarifas y habitaciones', 'Los cambios de tarifa solo afectan a reservas nuevas. Para sacar una habitación de venta usa «Mantenimiento» o «Fuera de servicio».'),
      paso('journal-text', 'Libro de Reclamaciones', 'Responde dentro de 15 días hábiles y envía la respuesta al correo del consumidor.'),
      paso('person-gear', 'Usuarios', 'Crea cuentas con contraseña temporal. Al desactivar a alguien, su sesión se cierra al instante.')
    ] : [];
    modal({ titulo: `Guía rápida · ${admin ? 'Administrador' : 'Recepción'}`, tam: 'lg',
      cuerpo: `<div class="guia">${comun.join('')}${extra.length ? '<h3 class="form-section-title mt-3">Solo administradores</h3>' + extra.join('') : ''}</div>`,
      pie: '<button class="btn btn-primary" data-bs-dismiss="modal">Entendido</button>' });
  }

  function refrescar() { navegar(); }

  /* ---------------- Arranque de la app ---------------- */
  function iniciarApp() {
    const s = sesion.get();
    if (!s) return sesion.cerrar();
    if (s.usuario && s.usuario.debeCambiarClave) return sesion.cerrar('cambiar');
    const u = s.usuario;
    document.getElementById('u-nombre').textContent = u.nombre;
    document.getElementById('u-rol').textContent = u.rol;
    document.getElementById('u-avatar').textContent = fmt.iniciales(u.nombre);
    document.querySelectorAll('[data-rol]').forEach(el => { el.hidden = el.dataset.rol !== u.rol; });
    document.getElementById('logout').addEventListener('click', () => sesion.cerrar('salida'));
    document.getElementById('menu-btn').addEventListener('click', () => document.getElementById('sidebar').classList.toggle('open'));
    const reloj = () => {
      document.getElementById('clock').textContent = new Date().toLocaleString('es-PE', {
        timeZone: 'America/Lima', weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit'
      });
    };
    reloj(); setInterval(reloj, 30000);
    iniciarBuscador();
    iniciarInactividad();
    document.getElementById('ayuda-btn').addEventListener('click', guia);
    setInterval(actualizarAlertas, 120000);
    configurarChart();
    window.addEventListener('hashchange', navegar);
    // Pulsar la sección actual en el menú la recarga (y cierra fichas abiertas)
    document.getElementById('side-nav').addEventListener('click', e => {
      const a = e.target.closest('a[href^="#/"]');
      if (a && a.getAttribute('href') === location.hash) { e.preventDefault(); navegar(); }
    });
    navegar();
  }

  window.Panel = {
    sesion, api, fmt, esc, badge, ESTADOS, CANALES, hoyLima, sumarDias,
    toast, modal, confirmar, drawer, leerForm, errorForm, limpiarErrores, enviando, csv, vacio,
    grafico, COLORES, ruta, navegar, refrescar, iniciarApp, actualizarAlertas
  };
})();
