/* ==========================================================
   MAREA ALTA · PANEL — Vistas (1/2): dashboard, recepción,
   reservas y habitaciones. Acciones compartidas de reservas.
   ========================================================== */
(function () {
  'use strict';
  const P = window.Panel;
  const { fmt, esc, badge, api } = P;
  const $ = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));

  const cabecera = (titulo, sub, acciones = '') => `
    <div class="page-head"><div><h1>${titulo}</h1>${sub ? `<p>${sub}</p>` : ''}</div>
    <div class="page-actions">${acciones}</div></div>`;
  const kpi = (icono, tono, etiqueta, valor, sub = '', extra = '') => `
    <div class="kpi"><div class="kpi-icon ${tono}"><i class="bi bi-${icono}"></i></div>
    <div class="flex-grow-1 min-w-0"><div class="kpi-label">${etiqueta}</div><div class="kpi-value">${valor}</div>
    ${sub ? `<div class="kpi-sub">${sub}</div>` : ''}${extra}</div></div>`;
  P.cabecera = cabecera;
  P.kpi = kpi;

  /* =========================================================
     ACCIONES COMPARTIDAS: ficha de reserva, pagos, estados
     ========================================================= */
  async function verReserva(codigo) {
    const d = P.drawer(`Reserva <span class="code">${esc(codigo)}</span>`, '<div class="loading-overlay"><div class="spinner-border text-secondary"></div></div>');
    try {
      const { reserva: r, pagos } = await api('/gestion/reservas/' + encodeURIComponent(codigo));
      const hoy = P.hoyLima();
      const acciones = [];
      if (r.estado === 'Confirmada' && r.fechaEntrada <= hoy) acciones.push(`<button class="btn btn-success" data-acc="checkin"><i class="bi bi-box-arrow-in-right"></i> Check-in</button>`);
      if (r.estado === 'CheckIn') acciones.push(`<button class="btn btn-primary" data-acc="checkout"><i class="bi bi-box-arrow-right"></i> Check-out</button>`);
      if (r.saldo > 0.009 && !['Cancelada', 'NoShow'].includes(r.estado)) acciones.push(`<button class="btn btn-gold" data-acc="pago"><i class="bi bi-cash-coin"></i> Registrar pago</button>`);
      if (r.estado === 'Confirmada') acciones.push(`<button class="btn btn-light text-danger" data-acc="cancelar"><i class="bi bi-x-circle"></i> Cancelar</button>`);
      if (r.estado === 'Confirmada' && r.fechaEntrada <= hoy) acciones.push(`<button class="btn btn-light" data-acc="noshow"><i class="bi bi-person-x"></i> No show</button>`);
      if (!['Cancelada', 'NoShow'].includes(r.estado)) acciones.push(`<button class="btn btn-light" data-acc="imprimir" title="Confirmación para el huésped"><i class="bi bi-printer"></i> Imprimir</button>`);

      const hitos = [`<li>Reservada el ${fmt.fechaHora(r.fechaReserva)} · ${esc(P.CANALES[r.canal] || r.canal)}${r.registradoPor ? ' por ' + esc(r.registradoPor) : ''}</li>`];
      if (r.fechaCheckIn) hitos.push(`<li>Check-in: ${fmt.fechaHora(r.fechaCheckIn)}</li>`);
      if (r.fechaCheckOut) hitos.push(`<li>Check-out: ${fmt.fechaHora(r.fechaCheckOut)}</li>`);

      d.el.innerHTML = `
        <div class="d-flex justify-content-between align-items-start mb-3">
          <div><div class="fs-5 fw-medium">${esc(r.cliente)}</div><div class="text-muted small">${esc(r.documento)} · ${esc(r.residencia === 'EXT' ? 'Extranjero' : 'Residente')}</div></div>
          ${badge(r.estado)}
        </div>
        ${acciones.length ? `<div class="d-flex flex-wrap gap-2 mb-4">${acciones.join('')}</div>` : ''}
        <dl class="dl-grid mb-4">
          <div><dt>Habitación</dt><dd>${esc(r.habitacion)} · ${esc(r.tipoHabitacion)}</dd></div>
          <div><dt>Huéspedes</dt><dd>${r.huespedes}</dd></div>
          <div><dt>Llegada</dt><dd>${fmt.fechaDia(r.fechaEntrada)}${r.horaLlegada ? ' · ' + esc(r.horaLlegada) : ''}</dd></div>
          <div><dt>Salida</dt><dd>${fmt.fechaDia(r.fechaSalida)} (${r.noches} ${r.noches === 1 ? 'noche' : 'noches'})</dd></div>
          <div><dt>Correo</dt><dd><a href="mailto:${esc(r.email)}">${esc(r.email)}</a></dd></div>
          <div><dt>Teléfono</dt><dd><a href="https://wa.me/${esc(r.telefono.replace(/\D/g, ''))}" target="_blank" rel="noopener"><i class="bi bi-whatsapp"></i> ${esc(r.telefono)}</a></dd></div>
          ${r.notas ? `<div class="full"><dt>Notas</dt><dd class="fw-normal">${esc(r.notas)}</dd></div>` : ''}
        </dl>
        <div class="money-box mb-4">
          <div class="row-m"><span>Valor de venta</span><span>${fmt.S(r.subtotal)}</span></div>
          <div class="row-m"><span>IGV 18 %</span><span>${r.exoneradoIgv ? 'Exonerado' : fmt.S(r.igv)}</span></div>
          <div class="row-m total"><span>Total</span><span>${fmt.S(r.total)}</span></div>
          <div class="row-m"><span>Pagado</span><span>${fmt.S(r.pagado)}</span></div>
          <div class="row-m fw-medium ${r.saldo > 0.009 ? 'debt' : ''}"><span>Saldo</span><span>${fmt.S(r.saldo)}</span></div>
        </div>
        <h3 class="form-section-title">Pagos</h3>
        ${pagos.length ? `<div class="table-responsive mb-4"><table class="table table-x"><tbody>${pagos.map(p => `
          <tr><td>${fmt.fechaHora(p.fechaPago)}<span class="sub">${esc(p.metodo)}${p.referencia ? ' · ' + esc(p.referencia) : ''}</span></td>
          <td class="money">${p.moneda === 'USD' ? `US$ ${p.monto.toFixed(2)}<span class="sub">${fmt.S(p.montoSoles)}</span>` : fmt.S(p.montoSoles)}</td>
          <td class="text-end">${badge(p.estado)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="text-muted small mb-4">Sin pagos registrados.</p>'}
        <h3 class="form-section-title">Historial</h3>
        <ul class="timeline">${hitos.join('')}</ul>
        <a class="btn btn-light btn-sm mt-3" href="#/clientes/${r.clienteId}"><i class="bi bi-person-vcard"></i> Ver ficha del cliente</a>`;

      d.el.querySelectorAll('[data-acc]').forEach(b => b.addEventListener('click', () => accion(b.dataset.acc, r)));
    } catch (err) { d.el.innerHTML = P.vacio(err.message, 'exclamation-triangle'); }
  }

  async function accion(tipo, r) {
    const cod = encodeURIComponent(r.codigo);
    const ejecutar = async (path, body) => {
      try {
        const res = await api(path, { method: 'POST', body: body || {} });
        P.toast(res.mensaje || 'Listo.');
        if (res.advertencia) P.toast(res.advertencia, 'warn');
        P.refrescar();
        verReserva(r.codigo);
        return true;
      } catch (err) { P.toast(err.message, 'error'); return false; }
    };
    if (tipo === 'imprimir') return window.MareaComprobante.imprimir({ ...r, titular: r.cliente });
    if (tipo === 'checkin') return ejecutar(`/gestion/reservas/${cod}/checkin`);
    if (tipo === 'pago') return registrarPago(r);
    if (tipo === 'checkout') {
      if (r.saldo > 0.009) {
        if (!P.sesion.esAdmin) return P.toast(`Hay un saldo pendiente de ${fmt.S(r.saldo)}. Registra el pago antes del check-out.`, 'warn');
        const forzar = await P.confirmar({ titulo: 'Saldo pendiente', texto: `La reserva tiene un saldo de <strong>${fmt.S(r.saldo)}</strong>. ¿Cerrar la estadía de todas formas?`, boton: 'Cerrar con saldo', peligro: true });
        if (!forzar) return;
        return ejecutar(`/gestion/reservas/${cod}/checkout`, { forzarConSaldo: true });
      }
      return ejecutar(`/gestion/reservas/${cod}/checkout`);
    }
    if (tipo === 'cancelar' && await P.confirmar({ titulo: 'Cancelar reserva', texto: `¿Cancelar la reserva <strong>${esc(r.codigo)}</strong> de ${esc(r.cliente)}? La habitación quedará libre.`, boton: 'Cancelar reserva', peligro: true }))
      return ejecutar(`/gestion/reservas/${cod}/cancelar`);
    if (tipo === 'noshow' && await P.confirmar({ titulo: 'No show', texto: `¿Marcar que ${esc(r.cliente)} no se presentó?`, boton: 'Marcar no show', peligro: true }))
      return ejecutar(`/gestion/reservas/${cod}/noshow`);
  }

  function registrarPago(r) {
    const tc = (window.CONFIG && window.CONFIG.tipoCambio) || 3.7;
    const m = P.modal({
      titulo: 'Registrar pago',
      cuerpo: `<form id="f-pago" novalidate>
        <div class="alert alert-danger py-2 small form-alert" hidden></div>
        <p class="text-muted">${esc(r.codigo)} · ${esc(r.cliente)} · Saldo: <strong class="text-dark">${fmt.S(r.saldo)}</strong></p>
        <div class="row g-3">
          <div class="col-sm-6"><label class="form-label" for="p-monto">Monto</label><input class="form-control" id="p-monto" name="monto" type="number" min="0.01" step="0.01" value="${r.saldo.toFixed(2)}" required></div>
          <div class="col-sm-6"><label class="form-label" for="p-moneda">Moneda</label><select class="form-select" id="p-moneda" name="moneda"><option value="PEN">Soles (S/)</option><option value="USD">Dólares (US$)</option></select></div>
          <div class="col-sm-6" id="p-tc-wrap" hidden><label class="form-label" for="p-tc">Tipo de cambio</label><input class="form-control" id="p-tc" name="tipoCambio" type="number" step="0.001" min="1" max="10" value="${tc}"></div>
          <div class="col-sm-6"><label class="form-label">Método</label>
            <div class="chips" role="radiogroup">${['Tarjeta', 'Yape', 'Plin', 'Transferencia', 'Efectivo'].map((x, i) =>
              `<label class="chip ${i === 0 ? 'active' : ''}"><input type="radio" name="metodo" value="${x}" class="visually-hidden" ${i === 0 ? 'checked' : ''}>${x}</label>`).join('')}</div></div>
          <div class="col-12"><label class="form-label" for="p-ref">Referencia <span class="text-muted">(opcional)</span></label><input class="form-control" id="p-ref" name="referencia" maxlength="60" placeholder="N.° de operación, voucher…"></div>
        </div></form>`,
      pie: `<button class="btn btn-light" data-bs-dismiss="modal">Cancelar</button><button class="btn btn-gold" id="p-ok"><i class="bi bi-check2"></i> Registrar pago</button>`
    });
    const f = $('#f-pago', m.el);
    $$('.chip input', f).forEach(i => i.addEventListener('change', () => $$('.chip', f).forEach(c => c.classList.toggle('active', $('input', c).checked))));
    $('#p-moneda', f).addEventListener('change', e => {
      const usd = e.target.value === 'USD';
      $('#p-tc-wrap', f).hidden = !usd;
      $('#p-monto', f).value = (usd ? r.saldo / Number($('#p-tc', f).value || tc) : r.saldo).toFixed(2);
    });
    $('#p-ok', m.el).addEventListener('click', ev => P.enviando(ev.currentTarget, async () => {
      const body = P.leerForm(f);
      if (body.moneda !== 'USD') body.tipoCambio = null;
      try {
        const res = await api(`/gestion/reservas/${encodeURIComponent(r.codigo)}/pagos`, { method: 'POST', body });
        m.cerrar();
        P.toast(`${res.mensaje} Saldo: ${fmt.S(res.saldo)}.`);
        P.refrescar();
        verReserva(r.codigo);
      } catch (err) { P.errorForm(f, err); }
    }));
  }

  /* ---------------- Nueva reserva (teléfono, WhatsApp, walk-in) ---------------- */
  async function nuevaReserva(pre = {}) {
    const hoy = P.hoyLima();
    const [tipos, habitaciones] = await Promise.all([api('/gestion/tipos'), api('/gestion/habitaciones')]);
    const activos = tipos.filter(t => t.activo);
    let clienteSel = null;

    const m = P.modal({
      titulo: pre.walkin ? 'Walk-in: llegada sin reserva' : 'Nueva reserva', tam: 'xl',
      cuerpo: `<form id="f-res" novalidate><div class="alert alert-danger py-2 small form-alert" hidden></div>
        <div class="row g-4">
          <div class="col-lg-6">
            <h3 class="form-section-title">1. Cliente</h3>
            <div class="nav nav-pills nav-fill mb-3 small" role="group" aria-label="Tipo de cliente">
              <button class="nav-link active" type="button" data-tab="buscar" aria-pressed="true">Cliente registrado</button>
              <button class="nav-link" type="button" data-tab="nuevo" aria-pressed="false">Cliente nuevo</button>
            </div>
            <div data-panel="buscar">
              <div class="search-wrap mb-2"><i class="bi bi-search"></i><input class="form-control" id="r-buscar" aria-label="Buscar cliente" placeholder="Nombre, documento, correo o teléfono" autocomplete="off" data-campo="clienteId"></div>
              <div class="client-pick" id="r-lista"><div class="p-3 small text-muted">Escribe al menos 2 letras para buscar.</div></div>
              <div class="selected-client mt-2" id="r-sel" hidden></div>
            </div>
            <div data-panel="nuevo" hidden>
              <div class="row g-2">
                <div class="col-6"><label class="form-label">Nombres</label><input class="form-control" name="c.nombres" data-campo="nombres"></div>
                <div class="col-6"><label class="form-label">Apellidos</label><input class="form-control" name="c.apellidos" data-campo="apellidos"></div>
                <div class="col-5"><label class="form-label">Documento</label><select class="form-select" name="c.tipoDocumento" data-campo="tipoDocumento"><option value="DNI">DNI</option><option value="CE">Carné ext.</option><option value="PAS">Pasaporte</option></select></div>
                <div class="col-7"><label class="form-label">Número</label><input class="form-control" name="c.numeroDocumento" data-campo="numeroDocumento"></div>
                <div class="col-12"><label class="form-label">Correo</label><input class="form-control" type="email" name="c.email" data-campo="email"></div>
                <div class="col-4"><label class="form-label">País</label><select class="form-select" name="c.codigoPais"><option value="51">+51 PE</option><option value="1">+1</option><option value="54">+54</option><option value="56">+56</option><option value="57">+57</option><option value="34">+34</option><option value="49">+49</option><option value="55">+55</option></select></div>
                <div class="col-8"><label class="form-label">Celular</label><input class="form-control" name="c.telefono" data-campo="telefono" inputmode="tel"></div>
              </div>
            </div>
          </div>
          <div class="col-lg-6">
            <h3 class="form-section-title">2. Estadía</h3>
            <div class="row g-2">
              <div class="col-7"><label class="form-label">Tipo de habitación</label><select class="form-select" name="tipoHabitacion" data-campo="tipoHabitacion">${activos.map(t => `<option value="${esc(t.codigo)}">${esc(t.nombre)} · ${fmt.S0(t.precioNoche)}</option>`).join('')}</select></div>
              <div class="col-5"><label class="form-label">Habitación</label><select class="form-select" name="habitacionId" data-campo="habitacionId"></select></div>
              <div class="col-6"><label class="form-label">Llegada</label><input class="form-control" type="date" name="fechaEntrada" min="${hoy}" value="${pre.walkin ? hoy : ''}" data-campo="fechaEntrada" ${pre.walkin ? 'readonly' : ''}></div>
              <div class="col-6"><label class="form-label">Salida</label><input class="form-control" type="date" name="fechaSalida" min="${P.sumarDias(hoy, 1)}" data-campo="fechaSalida"></div>
              <div class="col-4"><label class="form-label">Huéspedes</label><input class="form-control" type="number" name="huespedes" min="1" max="8" value="2" data-campo="huespedes"></div>
              <div class="col-8"><label class="form-label">Residencia (IGV)</label><select class="form-select" name="residencia" data-campo="residencia"><option value="PE">Residente en Perú</option><option value="EXT">Extranjero (exonerado, pasaporte)</option></select></div>
              <div class="col-6"><label class="form-label">Canal</label><select class="form-select" name="canal">${pre.walkin ? '<option value="Recepcion">Recepción</option>' : '<option value="Telefono">Teléfono</option><option value="WhatsApp">WhatsApp</option><option value="Recepcion">Recepción</option>'}</select></div>
              <div class="col-6"><label class="form-label">Hora de llegada</label><input class="form-control" name="horaLlegada" placeholder="p. ej. 16:00"></div>
              <div class="col-12"><label class="form-label">Notas</label><textarea class="form-control" name="notas" rows="2" maxlength="500"></textarea></div>
              <div class="col-12" id="r-ci-wrap" ${pre.walkin ? '' : 'hidden'}><label class="form-check"><input class="form-check-input" type="checkbox" name="checkInInmediato" ${pre.walkin ? 'checked' : ''}> <span class="form-check-label">Registrar check-in ahora</span></label></div>
            </div>
            <div class="quote-box mt-3" id="r-quote">Elige las fechas para ver la disponibilidad y el total.</div>
          </div>
        </div></form>`,
      pie: `<button class="btn btn-light" data-bs-dismiss="modal">Cancelar</button><button class="btn btn-primary" id="r-ok"><i class="bi bi-calendar-check"></i> Crear reserva</button>`
    });
    const f = $('#f-res', m.el);
    let modo = 'buscar';

    // Pestañas cliente
    $$('[data-tab]', f).forEach(b => b.addEventListener('click', () => {
      modo = b.dataset.tab;
      $$('[data-tab]', f).forEach(x => { x.classList.toggle('active', x === b); x.setAttribute('aria-pressed', String(x === b)); });
      $$('[data-panel]', f).forEach(p => { p.hidden = p.dataset.panel !== modo; });
    }));
    const pintarSel = () => {
      const s = $('#r-sel', f);
      s.hidden = !clienteSel;
      if (clienteSel) {
        s.innerHTML = `<div><strong>${esc(clienteSel.nombres)} ${esc(clienteSel.apellidos)}</strong><br><small>${esc(clienteSel.tipoDocumento)} ${esc(clienteSel.numeroDocumento)} · ${esc(clienteSel.email)}</small></div>
          <button type="button" class="btn btn-sm btn-light" id="r-quitar">Cambiar</button>`;
        $('#r-quitar', s).addEventListener('click', () => { clienteSel = null; pintarSel(); $('#r-buscar', f).focus(); });
        if (clienteSel.residencia) f.residencia.value = clienteSel.residencia;
        cotizar();
      }
    };
    let tBuscar;
    $('#r-buscar', f).addEventListener('input', e => {
      clearTimeout(tBuscar);
      const q = e.target.value.trim();
      const lista = $('#r-lista', f);
      if (q.length < 2) { lista.innerHTML = '<div class="p-3 small text-muted">Escribe al menos 2 letras para buscar.</div>'; return; }
      tBuscar = setTimeout(async () => {
        const res = await api('/gestion/clientes?limite=8&buscar=' + encodeURIComponent(q));
        lista.innerHTML = res.length ? res.map((c, i) => `<button type="button" data-i="${i}"><strong>${esc(c.nombres)} ${esc(c.apellidos)}</strong>
          <span class="d-block small text-muted">${esc(c.tipoDocumento)} ${esc(c.numeroDocumento)} · ${esc(c.email)} · ${c.reservas} reserva(s)</span></button>`).join('')
          : '<div class="p-3 small text-muted">Sin resultados. Usa la pestaña «Cliente nuevo».</div>';
        $$('button', lista).forEach(b => b.addEventListener('click', () => { clienteSel = res[Number(b.dataset.i)]; pintarSel(); }));
      }, 250);
    });

    // Habitaciones del tipo elegido
    const pintarHabitaciones = () => {
      const sel = f.habitacionId;
      const propias = habitaciones.filter(h => h.tipoCodigo === f.tipoHabitacion.value && h.estado === 'Operativa');
      sel.innerHTML = '<option value="">Automática</option>' + propias.map(h => `<option value="${h.id}">${esc(h.numero)}${h.situacion !== 'Libre' ? ' · ' + esc(h.situacion) : ''}</option>`).join('');
    };
    pintarHabitaciones();

    // Cotización con disponibilidad real
    let tCot;
    const cotizar = () => {
      clearTimeout(tCot);
      tCot = setTimeout(async () => {
        const box = $('#r-quote', f);
        const e = f.fechaEntrada.value, s = f.fechaSalida.value;
        $('#r-ci-wrap', f).hidden = e !== hoy;
        if (e !== hoy) f.checkInInmediato.checked = false;
        if (!e || !s || s <= e) { box.textContent = 'Elige las fechas para ver la disponibilidad y el total.'; return; }
        try {
          const disp = await api(`/disponibilidad?entrada=${e}&salida=${s}&huespedes=${f.huespedes.value || 1}`);
          const t = disp.find(x => x.codigo === f.tipoHabitacion.value);
          if (!t) { box.textContent = 'Tipo no disponible.'; return; }
          const ext = f.residencia.value === 'EXT';
          const total = ext ? t.subtotal : t.total;
          box.innerHTML = `<div class="d-flex justify-content-between align-items-end flex-wrap gap-2">
            <div>${t.noches} ${t.noches === 1 ? 'noche' : 'noches'} · ${t.disponibles > 0 ? `<span class="text-success">${t.disponibles} disponible(s)</span>` : '<span class="text-danger">Sin disponibilidad</span>'}
            <br><small>${ext ? 'Exonerado de IGV' : 'Incluye IGV ' + fmt.S(t.igv)}</small></div>
            <div class="text-end"><small class="d-block">Total</small><strong>${fmt.S(total)}</strong></div></div>`;
        } catch (err) { box.textContent = err.message; }
      }, 250);
    };
    ['fechaEntrada', 'fechaSalida', 'huespedes', 'residencia'].forEach(n => f[n].addEventListener('change', cotizar));
    f.tipoHabitacion.addEventListener('change', () => { pintarHabitaciones(); cotizar(); });

    $('#r-ok', m.el).addEventListener('click', ev => P.enviando(ev.currentTarget, async () => {
      P.limpiarErrores(f);
      const v = P.leerForm(f);
      const body = {
        tipoHabitacion: v.tipoHabitacion, habitacionId: v.habitacionId ? Number(v.habitacionId) : null,
        fechaEntrada: v.fechaEntrada, fechaSalida: v.fechaSalida, huespedes: v.huespedes || 1, residencia: v.residencia,
        canal: v.canal, horaLlegada: v.horaLlegada || null, notas: v.notas || null, checkInInmediato: !!v.checkInInmediato
      };
      if (modo === 'buscar') {
        if (!clienteSel) return P.errorForm(f, { campo: 'clienteId', message: 'Busca y elige un cliente, o registra uno nuevo.' });
        body.clienteId = clienteSel.id;
      } else {
        body.cliente = { nombres: v['c.nombres'], apellidos: v['c.apellidos'], tipoDocumento: v['c.tipoDocumento'], numeroDocumento: v['c.numeroDocumento'],
          email: v['c.email'], codigoPais: v['c.codigoPais'], telefono: v['c.telefono'], residencia: v.residencia };
      }
      if (!body.fechaEntrada) return P.errorForm(f, { campo: 'fechaEntrada', message: 'Elige la fecha de llegada.' });
      if (!body.fechaSalida) return P.errorForm(f, { campo: 'fechaSalida', message: 'Elige la fecha de salida.' });
      try {
        const res = await api('/gestion/reservas', { method: 'POST', body });
        m.cerrar();
        P.toast(res.mensaje);
        P.refrescar();
        setTimeout(() => verReserva(res.codigo), 350);
      } catch (err) { P.errorForm(f, err); }
    }));
    if (pre.cliente) { clienteSel = pre.cliente; pintarSel(); }
    cotizar();
  }

  Object.assign(P, { verReserva, registrarPago, nuevaReserva });

  // Delegación global: abrir reservas y botones "nueva reserva"
  document.addEventListener('click', ev => {
    const v = ev.target.closest('[data-reserva]');
    if (v) { ev.preventDefault(); verReserva(v.dataset.reserva); return; }
    const n = ev.target.closest('[data-nueva-reserva]');
    if (n) { ev.preventDefault(); nuevaReserva({ walkin: n.dataset.nuevaReserva === 'walkin' }).catch(err => P.toast(err.message, 'error')); }
  });

  /* =========================================================
     DASHBOARD
     ========================================================= */
  P.ruta('dashboard', {
    titulo: 'Dashboard',
    async render(v) {
      const d = await api('/gestion/dashboard');
      const u = P.sesion.usuario;
      const h = Number(new Date().toLocaleString('en-US', { timeZone: 'America/Lima', hour: 'numeric', hour12: false }));
      const saludo = h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches';
      const hab = d.habitaciones;
      const nav = $('#nav-reclamos'); nav.textContent = d.reclamosPendientes; nav.hidden = !d.reclamosPendientes;

      v.innerHTML = cabecera(`${saludo}, ${esc(u.nombre.split(' ')[0])}`, `Resumen del hotel al ${fmt.fechaDia(d.hoy)}.`,
        `<a class="btn btn-light" href="#/recepcion"><i class="bi bi-bell"></i> Recepción</a>
         <button class="btn btn-primary" data-nueva-reserva><i class="bi bi-plus-lg"></i> Nueva reserva</button>`) + `
        <div class="row g-3 mb-3">
          <div class="col-6 col-xl-3">${kpi('pie-chart', '', 'Ocupación hoy', fmt.pct(d.ocupacionHoy), `${hab.ocupadas} de ${hab.operativas} habitaciones`,
            `<div class="progress-thin"><span style="width:${Math.min(100, d.ocupacionHoy * 100)}%"></span></div>`)}</div>
          <div class="col-6 col-xl-3">${kpi('box-arrow-in-right', 'info', 'Llegadas hoy', d.llegadasHoy, `${d.enCasa} huéspedes en el hotel`)}</div>
          <div class="col-6 col-xl-3">${kpi('box-arrow-right', 'warn', 'Salidas hoy', d.salidasHoy, `${hab.sucias} habitación(es) por limpiar`)}</div>
          <div class="col-6 col-xl-3">${kpi('calendar-plus', 'ok', 'Reservas nuevas hoy', d.reservasHoy, 'Web, teléfono y recepción')}</div>
          <div class="col-6 col-xl-3">${kpi('graph-up-arrow', 'ok', 'Ingresos del mes', fmt.S0(d.ingresosMes), `ADR ${fmt.S0(d.adrMes)} · Ocupación ${fmt.pct(d.ocupacionMes)}`)}</div>
          <div class="col-6 col-xl-3">${kpi('cash-coin', '', 'Cobrado hoy', fmt.S(d.cobradoHoy), `En el mes: ${fmt.S0(d.cobradoMes)}`)}</div>
          <div class="col-6 col-xl-3">${kpi('wallet2', d.saldoEnCasa > 0 ? 'warn' : 'ok', 'Saldo de huéspedes en casa', fmt.S(d.saldoEnCasa), 'Por cobrar antes del check-out')}</div>
          <div class="col-6 col-xl-3">${kpi('journal-text', d.reclamosPendientes ? 'bad' : 'ok', 'Reclamos pendientes', d.reclamosPendientes, d.reclamosPorVencer ? `<span class="text-danger">${d.reclamosPorVencer} por vencer</span>` : 'Al día')}</div>
        </div>
        <div class="row g-3 mb-3">
          <div class="col-xl-8"><div class="card-x"><div class="card-head"><h2><i class="bi bi-calendar3"></i> Ocupación próximos 14 días</h2></div><div class="chart-box"><canvas id="g-14"></canvas></div></div></div>
          <div class="col-xl-4"><div class="card-x"><div class="card-head"><h2><i class="bi bi-door-open"></i> Habitaciones hoy</h2><a class="small" href="#/habitaciones">Ver tablero</a></div><div class="chart-box sm"><canvas id="g-hab"></canvas></div></div></div>
        </div>
        <div class="row g-3 mb-3">
          <div class="col-xl-8"><div class="card-x"><div class="card-head"><h2><i class="bi bi-bar-chart"></i> Ingresos por mes</h2><span class="small text-muted">Prorrateados por noche</span></div><div class="chart-box"><canvas id="g-ing"></canvas></div></div></div>
          <div class="col-xl-4"><div class="card-x"><div class="card-head"><h2><i class="bi bi-diagram-3"></i> Canales (30 días)</h2></div><div class="chart-box sm"><canvas id="g-can"></canvas></div></div></div>
        </div>
        <div class="card-x p-0"><div class="card-head"><h2><i class="bi bi-clock-history"></i> Últimas reservas</h2><a class="small" href="#/reservas">Ver todas</a></div>
          <div class="table-responsive mt-2">${tablaReservas(d.ultimas)}</div></div>`;

      P.grafico($('#g-14'), {
        type: 'bar',
        data: { labels: d.proximos14.map(x => fmt.fechaDia(x.fecha)), datasets: [{ label: 'Ocupación', data: d.proximos14.map(x => x.ocupacion * 100), backgroundColor: d.proximos14.map((x, i) => i === 0 ? '#B08D57' : '#12303A'), borderRadius: 6, maxBarThickness: 34 }] },
        options: { plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => `${c.parsed.y.toFixed(0)} % (${d.proximos14[c.dataIndex].ocupadas} hab.)` } } },
          scales: { y: { beginAtZero: true, max: 100, ticks: { callback: x => x + ' %' } }, x: { grid: { display: false } } } }
      });
      P.grafico($('#g-hab'), {
        type: 'doughnut',
        data: { labels: ['Ocupadas', 'Libres', 'Fuera de servicio'], datasets: [{ data: [hab.ocupadas, hab.libres, hab.mantenimiento], backgroundColor: ['#12303A', '#3E9B66', '#A2321A'], borderWidth: 0 }] },
        options: { cutout: '68%', plugins: { legend: { position: 'bottom' } } }
      });
      P.grafico($('#g-ing'), {
        type: 'bar',
        data: { labels: d.meses.map(x => fmt.mes(x.mes)), datasets: [
          { label: 'Ingresos', data: d.meses.map(x => x.ingresos), backgroundColor: '#12303A', borderRadius: 6, maxBarThickness: 46, yAxisID: 'y' },
          { label: 'Ocupación', data: d.meses.map(x => x.ocupacion * 100), type: 'line', borderColor: '#B08D57', backgroundColor: '#B08D57', tension: .35, yAxisID: 'y1' }] },
        options: { scales: { y: { beginAtZero: true, ticks: { callback: x => fmt.S0(x) } }, y1: { position: 'right', beginAtZero: true, max: 100, grid: { display: false }, ticks: { callback: x => x + ' %' } }, x: { grid: { display: false } } },
          plugins: { tooltip: { callbacks: { label: c => c.dataset.yAxisID === 'y' ? fmt.S(c.parsed.y) : c.parsed.y.toFixed(0) + ' %' } } } }
      });
      P.grafico($('#g-can'), {
        type: 'doughnut',
        data: { labels: d.canales.map(c => P.CANALES[c.canal] || c.canal), datasets: [{ data: d.canales.map(c => c.reservas), backgroundColor: P.COLORES, borderWidth: 0 }] },
        options: { cutout: '68%', plugins: { legend: { position: 'bottom' } } }
      });
    }
  });

  function tablaReservas(lista, vacioTxt = 'No hay reservas para mostrar.') {
    if (!lista.length) return P.vacio(vacioTxt, 'calendar-x');
    return `<table class="table table-x table-hover"><thead><tr><th>Código</th><th>Huésped</th><th>Habitación</th><th>Llegada</th><th>Salida</th><th>Estado</th><th class="money">Total</th><th class="money">Saldo</th></tr></thead><tbody>
      ${lista.map(r => `<tr class="clickable" data-reserva="${esc(r.codigo)}">
        <td><span class="code">${esc(r.codigo)}</span><span class="sub">${esc(P.CANALES[r.canal] || r.canal)}</span></td>
        <td>${esc(r.cliente)}<span class="sub">${r.residencia === 'EXT' ? 'Extranjero' : 'Residente'} · ${r.huespedes} huésp.</span></td>
        <td>${esc(r.habitacion)}<span class="sub">${esc(r.tipoHabitacion)}</span></td>
        <td>${fmt.fechaDia(r.fechaEntrada)}</td><td>${fmt.fechaDia(r.fechaSalida)}<span class="sub">${r.noches} noche(s)</span></td>
        <td>${badge(r.estado)}</td><td class="money">${fmt.S(r.total)}</td>
        <td class="money ${r.saldo > 0.009 && !['Cancelada', 'NoShow'].includes(r.estado) ? 'debt' : 'text-muted'}">${fmt.S(r.saldo)}</td></tr>`).join('')}
      </tbody></table>`;
  }
  P.tablaReservas = tablaReservas;

  /* =========================================================
     RECEPCIÓN
     ========================================================= */
  P.ruta('recepcion', {
    titulo: 'Recepción',
    async render(v) {
      const d = await api('/gestion/recepcion');
      const item = (r, botones, sub) => `<div class="desk-item">
        <span class="room-tag ${r.estado === 'Confirmada' ? 'gold' : ''}">${esc(r.habitacion)}</span>
        <div class="info"><button class="btn btn-link p-0 text-start text-decoration-none text-reset" data-reserva="${esc(r.codigo)}"><strong>${esc(r.cliente)}</strong></button>
        <small>${sub}</small></div><div class="d-flex gap-1">${botones}</div></div>`;
      const col = (titulo, icono, n, cuerpo) => `<div class="col-md-6 col-xxl-3 desk-col"><div class="card-x"><div class="card-head"><h2><i class="bi bi-${icono}"></i> ${titulo}</h2><span class="count-pill">${n}</span></div>${cuerpo}</div></div>`;

      v.innerHTML = cabecera('Recepción', `Movimientos del ${fmt.fechaDia(d.hoy)}.`,
        `<button class="btn btn-light" data-nueva-reserva><i class="bi bi-telephone"></i> Reserva telefónica</button>
         <button class="btn btn-primary" data-nueva-reserva="walkin"><i class="bi bi-person-walking"></i> Walk-in</button>`) + `<div class="row g-3">
        ${col('Llegadas de hoy', 'box-arrow-in-right', d.llegadas.length, d.llegadas.length ? d.llegadas.map(r => item(r,
          `<button class="btn btn-sm btn-success" data-ci="${esc(r.codigo)}"><i class="bi bi-check2"></i> Check-in</button>`,
          `${esc(r.tipoHabitacion)} · ${r.noches} noche(s)${r.horaLlegada ? ' · llega ' + esc(r.horaLlegada) : ''}${r.saldo > 0.009 ? ` · <span class="debt">${fmt.S0(r.saldo)}</span>` : ''}`)).join('') : P.vacio('No hay llegadas pendientes.', 'cup-hot'))}
        ${col('Salidas de hoy', 'box-arrow-right', d.salidas.length, d.salidas.length ? d.salidas.map(r => item(r,
          r.saldo > 0.009 ? `<button class="btn btn-sm btn-gold" data-pagar="${esc(r.codigo)}"><i class="bi bi-cash"></i> Cobrar</button>` : `<button class="btn btn-sm btn-primary" data-co="${esc(r.codigo)}"><i class="bi bi-check2"></i> Check-out</button>`,
          `Saldo: <span class="${r.saldo > 0.009 ? 'debt' : ''}">${fmt.S(r.saldo)}</span>`)).join('') : P.vacio('No hay salidas pendientes.', 'cup-hot'))}
        ${col('En el hotel', 'house-door', d.enCasa.length, d.enCasa.length ? d.enCasa.map(r => item(r,
          r.saldo > 0.009 ? `<button class="btn btn-sm btn-light" data-pagar="${esc(r.codigo)}" title="Registrar pago"><i class="bi bi-cash"></i></button>` : '',
          `Sale ${fmt.fechaDia(r.fechaSalida)}${r.saldo > 0.009 ? ` · <span class="debt">${fmt.S0(r.saldo)}</span>` : ' · pagado'}`)).join('') : P.vacio('No hay huéspedes alojados.', 'moon-stars'))}
        ${col('Limpieza pendiente', 'stars', d.limpieza.length, d.limpieza.length ? d.limpieza.map(h => `<div class="desk-item"><span class="room-tag">${esc(h.numero)}</span>
          <div class="info"><strong>${esc(h.tipo)}</strong><small>Marcada como sucia</small></div>
          <button class="btn btn-sm btn-light" data-limpia="${h.id}"><i class="bi bi-check2-circle"></i> Limpia</button></div>`).join('') : P.vacio('Todas las habitaciones están limpias.', 'emoji-smile'))}
      </div>`;

      const todas = [...d.llegadas, ...d.salidas, ...d.enCasa];
      $$('[data-ci]', v).forEach(b => b.addEventListener('click', () => accion('checkin', todas.find(r => r.codigo === b.dataset.ci))));
      $$('[data-co]', v).forEach(b => b.addEventListener('click', () => accion('checkout', todas.find(r => r.codigo === b.dataset.co))));
      $$('[data-pagar]', v).forEach(b => b.addEventListener('click', () => registrarPago(todas.find(r => r.codigo === b.dataset.pagar))));
      $$('[data-limpia]', v).forEach(b => b.addEventListener('click', async () => {
        try { await api(`/gestion/habitaciones/${b.dataset.limpia}/limpieza`, { method: 'PATCH', body: { estadoLimpieza: 'Limpia' } }); P.toast('Habitación lista para el siguiente huésped.'); P.refrescar(); }
        catch (err) { P.toast(err.message, 'error'); }
      }));
    }
  });

  /* =========================================================
     RESERVAS
     ========================================================= */
  P.ruta('reservas', {
    titulo: 'Reservas',
    async render(v) {
      const hoy = P.hoyLima();
      v.innerHTML = cabecera('Reservas', 'Busca, filtra y gestiona todas las reservas.',
        `<button class="btn btn-light" id="rs-csv"><i class="bi bi-download"></i> Exportar CSV</button>
         <button class="btn btn-primary" data-nueva-reserva><i class="bi bi-plus-lg"></i> Nueva reserva</button>`) + `
        <div class="card-x p-0">
          <form class="toolbar" id="rs-filtros">
            <div class="grow"><label class="form-label">Buscar</label><div class="search-wrap"><i class="bi bi-search"></i><input class="form-control" name="buscar" placeholder="Código, huésped, documento, correo o N.° de habitación"></div></div>
            <div><label class="form-label">Estado</label><select class="form-select" name="estado"><option value="">Todos</option><option value="Confirmada">Confirmada</option><option value="CheckIn">En el hotel</option><option value="CheckOut">Finalizada</option><option value="Cancelada">Cancelada</option><option value="NoShow">No show</option></select></div>
            <div><label class="form-label">Llegada desde</label><input class="form-control" type="date" name="desde"></div>
            <div><label class="form-label">hasta</label><input class="form-control" type="date" name="hasta"></div>
            <button class="btn btn-primary" type="submit"><i class="bi bi-funnel"></i> Filtrar</button>
          </form>
          <div class="px-3 pt-3 chips" id="rs-rapidos">
            <button class="chip active" data-r="proximas">Próximas llegadas</button><button class="chip" data-r="hoy">Llegan hoy</button>
            <button class="chip" data-r="casa">En el hotel</button><button class="chip" data-r="todas">Todas</button>
          </div>
          <div class="table-responsive mt-2" id="rs-tabla"></div>
          <div class="px-3 py-2 small text-muted border-top" id="rs-pie"></div>
        </div>`;
      const f = $('#rs-filtros', v);
      let ultima = [];
      const cargar = async () => {
        const q = new URLSearchParams(Object.entries(P.leerForm(f)).filter(([, x]) => x));
        $('#rs-tabla', v).innerHTML = '<div class="loading-overlay"><div class="spinner-border text-secondary"></div></div>';
        ultima = await api('/gestion/reservas?' + q);
        $('#rs-tabla', v).innerHTML = tablaReservas(ultima, 'No hay reservas con esos filtros.');
        $('#rs-pie', v).textContent = `${ultima.length} reserva(s)` + (ultima.length >= 300 ? ' · se muestran las 300 primeras; ajusta los filtros.' : '');
      };
      const rapidos = {
        proximas: { estado: 'Confirmada', desde: hoy, hasta: P.sumarDias(hoy, 30) },
        hoy: { estado: 'Confirmada', desde: '', hasta: hoy }, casa: { estado: 'CheckIn' }, todas: {}
      };
      $$('#rs-rapidos .chip', v).forEach(c => c.addEventListener('click', () => {
        $$('#rs-rapidos .chip', v).forEach(x => x.classList.toggle('active', x === c));
        f.reset();
        Object.entries(rapidos[c.dataset.r]).forEach(([k, x]) => { f.elements[k].value = x; });
        cargar().catch(err => P.toast(err.message, 'error'));
      }));
      f.addEventListener('submit', e => { e.preventDefault(); $$('#rs-rapidos .chip', v).forEach(x => x.classList.remove('active')); cargar().catch(err => P.toast(err.message, 'error')); });
      $('#rs-csv', v).addEventListener('click', () => P.csv(`reservas-${hoy}.csv`, [
        ['Código', 'Estado', 'Canal', 'Huésped', 'Documento', 'Correo', 'Teléfono', 'Residencia', 'Tipo', 'Habitación', 'Llegada', 'Salida', 'Noches', 'Huéspedes', 'Subtotal', 'IGV', 'Total', 'Pagado', 'Saldo', 'Registrada', 'Registrada por'],
        ...ultima.map(r => [r.codigo, r.estado, r.canal, r.cliente, r.documento, r.email, r.telefono, r.residencia, r.tipoHabitacion, r.habitacion, r.fechaEntrada, r.fechaSalida, r.noches, r.huespedes, r.subtotal, r.igv, r.total, r.pagado, r.saldo, r.fechaReserva, r.registradoPor || 'Web'])]));
      Object.entries(rapidos.proximas).forEach(([k, x]) => { f.elements[k].value = x; });
      await cargar();
    }
  });

  /* =========================================================
     HABITACIONES (tablero + CRUD)
     ========================================================= */
  const SIT_CLASE = s => 'rs-' + s.split(' ')[0];
  P.ruta('habitaciones', {
    titulo: 'Habitaciones',
    async render(v) {
      const [habs, tipos] = await Promise.all([api('/gestion/habitaciones'), api('/gestion/tipos')]);
      const admin = P.sesion.esAdmin;
      const cuenta = s => habs.filter(h => h.situacion === s).length;
      v.innerHTML = cabecera('Habitaciones', `${habs.length} habitaciones · ${cuenta('Libre')} libres hoy · ${habs.filter(h => h.estadoLimpieza === 'Sucia').length} por limpiar`,
        `<div class="btn-group" role="group" aria-label="Vista"><button class="btn btn-light active" data-vista="tablero"><i class="bi bi-grid-3x3-gap"></i> Tablero</button><button class="btn btn-light" data-vista="tabla"><i class="bi bi-list-ul"></i> Lista</button></div>
         ${admin ? '<button class="btn btn-primary" id="h-nueva"><i class="bi bi-plus-lg"></i> Nueva habitación</button>' : ''}`) + `
        <div class="card-x mb-3"><div class="d-flex flex-wrap justify-content-between gap-3 align-items-center">
          <div class="chips" id="h-filtros">${['Todas', 'Libre', 'Ocupada', 'Llegada hoy', 'Salida hoy', 'Mantenimiento', 'Sucia'].map((x, i) => `<button class="chip ${i ? '' : 'active'}" data-f="${x}">${x === 'Sucia' ? 'Por limpiar' : x}</button>`).join('')}</div>
          <div class="legend"><span style="--c:#3E9B66">Libre</span><span style="--c:#12303A">Ocupada</span><span style="--c:#B08D57">Llega hoy</span><span style="--c:#D9822B">Sale hoy</span><span style="--c:#A2321A">Fuera de servicio</span><span><i class="bi bi-stars text-warning"></i> Por limpiar</span></div>
        </div></div>
        <div id="h-cont"></div>`;

      let filtro = 'Todas', modo = 'tablero';
      const pasa = h => filtro === 'Todas' || (filtro === 'Sucia' ? h.estadoLimpieza === 'Sucia' : filtro === 'Mantenimiento' ? h.estado !== 'Operativa' : h.situacion === filtro);
      const pintar = () => {
        const lista = habs.filter(pasa);
        const cont = $('#h-cont', v);
        if (!lista.length) { cont.innerHTML = `<div class="card-x">${P.vacio('No hay habitaciones con ese filtro.', 'door-closed')}</div>`; return; }
        if (modo === 'tablero') {
          const pisos = [...new Set(lista.map(h => h.piso))];
          cont.innerHTML = pisos.map(p => `<div class="floor-title">Piso ${p}</div><div class="room-board">${lista.filter(h => h.piso === p).map(h => `
            <button class="room-card ${SIT_CLASE(h.situacion)}" data-h="${h.id}">
              ${h.estadoLimpieza === 'Sucia' ? '<i class="bi bi-stars clean text-warning" title="Por limpiar"></i>' : ''}
              <div class="num">${esc(h.numero)}</div><div class="type">${esc(h.tipo)}</div>
              <span class="state">${esc(h.situacion)}</span>
              <span class="guest">${h.huesped ? esc(h.huesped) : h.proximaLlegada ? 'Próx.: ' + fmt.fechaDia(h.proximaLlegada) : '&nbsp;'}</span>
            </button>`).join('')}</div>`).join('');
        } else {
          cont.innerHTML = `<div class="card-x p-0"><div class="table-responsive"><table class="table table-x table-hover"><thead><tr><th>N.°</th><th>Tipo</th><th>Piso</th><th>Situación hoy</th><th>Estado</th><th>Limpieza</th><th class="money">Tarifa</th><th>Notas</th><th><span class="visually-hidden">Abrir</span></th></tr></thead><tbody>
            ${lista.map(h => `<tr class="clickable" data-h="${h.id}"><td class="fw-medium">${esc(h.numero)}</td><td>${esc(h.tipo)}<span class="sub">Hasta ${h.capacidad} huésp.</span></td><td>${h.piso}</td>
              <td>${esc(h.situacion)}${h.huesped ? `<span class="sub">${esc(h.huesped)}</span>` : ''}</td><td>${badge(h.estado)}</td><td>${badge(h.estadoLimpieza)}</td>
              <td class="money">${fmt.S0(h.precioNoche)}</td><td class="small text-muted">${esc(h.notas || '')}</td><td class="text-end"><i class="bi bi-chevron-right text-muted"></i></td></tr>`).join('')}
            </tbody></table></div></div>`;
        }
        $$('[data-h]', cont).forEach(b => b.addEventListener('click', () => fichaHabitacion(habs.find(h => h.id === Number(b.dataset.h)), tipos)));
      };
      $$('#h-filtros .chip', v).forEach(c => c.addEventListener('click', () => { filtro = c.dataset.f; $$('#h-filtros .chip', v).forEach(x => x.classList.toggle('active', x === c)); pintar(); }));
      $$('[data-vista]', v).forEach(b => b.addEventListener('click', () => { modo = b.dataset.vista; $$('[data-vista]', v).forEach(x => x.classList.toggle('active', x === b)); pintar(); }));
      if (admin) $('#h-nueva', v).addEventListener('click', () => editarHabitacion(null, tipos));
      pintar();
    }
  });

  function fichaHabitacion(h, tipos) {
    const admin = P.sesion.esAdmin;
    const d = P.drawer(`Habitación ${esc(h.numero)}`, `
      <div class="d-flex flex-wrap gap-2 mb-3">${badge(h.estado)} ${badge(h.estadoLimpieza)} <span class="badge-x b-muted">${esc(h.situacion)}</span></div>
      <dl class="dl-grid mb-4">
        <div><dt>Tipo</dt><dd>${esc(h.tipo)}</dd></div><div><dt>Piso</dt><dd>${h.piso}</dd></div>
        <div><dt>Capacidad</dt><dd>${h.capacidad} huéspedes</dd></div><div><dt>Tarifa vigente</dt><dd>${fmt.S(h.precioNoche)}</dd></div>
        ${h.huesped ? `<div class="full"><dt>Huésped actual</dt><dd>${esc(h.huesped)} · sale ${fmt.fechaDia(h.salidaPrevista)}</dd></div>` : ''}
        ${h.proximaLlegada ? `<div><dt>Próxima llegada</dt><dd>${fmt.fechaDia(h.proximaLlegada)}</dd></div>` : ''}
        <div><dt>Reservas históricas</dt><dd>${h.totalReservas}</dd></div>
        ${h.notas ? `<div class="full"><dt>Notas</dt><dd class="fw-normal">${esc(h.notas)}</dd></div>` : ''}
      </dl>
      <div class="d-grid gap-2">
        ${h.codigoReserva ? `<button class="btn btn-light" data-reserva="${esc(h.codigoReserva)}"><i class="bi bi-calendar-check"></i> Ver reserva ${esc(h.codigoReserva)}</button>` : ''}
        <button class="btn btn-light" id="h-limp"><i class="bi bi-${h.estadoLimpieza === 'Sucia' ? 'check2-circle' : 'stars'}"></i> Marcar como ${h.estadoLimpieza === 'Sucia' ? 'limpia' : 'sucia'}</button>
        ${admin ? `<button class="btn btn-light" id="h-edit"><i class="bi bi-pencil"></i> Editar habitación</button>
        <button class="btn btn-light text-danger" id="h-del" ${h.totalReservas ? 'disabled title="Tiene historial: cámbiala a Fuera de servicio"' : ''}><i class="bi bi-trash"></i> Eliminar</button>
        ${h.totalReservas ? '<small class="text-muted">Las habitaciones con historial no se eliminan; usa el estado «Fuera de servicio».</small>' : ''}` : ''}
      </div>`);
    $('#h-limp', d.el).addEventListener('click', async () => {
      try {
        await api(`/gestion/habitaciones/${h.id}/limpieza`, { method: 'PATCH', body: { estadoLimpieza: h.estadoLimpieza === 'Sucia' ? 'Limpia' : 'Sucia' } });
        d.cerrar(); P.toast('Estado de limpieza actualizado.'); P.refrescar();
      } catch (err) { P.toast(err.message, 'error'); }
    });
    if (!admin) return;
    $('#h-edit', d.el).addEventListener('click', () => { d.cerrar(); editarHabitacion(h, tipos); });
    $('#h-del', d.el).addEventListener('click', async () => {
      if (!await P.confirmar({ titulo: 'Eliminar habitación', texto: `¿Eliminar la habitación <strong>${esc(h.numero)}</strong>? Esta acción no se puede deshacer.`, boton: 'Eliminar', peligro: true })) return;
      try { const r = await api(`/gestion/habitaciones/${h.id}`, { method: 'DELETE' }); d.cerrar(); P.toast(r.mensaje); P.refrescar(); }
      catch (err) { P.toast(err.message, 'error'); }
    });
  }

  function editarHabitacion(h, tipos) {
    const m = P.modal({
      titulo: h ? `Editar habitación ${esc(h.numero)}` : 'Nueva habitación',
      cuerpo: `<form id="f-hab" novalidate><div class="alert alert-danger py-2 small form-alert" hidden></div><div class="row g-3">
        <div class="col-6"><label class="form-label">Número</label><input class="form-control" name="numero" value="${esc(h ? h.numero : '')}" required maxlength="10"></div>
        <div class="col-6"><label class="form-label">Piso</label><input class="form-control" type="number" name="piso" min="0" max="50" value="${h ? h.piso : 1}"></div>
        <div class="col-12"><label class="form-label">Tipo</label><select class="form-select" name="tipoHabitacion">${tipos.map(t => `<option value="${esc(t.codigo)}" ${h && h.tipoCodigo === t.codigo ? 'selected' : ''}>${esc(t.nombre)} · ${fmt.S0(t.precioNoche)}</option>`).join('')}</select></div>
        <div class="col-12"><label class="form-label">Estado</label><select class="form-select" name="estado">${[['Operativa', 'Operativa'], ['Mantenimiento', 'En mantenimiento'], ['FueraDeServicio', 'Fuera de servicio']].map(([k, t]) => `<option value="${k}" ${h && h.estado === k ? 'selected' : ''}>${t}</option>`).join('')}</select>
          <div class="form-text">Las habitaciones que no están operativas no se ofrecen en la web.</div></div>
        <div class="col-12"><label class="form-label">Notas internas</label><textarea class="form-control" name="notas" rows="2" maxlength="300">${esc(h && h.notas || '')}</textarea></div>
      </div></form>`,
      pie: `<button class="btn btn-light" data-bs-dismiss="modal">Cancelar</button><button class="btn btn-primary" id="hab-ok"><i class="bi bi-check2"></i> Guardar</button>`
    });
    const f = $('#f-hab', m.el);
    $('#hab-ok', m.el).addEventListener('click', ev => P.enviando(ev.currentTarget, async () => {
      try {
        const r = await api(h ? `/gestion/habitaciones/${h.id}` : '/gestion/habitaciones', { method: h ? 'PUT' : 'POST', body: P.leerForm(f) });
        m.cerrar(); P.toast(r.mensaje); if (r.advertencia) P.toast(r.advertencia, 'warn'); P.refrescar();
      } catch (err) { P.errorForm(f, err); }
    }));
  }
})();
