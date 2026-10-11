/* ==========================================================
   MAREA ALTA · PANEL — Vistas (2/2): clientes, caja, reportes,
   tarifas, reclamaciones, usuarios y mi cuenta. Arranque.
   ========================================================== */
(function () {
  'use strict';
  const P = window.Panel;
  const { fmt, esc, badge, api, cabecera, kpi } = P;
  const $ = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));

  /* =========================================================
     CLIENTES
     ========================================================= */
  P.ruta('clientes', {
    titulo: 'Clientes',
    async render(v, params) {
      if (params[0]) return fichaCliente(v, Number(params[0]));
      v.innerHTML = cabecera('Clientes', 'Huéspedes registrados, historial y datos de contacto.',
        `<button class="btn btn-light" id="cl-csv"><i class="bi bi-download"></i> Exportar CSV</button>
         <button class="btn btn-primary" id="cl-nuevo"><i class="bi bi-person-plus"></i> Nuevo cliente</button>`) + `
        <div class="card-x p-0">
          <div class="toolbar"><div class="grow"><div class="search-wrap"><i class="bi bi-search"></i>
            <input class="form-control" id="cl-buscar" aria-label="Buscar clientes" placeholder="Buscar por nombre, documento, correo o teléfono" autocomplete="off"></div></div></div>
          <div class="table-responsive" id="cl-tabla"></div>
        </div>`;
      let lista = [];
      const cargar = async q => {
        lista = await api('/gestion/clientes?limite=200' + (q ? '&buscar=' + encodeURIComponent(q) : ''));
        $('#cl-tabla', v).innerHTML = lista.length ? `<table class="table table-x table-hover"><thead><tr>
          <th>Cliente</th><th>Documento</th><th>Contacto</th><th>Residencia</th><th class="text-center">Reservas</th><th class="money">Total consumido</th><th>Última llegada</th></tr></thead><tbody>
          ${lista.map(c => `<tr class="clickable" data-c="${c.id}">
            <td><div class="d-flex align-items-center gap-2"><span class="avatar">${fmt.iniciales(c.nombres + ' ' + c.apellidos)}</span>
              <div><span class="fw-medium">${esc(c.nombres)} ${esc(c.apellidos)}</span>${c.estadias >= 3 ? ' <span class="badge-x b-gold">Frecuente</span>' : ''}</div></div></td>
            <td>${esc(c.tipoDocumento)} ${esc(c.numeroDocumento)}</td>
            <td>${esc(c.email)}<span class="sub">+${esc(c.codigoPais)} ${esc(c.telefono)}</span></td>
            <td>${c.residencia === 'EXT' ? 'Extranjero' : 'Residente'}</td>
            <td class="text-center">${c.reservas}</td><td class="money">${fmt.S(c.totalGastado)}</td>
            <td>${c.ultimaLlegada ? fmt.fecha(c.ultimaLlegada) : '—'}</td></tr>`).join('')}</tbody></table>`
          : P.vacio('No hay clientes con esa búsqueda.', 'people');
        $$('[data-c]', v).forEach(r => r.addEventListener('click', () => { location.hash = '#/clientes/' + r.dataset.c; }));
      };
      let t;
      $('#cl-buscar', v).addEventListener('input', e => { clearTimeout(t); t = setTimeout(() => cargar(e.target.value.trim()).catch(err => P.toast(err.message, 'error')), 300); });
      $('#cl-nuevo', v).addEventListener('click', () => editarCliente(null));
      $('#cl-csv', v).addEventListener('click', () => P.csv('clientes.csv', [
        ['Nombres', 'Apellidos', 'Tipo doc.', 'Documento', 'Correo', 'Código país', 'Teléfono', 'Residencia', 'Acepta publicidad', 'Reservas', 'Estadías', 'Total consumido', 'Última llegada'],
        ...lista.map(c => [c.nombres, c.apellidos, c.tipoDocumento, c.numeroDocumento, c.email, c.codigoPais, c.telefono, c.residencia, c.aceptaPublicidad ? 'Sí' : 'No', c.reservas, c.estadias, c.totalGastado, c.ultimaLlegada || ''])]));
      await cargar('');
    }
  });

  async function fichaCliente(v, id) {
    const { cliente: c, reservas } = await api('/gestion/clientes/' + id);
    v.innerHTML = cabecera(`${esc(c.nombres)} ${esc(c.apellidos)}`, `<a href="#/clientes"><i class="bi bi-arrow-left"></i> Clientes</a> · Cliente desde ${fmt.fecha(c.fechaRegistro)}`,
      `<button class="btn btn-light" id="fc-editar"><i class="bi bi-pencil"></i> Editar datos</button>
       <button class="btn btn-primary" id="fc-reservar"><i class="bi bi-calendar-plus"></i> Nueva reserva</button>`) + `
      <div class="row g-3 mb-3">
        <div class="col-6 col-xl-3">${kpi('calendar-check', '', 'Reservas', c.reservas, `${c.estadias} estadía(s) realizadas`)}</div>
        <div class="col-6 col-xl-3">${kpi('cash-coin', 'ok', 'Total consumido', fmt.S0(c.totalGastado), 'Reservas no canceladas')}</div>
        <div class="col-6 col-xl-3">${kpi('geo-alt', 'info', 'Residencia', c.residencia === 'EXT' ? 'Extranjero' : 'Perú', c.residencia === 'EXT' ? 'Exonerado de IGV en hospedaje' : 'Tarifas con IGV')}</div>
        <div class="col-6 col-xl-3">${kpi('envelope-paper', c.aceptaPublicidad ? 'ok' : '', 'Ofertas por correo', c.aceptaPublicidad ? 'Acepta' : 'No acepta', '')}</div>
      </div>
      <div class="row g-3">
        <div class="col-xl-4"><div class="card-x"><div class="card-head"><h2><i class="bi bi-person-vcard"></i> Datos</h2></div>
          <dl class="dl-grid">
            <div><dt>Documento</dt><dd>${esc(c.tipoDocumento)} ${esc(c.numeroDocumento)}</dd></div>
            <div><dt>Teléfono</dt><dd><a href="https://wa.me/${esc(c.codigoPais + c.telefono)}" target="_blank" rel="noopener"><i class="bi bi-whatsapp"></i> +${esc(c.codigoPais)} ${esc(c.telefono)}</a></dd></div>
            <div class="full"><dt>Correo</dt><dd><a href="mailto:${esc(c.email)}">${esc(c.email)}</a></dd></div>
            <div class="full"><dt>Notas internas</dt><dd class="fw-normal">${esc(c.notas || 'Sin notas.')}</dd></div>
          </dl></div></div>
        <div class="col-xl-8"><div class="card-x p-0"><div class="card-head"><h2><i class="bi bi-clock-history"></i> Historial de reservas</h2></div>
          <div class="table-responsive mt-2">${P.tablaReservas(reservas, 'Este cliente aún no tiene reservas.')}</div></div></div>
      </div>`;
    $('#fc-editar', v).addEventListener('click', () => editarCliente(c));
    $('#fc-reservar', v).addEventListener('click', () => P.nuevaReserva({ cliente: c }).catch(err => P.toast(err.message, 'error')));
  }

  function editarCliente(c) {
    const s = (k, x) => (c && c[k] === x ? 'selected' : '');
    const m = P.modal({
      titulo: c ? 'Editar cliente' : 'Nuevo cliente', tam: 'lg',
      cuerpo: `<form id="f-cli" novalidate><div class="alert alert-danger py-2 small form-alert" hidden></div><div class="row g-3">
        <div class="col-md-6"><label class="form-label">Nombres</label><input class="form-control" name="nombres" value="${esc(c ? c.nombres : '')}"></div>
        <div class="col-md-6"><label class="form-label">Apellidos</label><input class="form-control" name="apellidos" value="${esc(c ? c.apellidos : '')}"></div>
        <div class="col-md-4"><label class="form-label">Tipo de documento</label><select class="form-select" name="tipoDocumento"><option value="DNI" ${s('tipoDocumento', 'DNI')}>DNI</option><option value="CE" ${s('tipoDocumento', 'CE')}>Carné de extranjería</option><option value="PAS" ${s('tipoDocumento', 'PAS')}>Pasaporte</option></select></div>
        <div class="col-md-4"><label class="form-label">Número</label><input class="form-control" name="numeroDocumento" value="${esc(c ? c.numeroDocumento : '')}"></div>
        <div class="col-md-4"><label class="form-label">Residencia</label><select class="form-select" name="residencia"><option value="PE" ${s('residencia', 'PE')}>Residente en Perú</option><option value="EXT" ${s('residencia', 'EXT')}>Extranjero no domiciliado</option></select></div>
        <div class="col-md-6"><label class="form-label">Correo</label><input class="form-control" type="email" name="email" value="${esc(c ? c.email : '')}"></div>
        <div class="col-md-2"><label class="form-label">País</label><input class="form-control" name="codigoPais" value="${esc(c ? c.codigoPais : '51')}" inputmode="numeric" maxlength="3"></div>
        <div class="col-md-4"><label class="form-label">Teléfono</label><input class="form-control" name="telefono" value="${esc(c ? c.telefono : '')}" inputmode="tel"></div>
        <div class="col-12"><label class="form-label">Notas internas</label><textarea class="form-control" name="notas" rows="2" maxlength="500" placeholder="Preferencias, alergias, ocasiones especiales…">${esc(c && c.notas || '')}</textarea></div>
        <div class="col-12"><label class="form-check"><input class="form-check-input" type="checkbox" name="aceptaPublicidad" ${c && c.aceptaPublicidad ? 'checked' : ''}> <span class="form-check-label">Acepta recibir ofertas por correo</span></label></div>
      </div></form>`,
      pie: `<button class="btn btn-light" data-bs-dismiss="modal">Cancelar</button><button class="btn btn-primary" id="cli-ok"><i class="bi bi-check2"></i> Guardar</button>`
    });
    const f = $('#f-cli', m.el);
    $('#cli-ok', m.el).addEventListener('click', ev => P.enviando(ev.currentTarget, async () => {
      try {
        const r = await api(c ? `/gestion/clientes/${c.id}` : '/gestion/clientes', { method: c ? 'PUT' : 'POST', body: P.leerForm(f) });
        m.cerrar(); P.toast(r.mensaje);
        if (!c) location.hash = '#/clientes/' + r.id; else P.refrescar();
      } catch (err) { P.errorForm(f, err); }
    }));
  }

  /* =========================================================
     CAJA Y PAGOS
     ========================================================= */
  P.ruta('caja', {
    titulo: 'Caja y pagos',
    async render(v) {
      const hoy = P.hoyLima();
      v.innerHTML = cabecera('Caja y pagos', 'Cobros registrados por método de pago.',
        `<button class="btn btn-light" id="cj-csv"><i class="bi bi-download"></i> Exportar CSV</button>
         <button class="btn btn-light" onclick="window.print()"><i class="bi bi-printer"></i> Imprimir cierre</button>`) + `
        <div class="card-x p-0 mb-3"><form class="toolbar" id="cj-f">
          <div><label class="form-label">Desde</label><input class="form-control" type="date" name="desde" value="${hoy}"></div>
          <div><label class="form-label">Hasta</label><input class="form-control" type="date" name="hasta" value="${hoy}"></div>
          <div><label class="form-label">Método</label><select class="form-select" name="metodo"><option value="">Todos</option>${['Tarjeta', 'Yape', 'Plin', 'Transferencia', 'Efectivo'].map(x => `<option>${x}</option>`).join('')}</select></div>
          <button class="btn btn-primary" type="submit"><i class="bi bi-funnel"></i> Ver</button>
          <div class="chips ms-lg-auto"><button type="button" class="chip" data-p="hoy">Hoy</button><button type="button" class="chip" data-p="ayer">Ayer</button><button type="button" class="chip" data-p="mes">Este mes</button></div>
        </form></div>
        <div id="cj-res"></div>`;
      const f = $('#cj-f', v);
      let datos = null;
      const cargar = async () => {
        const q = new URLSearchParams(Object.entries(P.leerForm(f)).filter(([, x]) => x));
        datos = await api('/gestion/pagos?' + q);
        const ICON = { Tarjeta: 'credit-card', Yape: 'phone', Plin: 'phone-vibrate', Transferencia: 'bank', Efectivo: 'cash' };
        $('#cj-res', v).innerHTML = `
          <div class="row g-3 mb-3">
            <div class="col-12 col-xl-4">${kpi('safe2', 'ok', `Total cobrado · ${datos.desde === datos.hasta ? fmt.fechaDia(datos.desde) : fmt.fecha(datos.desde, false) + ' – ' + fmt.fecha(datos.hasta)}`, fmt.S(datos.total), `${datos.cantidad} pago(s) aprobados`)}</div>
            ${datos.porMetodo.map(x => `<div class="col-6 col-xl-2">${kpi(ICON[x.metodo] || 'cash', '', x.metodo, fmt.S0(x.monto), `${x.cantidad} pago(s)`)}</div>`).join('')}
          </div>
          <div class="card-x p-0"><div class="table-responsive">${datos.pagos.length ? `<table class="table table-x table-hover"><thead><tr>
            <th>Fecha</th><th>Reserva</th><th>Cliente</th><th>Método</th><th>Referencia</th><th class="money">Monto</th><th>Registró</th><th>Estado</th>${P.sesion.esAdmin ? '<th><span class="visually-hidden">Acciones</span></th>' : ''}</tr></thead><tbody>
            ${datos.pagos.map(p => `<tr><td>${fmt.fechaHora(p.fechaPago)}</td><td><button class="btn btn-link p-0 code" data-reserva="${esc(p.codigoReserva)}">${esc(p.codigoReserva)}</button></td>
              <td>${esc(p.cliente)}</td><td>${esc(p.metodo)}</td><td class="small">${esc(p.referencia || '—')}</td>
              <td class="money">${fmt.S(p.montoSoles)}${p.moneda === 'USD' ? `<span class="sub">US$ ${p.monto.toFixed(2)} × ${p.tipoCambio}</span>` : ''}</td>
              <td class="small">${esc(p.registradoPor || 'Web')}</td><td>${badge(p.estado)}${p.motivoAnulacion ? `<span class="sub">${esc(p.motivoAnulacion)}</span>` : ''}</td>
              ${P.sesion.esAdmin ? `<td class="text-end">${p.estado === 'Aprobado' ? `<button class="btn btn-sm btn-light text-danger" data-anular="${p.id}" title="Anular pago"><i class="bi bi-x-circle"></i></button>` : ''}</td>` : ''}</tr>`).join('')}
            </tbody></table>` : P.vacio('No hay pagos en este periodo.', 'cash-stack')}</div></div>`;
        $$('[data-anular]', v).forEach(b => b.addEventListener('click', () => anularPago(Number(b.dataset.anular))));
      };
      $$('[data-p]', v).forEach(c => c.addEventListener('click', () => {
        const ayer = P.sumarDias(hoy, -1);
        const r = { hoy: [hoy, hoy], ayer: [ayer, ayer], mes: [hoy.slice(0, 8) + '01', hoy] }[c.dataset.p];
        f.desde.value = r[0]; f.hasta.value = r[1];
        cargar().catch(err => P.toast(err.message, 'error'));
      }));
      f.addEventListener('submit', e => { e.preventDefault(); cargar().catch(err => P.toast(err.message, 'error')); });
      $('#cj-csv', v).addEventListener('click', () => datos && P.csv(`caja-${datos.desde}-${datos.hasta}.csv`, [
        ['Fecha', 'Reserva', 'Cliente', 'Método', 'Moneda', 'Monto', 'Tipo de cambio', 'Monto S/', 'Referencia', 'Estado', 'Registró'],
        ...datos.pagos.map(p => [p.fechaPago, p.codigoReserva, p.cliente, p.metodo, p.moneda, p.monto, p.tipoCambio || '', p.montoSoles, p.referencia || '', p.estado, p.registradoPor || 'Web'])]));
      await cargar();
    }
  });

  function anularPago(id) {
    const m = P.modal({
      titulo: 'Anular pago',
      cuerpo: `<form id="f-an" novalidate><div class="alert alert-danger py-2 small form-alert" hidden></div>
        <p class="text-muted">El pago dejará de contar para el saldo de la reserva. Queda registrado quién lo anuló y por qué.</p>
        <label class="form-label">Motivo</label><input class="form-control" name="motivo" maxlength="200" placeholder="p. ej. monto digitado por error"></form>`,
      pie: `<button class="btn btn-light" data-bs-dismiss="modal">Volver</button><button class="btn btn-danger" id="an-ok">Anular pago</button>`
    });
    const f = $('#f-an', m.el);
    $('#an-ok', m.el).addEventListener('click', ev => P.enviando(ev.currentTarget, async () => {
      try { const r = await api(`/gestion/pagos/${id}/anular`, { method: 'POST', body: P.leerForm(f) }); m.cerrar(); P.toast(r.mensaje); P.refrescar(); }
      catch (err) { P.errorForm(f, err); }
    }));
  }

  /* =========================================================
     REPORTES (administrador)
     ========================================================= */
  P.ruta('reportes', {
    titulo: 'Reportes', rol: 'Administrador',
    async render(v) {
      const hoy = P.hoyLima();
      const y = hoy.slice(0, 4), mesIni = hoy.slice(0, 8) + '01';
      const prevFin = P.sumarDias(mesIni, -1), prevIni = prevFin.slice(0, 8) + '01';
      const PRESETS = { mes: ['Este mes', mesIni, hoy], pasado: ['Mes pasado', prevIni, prevFin], d30: ['Últimos 30 días', P.sumarDias(hoy, -29), hoy],
        d90: ['Últimos 90 días', P.sumarDias(hoy, -89), hoy], anio: ['Este año', y + '-01-01', hoy] };
      v.innerHTML = cabecera('Reportes de gestión', 'Indicadores hoteleros por periodo (las estadías se prorratean por noche).',
        `<button class="btn btn-light" id="rp-csv"><i class="bi bi-download"></i> CSV</button>
         <button class="btn btn-light" onclick="window.print()"><i class="bi bi-printer"></i> Imprimir / PDF</button>`) + `
        <div class="card-x p-0 mb-3"><form class="toolbar" id="rp-f">
          <div class="chips">${Object.entries(PRESETS).map(([k, [t]]) => `<button type="button" class="chip ${k === 'mes' ? 'active' : ''}" data-p="${k}">${t}</button>`).join('')}</div>
          <div class="ms-lg-auto"><label class="form-label">Desde</label><input class="form-control" type="date" name="desde" value="${mesIni}"></div>
          <div><label class="form-label">Hasta</label><input class="form-control" type="date" name="hasta" value="${hoy}"></div>
          <button class="btn btn-primary" type="submit">Aplicar</button>
        </form></div>
        <div id="rp-res"></div>`;
      const f = $('#rp-f', v);
      let r = null;
      const cargar = async () => {
        P.limpiarErrores(f);
        r = await api(`/gestion/reportes?desde=${f.desde.value}&hasta=${f.hasta.value}`);
        $('#rp-res', v).innerHTML = `
          <p class="text-muted small mb-3">Periodo: <strong>${fmt.fecha(r.desde)} – ${fmt.fecha(r.hasta)}</strong> · ${r.dias} días · ${r.habitaciones} habitaciones operativas</p>
          <div class="row g-3 mb-3">
            <div class="col-6 col-xl-3">${kpi('pie-chart', '', 'Ocupación', fmt.pct(r.ocupacion, 1), `${fmt.n(r.nochesOcupadas)} de ${fmt.n(r.nochesDisponibles)} noches`, `<div class="progress-thin"><span style="width:${Math.min(100, r.ocupacion * 100)}%"></span></div>`)}</div>
            <div class="col-6 col-xl-3">${kpi('tag', 'info', 'ADR · tarifa promedio', fmt.S(r.adr), 'Ingreso por noche ocupada')}</div>
            <div class="col-6 col-xl-3">${kpi('graph-up', 'ok', 'RevPAR', fmt.S(r.revpar), 'Ingreso por habitación disponible')}</div>
            <div class="col-6 col-xl-3">${kpi('cash-coin', 'ok', 'Ingresos de habitaciones', fmt.S0(r.ingresos), `Cobrado en el periodo: ${fmt.S0(r.cobrado)}`)}</div>
            <div class="col-6 col-xl-3">${kpi('calendar-check', '', 'Reservas con llegada', r.reservas, `${r.reservasEfectivas} efectivas`)}</div>
            <div class="col-6 col-xl-3">${kpi('x-octagon', r.tasaCancelacion > .1 ? 'bad' : 'warn', 'Cancelación + no show', fmt.pct(r.tasaCancelacion, 1), `${r.canceladas} canceladas · ${r.noShow} no show`)}</div>
            <div class="col-6 col-xl-3">${kpi('moon-stars', 'info', 'Estadía promedio', r.estadiaPromedio + ' noches', `Anticipación: ${r.anticipacionPromedio} días`)}</div>
            <div class="col-6 col-xl-3">${kpi('receipt', '', 'IGV generado', fmt.S0(r.igv), `Ventas exoneradas: ${fmt.S0(r.ventasExoneradas)}`)}</div>
          </div>
          <div class="row g-3 mb-3">
            <div class="col-xl-8"><div class="card-x"><div class="card-head"><h2><i class="bi bi-bar-chart"></i> Ocupación, ADR y RevPAR por mes</h2></div><div class="chart-box"><canvas id="rg-mes"></canvas></div></div></div>
            <div class="col-xl-4"><div class="card-x"><div class="card-head"><h2><i class="bi bi-calendar-week"></i> Ocupación por día de la semana</h2></div><div class="chart-box"><canvas id="rg-dia"></canvas></div></div></div>
          </div>
          <div class="row g-3 mb-3">
            <div class="col-md-6 col-xl-4"><div class="card-x"><div class="card-head"><h2><i class="bi bi-diagram-3"></i> Reservas por canal</h2></div><div class="chart-box sm"><canvas id="rg-canal"></canvas></div></div></div>
            <div class="col-md-6 col-xl-4"><div class="card-x"><div class="card-head"><h2><i class="bi bi-globe-americas"></i> Residentes vs. extranjeros</h2></div><div class="chart-box sm"><canvas id="rg-res"></canvas></div></div></div>
            <div class="col-xl-4"><div class="card-x"><div class="card-head"><h2><i class="bi bi-wallet2"></i> Cobros por método</h2></div><div class="chart-box sm"><canvas id="rg-pago"></canvas></div></div></div>
          </div>
          <div class="row g-3">
            <div class="col-xl-7"><div class="card-x p-0"><div class="card-head"><h2><i class="bi bi-door-open"></i> Rendimiento por tipo de habitación</h2></div>
              <div class="table-responsive mt-2"><table class="table table-x"><thead><tr><th>Tipo</th><th class="text-center">Hab.</th><th class="text-end">Noches</th><th class="text-end">Ocupación</th><th class="money">ADR</th><th class="money">Ingresos</th></tr></thead><tbody>
              ${r.porTipo.map(t => `<tr><td class="fw-medium">${esc(t.tipo)}</td><td class="text-center">${t.habitaciones}</td><td class="text-end">${fmt.n(t.noches)}</td><td class="text-end">${fmt.pct(t.ocupacion, 1)}</td><td class="money">${fmt.S(t.adr)}</td><td class="money">${fmt.S(t.ingresos)}</td></tr>`).join('')}
              </tbody></table></div></div></div>
            <div class="col-xl-5"><div class="card-x p-0"><div class="card-head"><h2><i class="bi bi-trophy"></i> Mejores clientes del periodo</h2></div>
              <div class="table-responsive mt-2">${r.topClientes.length ? `<table class="table table-x"><thead><tr><th>Cliente</th><th class="text-center">Reservas</th><th class="money">Total</th></tr></thead><tbody>
              ${r.topClientes.map(c => `<tr class="clickable" onclick="location.hash='#/clientes/${c.clienteId}'"><td>${esc(c.cliente)}</td><td class="text-center">${c.reservas}</td><td class="money">${fmt.S(c.total)}</td></tr>`).join('')}
              </tbody></table>` : P.vacio('Sin datos en el periodo.')}</div></div></div>
          </div>`;

        P.grafico($('#rg-mes'), { type: 'bar',
          data: { labels: r.porMes.map(x => fmt.mes(x.mes)), datasets: [
            { label: 'Ocupación %', data: r.porMes.map(x => x.ocupacion * 100), backgroundColor: '#12303A', borderRadius: 6, maxBarThickness: 40, yAxisID: 'y' },
            { label: 'ADR', data: r.porMes.map(x => x.adr), type: 'line', borderColor: '#B08D57', backgroundColor: '#B08D57', tension: .3, yAxisID: 'y1' },
            { label: 'RevPAR', data: r.porMes.map(x => x.revpar), type: 'line', borderColor: '#4F8A8B', backgroundColor: '#4F8A8B', borderDash: [5, 4], tension: .3, yAxisID: 'y1' }] },
          options: { scales: { y: { beginAtZero: true, max: 100, ticks: { callback: x => x + ' %' } }, y1: { position: 'right', beginAtZero: true, grid: { display: false }, ticks: { callback: x => fmt.S0(x) } }, x: { grid: { display: false } } },
            plugins: { tooltip: { callbacks: { label: c => c.dataset.yAxisID === 'y' ? `Ocupación ${c.parsed.y.toFixed(1)} %` : `${c.dataset.label} ${fmt.S(c.parsed.y)}` } } } } });
        P.grafico($('#rg-dia'), { type: 'bar',
          data: { labels: r.porDiaSemana.map(x => x.dia.slice(0, 3)), datasets: [{ data: r.porDiaSemana.map(x => x.ocupacion * 100), backgroundColor: r.porDiaSemana.map((x, i) => i >= 4 ? '#B08D57' : '#12303A'), borderRadius: 6 }] },
          options: { plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => c.parsed.y.toFixed(1) + ' %' } } }, scales: { y: { beginAtZero: true, max: 100, ticks: { callback: x => x + ' %' } }, x: { grid: { display: false } } } } });
        const dona = (id, labels, data) => P.grafico($(id), { type: 'doughnut', data: { labels, datasets: [{ data, backgroundColor: P.COLORES, borderWidth: 0 }] }, options: { cutout: '64%', plugins: { legend: { position: 'bottom' } } } });
        dona('#rg-canal', r.porCanal.map(x => P.CANALES[x.canal] || x.canal), r.porCanal.map(x => x.reservas));
        dona('#rg-res', r.porResidencia.map(x => x.residencia), r.porResidencia.map(x => x.reservas));
        P.grafico($('#rg-pago'), { type: 'bar', data: { labels: r.pagosPorMetodo.map(x => x.metodo), datasets: [{ data: r.pagosPorMetodo.map(x => x.monto), backgroundColor: '#B08D57', borderRadius: 6 }] },
          options: { indexAxis: 'y', plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => fmt.S(c.parsed.x) } } }, scales: { x: { ticks: { callback: x => fmt.S0(x) } }, y: { grid: { display: false } } } } });
      };
      $$('[data-p]', v).forEach(c => c.addEventListener('click', () => {
        $$('[data-p]', v).forEach(x => x.classList.toggle('active', x === c));
        const [, d, h] = PRESETS[c.dataset.p];
        f.desde.value = d; f.hasta.value = h;
        cargar().catch(err => P.errorForm(f, err));
      }));
      f.addEventListener('submit', e => { e.preventDefault(); $$('[data-p]', v).forEach(x => x.classList.remove('active')); cargar().catch(err => P.errorForm(f, err)); });
      $('#rp-csv', v).addEventListener('click', () => r && P.csv(`reporte-${r.desde}-${r.hasta}.csv`, [
        ['Indicador', 'Valor'], ['Desde', r.desde], ['Hasta', r.hasta], ['Habitaciones operativas', r.habitaciones],
        ['Noches disponibles', r.nochesDisponibles], ['Noches ocupadas', r.nochesOcupadas], ['Ocupación', r.ocupacion], ['ADR', r.adr], ['RevPAR', r.revpar],
        ['Ingresos', r.ingresos], ['Cobrado', r.cobrado], ['Reservas', r.reservas], ['Canceladas', r.canceladas], ['No show', r.noShow], ['IGV', r.igv], [],
        ['Mes', 'Noches', 'Ocupación', 'ADR', 'RevPAR', 'Ingresos'], ...r.porMes.map(x => [x.mes, x.noches, x.ocupacion, x.adr, x.revpar, x.ingresos]), [],
        ['Tipo', 'Habitaciones', 'Noches', 'Ocupación', 'ADR', 'Ingresos'], ...r.porTipo.map(x => [x.tipo, x.habitaciones, x.noches, x.ocupacion, x.adr, x.ingresos])]));
      await cargar();
    }
  });

  /* =========================================================
     TIPOS Y TARIFAS (administrador)
     ========================================================= */
  P.ruta('tarifas', {
    titulo: 'Tipos y tarifas', rol: 'Administrador',
    async render(v) {
      const tipos = await api('/gestion/tipos');
      v.innerHTML = cabecera('Tipos y tarifas', 'Las tarifas incluyen IGV. Un cambio de tarifa solo afecta a las reservas nuevas.',
        '<button class="btn btn-primary" id="tp-nuevo"><i class="bi bi-plus-lg"></i> Nuevo tipo</button>') + `
        <div class="row g-3">${tipos.map(t => `<div class="col-md-6 col-xl-4"><div class="card-x">
          <div class="d-flex justify-content-between align-items-start mb-2"><div><div class="fs-5 fw-medium">${esc(t.nombre)}</div><span class="code">${esc(t.codigo)}</span></div>${t.activo ? badge('Operativa') : '<span class="badge-x b-muted">Inactivo</span>'}</div>
          <div class="kpi-value mb-1">${fmt.S(t.precioNoche)} <small class="text-muted fs-6 fw-normal">/ noche</small></div>
          <p class="text-muted small">${esc(t.descripcion || '')}</p>
          <div class="d-flex flex-wrap gap-3 small mb-3"><span><i class="bi bi-people"></i> ${t.capacidad} huésp.</span><span><i class="bi bi-arrows-fullscreen"></i> ${t.metrosCuadrados} m²</span><span><i class="bi bi-door-open"></i> ${t.operativas}/${t.habitaciones} operativas</span></div>
          <button class="btn btn-light btn-sm" data-t="${t.id}"><i class="bi bi-pencil"></i> Editar</button></div></div>`).join('')}</div>`;
      $('#tp-nuevo', v).addEventListener('click', () => editarTipo(null));
      $$('[data-t]', v).forEach(b => b.addEventListener('click', () => editarTipo(tipos.find(t => t.id === Number(b.dataset.t)))));
    }
  });

  function editarTipo(t) {
    const m = P.modal({
      titulo: t ? 'Editar tipo de habitación' : 'Nuevo tipo de habitación',
      cuerpo: `<form id="f-tp" novalidate><div class="alert alert-danger py-2 small form-alert" hidden></div><div class="row g-3">
        <div class="col-md-7"><label class="form-label">Nombre</label><input class="form-control" name="nombre" value="${esc(t ? t.nombre : '')}"></div>
        <div class="col-md-5"><label class="form-label">Código (web)</label><input class="form-control" name="codigo" value="${esc(t ? t.codigo : '')}" placeholder="p. ej. bungalow"></div>
        <div class="col-md-4"><label class="form-label">Tarifa / noche (S/)</label><input class="form-control" type="number" step="0.01" min="1" name="precioNoche" value="${t ? t.precioNoche : ''}"></div>
        <div class="col-md-4"><label class="form-label">Capacidad</label><input class="form-control" type="number" min="1" max="8" name="capacidad" value="${t ? t.capacidad : 2}"></div>
        <div class="col-md-4"><label class="form-label">m²</label><input class="form-control" type="number" min="5" max="500" name="metrosCuadrados" value="${t ? t.metrosCuadrados : 25}"></div>
        <div class="col-12"><label class="form-label">Descripción</label><textarea class="form-control" name="descripcion" rows="2" maxlength="300">${esc(t && t.descripcion || '')}</textarea></div>
        <div class="col-12"><label class="form-check form-switch"><input class="form-check-input" type="checkbox" name="activo" ${!t || t.activo ? 'checked' : ''}> <span class="form-check-label">Activo (se ofrece en la web)</span></label></div>
      </div></form>`,
      pie: `<button class="btn btn-light" data-bs-dismiss="modal">Cancelar</button><button class="btn btn-primary" id="tp-ok"><i class="bi bi-check2"></i> Guardar</button>`
    });
    const f = $('#f-tp', m.el);
    $('#tp-ok', m.el).addEventListener('click', ev => P.enviando(ev.currentTarget, async () => {
      try { const r = await api(t ? `/gestion/tipos/${t.id}` : '/gestion/tipos', { method: t ? 'PUT' : 'POST', body: P.leerForm(f) }); m.cerrar(); P.toast(r.mensaje); P.refrescar(); }
      catch (err) { P.errorForm(f, err); }
    }));
  }

  /* =========================================================
     LIBRO DE RECLAMACIONES
     ========================================================= */
  P.ruta('reclamaciones', {
    titulo: 'Reclamaciones',
    async render(v) {
      const lista = await api('/gestion/reclamaciones');
      const hoy = P.hoyLima();
      const pend = lista.filter(r => r.estado === 'Pendiente');
      v.innerHTML = cabecera('Libro de Reclamaciones', 'Plazo legal de respuesta: 15 días hábiles (Ley N.° 29571).') + `
        <div class="row g-3 mb-3">
          <div class="col-4">${kpi('hourglass-split', pend.length ? 'warn' : 'ok', 'Pendientes', pend.length)}</div>
          <div class="col-4">${kpi('exclamation-octagon', pend.some(r => r.fechaLimiteRespuesta < hoy) ? 'bad' : 'ok', 'Vencidas', pend.filter(r => r.fechaLimiteRespuesta < hoy).length, 'Requieren atención inmediata')}</div>
          <div class="col-4">${kpi('check2-all', 'ok', 'Respondidas', lista.length - pend.length)}</div>
        </div>
        <div class="card-x p-0"><div class="table-responsive">${lista.length ? `<table class="table table-x table-hover"><thead><tr><th>N.°</th><th>Fecha</th><th>Tipo</th><th>Consumidor</th><th>Plazo</th><th>Estado</th></tr></thead><tbody>
          ${lista.map(r => { const venc = r.estado === 'Pendiente' && r.fechaLimiteRespuesta < hoy; return `<tr class="clickable" data-n="${esc(r.numero)}">
            <td class="code">${esc(r.numero)}</td><td>${fmt.fechaHora(r.fecha)}</td><td>${esc(r.tipo)}</td><td>${esc(r.nombreCompleto)}<span class="sub">${esc(r.email)}</span></td>
            <td class="${venc ? 'debt' : ''}">${fmt.fecha(r.fechaLimiteRespuesta)}${venc ? '<span class="sub text-danger">Vencido</span>' : ''}</td><td>${badge(r.estado)}</td></tr>`; }).join('')}
          </tbody></table>` : P.vacio('No hay hojas de reclamación.', 'journal-check')}</div></div>`;
      $$('[data-n]', v).forEach(row => row.addEventListener('click', () => verReclamo(lista.find(r => r.numero === row.dataset.n))));
    }
  });

  function verReclamo(r) {
    const puede = P.sesion.esAdmin && r.estado === 'Pendiente';
    const m = P.modal({
      titulo: `${esc(r.tipo)} N.° ${esc(r.numero)}`, tam: 'lg',
      cuerpo: `<form id="f-rc" novalidate><div class="alert alert-danger py-2 small form-alert" hidden></div>
        <dl class="dl-grid mb-3">
          <div><dt>Fecha</dt><dd>${fmt.fechaHora(r.fecha)}</dd></div><div><dt>Plazo de respuesta</dt><dd>${fmt.fecha(r.fechaLimiteRespuesta)}</dd></div>
          <div><dt>Consumidor</dt><dd>${esc(r.nombreCompleto)}</dd></div><div><dt>Documento</dt><dd>${esc(r.tipoDocumento)} ${esc(r.numeroDocumento)}</dd></div>
          <div><dt>Correo</dt><dd><a href="mailto:${esc(r.email)}">${esc(r.email)}</a></dd></div><div><dt>Teléfono</dt><dd>${esc(r.telefono)}</dd></div>
          <div class="full"><dt>Domicilio</dt><dd>${esc(r.domicilio)}</dd></div>
          ${r.esMenor ? `<div class="full"><dt>Apoderado</dt><dd>${esc(r.apoderado)}</dd></div>` : ''}
          <div><dt>${esc(r.bienTipo)}</dt><dd>${esc(r.descripcionBien)}</dd></div><div><dt>Monto reclamado</dt><dd>${r.montoReclamado != null ? fmt.S(r.montoReclamado) : '—'}</dd></div>
          ${r.codigoReserva ? `<div><dt>Reserva</dt><dd><button type="button" class="btn btn-link p-0 code" data-reserva="${esc(r.codigoReserva)}">${esc(r.codigoReserva)}</button></dd></div>` : ''}
          <div class="full"><dt>Detalle</dt><dd class="fw-normal" style="white-space:pre-line">${esc(r.detalle)}</dd></div>
          <div class="full"><dt>Pedido del consumidor</dt><dd class="fw-normal" style="white-space:pre-line">${esc(r.pedido)}</dd></div>
        </dl>
        <label class="form-label">Respuesta del proveedor${r.fechaRespuesta ? ' · ' + fmt.fechaHora(r.fechaRespuesta) : ''}</label>
        <textarea class="form-control" name="respuesta" rows="5" maxlength="2000" ${puede ? '' : 'readonly'} placeholder="${P.sesion.esAdmin ? '' : 'Solo un administrador puede responder.'}">${esc(r.respuesta || '')}</textarea>
        ${puede ? '<div class="form-text">La respuesta se registra aquí; envíala también al correo del consumidor.</div>' : ''}</form>`,
      pie: `<button class="btn btn-light" data-bs-dismiss="modal">Cerrar</button>${puede ? '<button class="btn btn-primary" id="rc-ok"><i class="bi bi-send-check"></i> Registrar respuesta</button>' : ''}`
    });
    if (!puede) return;
    const f = $('#f-rc', m.el);
    $('#rc-ok', m.el).addEventListener('click', ev => P.enviando(ev.currentTarget, async () => {
      try { const x = await api(`/gestion/reclamaciones/${encodeURIComponent(r.numero)}/respuesta`, { method: 'PATCH', body: P.leerForm(f) }); m.cerrar(); P.toast(x.mensaje); P.refrescar(); }
      catch (err) { P.errorForm(f, err); }
    }));
  }

  /* =========================================================
     USUARIOS (administrador)
     ========================================================= */
  P.ruta('usuarios', {
    titulo: 'Usuarios', rol: 'Administrador',
    async render(v) {
      const lista = await api('/gestion/usuarios');
      const yo = P.sesion.usuario.id;
      v.innerHTML = cabecera('Usuarios del panel', 'Administradores y recepcionistas con acceso al sistema.',
        '<button class="btn btn-primary" id="us-nuevo"><i class="bi bi-person-plus"></i> Nuevo usuario</button>') + `
        <div class="card-x p-0"><div class="table-responsive"><table class="table table-x table-hover"><thead><tr><th>Usuario</th><th>Rol</th><th>Estado</th><th>Último acceso</th><th><span class="visually-hidden">Acciones</span></th></tr></thead><tbody>
          ${lista.map(u => `<tr><td><div class="d-flex align-items-center gap-2"><span class="avatar">${fmt.iniciales(u.nombre)}</span><div><span class="fw-medium">${esc(u.nombre)}</span>${u.id === yo ? ' <span class="badge-x b-muted">Tú</span>' : ''}<span class="sub">${esc(u.email)}</span></div></div></td>
            <td>${badge(u.rol)}</td><td>${u.activo ? '<span class="badge-x b-ok">Activo</span>' : '<span class="badge-x b-muted">Desactivado</span>'}${u.debeCambiarClave ? '<span class="sub">Debe cambiar su contraseña</span>' : ''}</td>
            <td>${u.ultimoAcceso ? fmt.fechaHora(u.ultimoAcceso) : '<span class="text-muted">Nunca</span>'}</td>
            <td class="text-end"><button class="btn btn-sm btn-light" data-u="${u.id}"><i class="bi bi-pencil"></i> Editar</button></td></tr>`).join('')}
        </tbody></table></div></div>
        <p class="small text-muted mt-3"><i class="bi bi-shield-check"></i> Al desactivar un usuario o cambiar su contraseña o rol, sus sesiones abiertas se cierran al instante. Tras 5 intentos fallidos, la cuenta se bloquea 15 minutos.</p>`;
      $('#us-nuevo', v).addEventListener('click', () => editarUsuario(null));
      $$('[data-u]', v).forEach(b => b.addEventListener('click', () => editarUsuario(lista.find(u => u.id === Number(b.dataset.u)))));
    }
  });

  function editarUsuario(u) {
    const m = P.modal({
      titulo: u ? 'Editar usuario' : 'Nuevo usuario',
      cuerpo: `<form id="f-us" novalidate autocomplete="off"><div class="alert alert-danger py-2 small form-alert" hidden></div><div class="row g-3">
        <div class="col-12"><label class="form-label">Nombre completo</label><input class="form-control" name="nombre" value="${esc(u ? u.nombre : '')}"></div>
        <div class="col-12"><label class="form-label">Correo (usuario)</label><input class="form-control" type="email" name="email" value="${esc(u ? u.email : '')}"></div>
        <div class="col-md-6"><label class="form-label">Rol</label><select class="form-select" name="rol"><option value="Recepcionista" ${u && u.rol === 'Recepcionista' ? 'selected' : ''}>Recepcionista</option><option value="Administrador" ${u && u.rol === 'Administrador' ? 'selected' : ''}>Administrador</option></select></div>
        <div class="col-md-6 d-flex align-items-end"><label class="form-check form-switch mb-2"><input class="form-check-input" type="checkbox" name="activo" ${!u || u.activo ? 'checked' : ''}> <span class="form-check-label">Usuario activo</span></label></div>
        <div class="col-12"><label class="form-label">${u ? 'Nueva contraseña temporal <span class="text-muted">(déjala vacía para no cambiarla)</span>' : 'Contraseña temporal'}</label>
          <input class="form-control" type="text" name="clave" autocomplete="new-password" placeholder="Mínimo 8 caracteres, letras y números">
          <div class="form-text">El usuario deberá cambiarla en su próximo ingreso.</div></div>
        <div class="col-12 small text-muted"><strong>Recepcionista:</strong> dashboard, recepción, reservas, habitaciones (limpieza), clientes, caja y reclamaciones (lectura).<br><strong>Administrador:</strong> todo lo anterior, más reportes, tarifas, CRUD de habitaciones, anulación de pagos, respuesta a reclamos y usuarios.</div>
      </div></form>`,
      pie: `<button class="btn btn-light" data-bs-dismiss="modal">Cancelar</button><button class="btn btn-primary" id="us-ok"><i class="bi bi-check2"></i> Guardar</button>`
    });
    const f = $('#f-us', m.el);
    $('#us-ok', m.el).addEventListener('click', ev => P.enviando(ev.currentTarget, async () => {
      const body = P.leerForm(f);
      if (!body.clave) body.clave = null;
      try { await api(u ? `/gestion/usuarios/${u.id}` : '/gestion/usuarios', { method: u ? 'PUT' : 'POST', body }); m.cerrar(); P.toast(u ? 'Usuario actualizado.' : 'Usuario creado. Comparte la contraseña temporal de forma segura.'); P.refrescar(); }
      catch (err) { P.errorForm(f, err); }
    }));
  }

  /* =========================================================
     MI CUENTA
     ========================================================= */
  P.ruta('perfil', {
    titulo: 'Mi cuenta',
    async render(v) {
      const u = await api('/auth/yo');
      v.innerHTML = cabecera('Mi cuenta', '') + `<div class="row g-3"><div class="col-lg-5"><div class="card-x">
          <div class="d-flex align-items-center gap-3 mb-3"><span class="avatar" style="width:56px;height:56px;font-size:1.2rem">${fmt.iniciales(u.nombre)}</span>
          <div><div class="fs-5 fw-medium">${esc(u.nombre)}</div><div class="text-muted">${esc(u.email)}</div></div></div>
          <dl class="dl-grid"><div><dt>Rol</dt><dd>${badge(u.rol)}</dd></div><div><dt>Último acceso</dt><dd>${fmt.fechaHora(u.ultimoAcceso)}</dd></div></dl></div></div>
        <div class="col-lg-7"><div class="card-x"><div class="card-head"><h2><i class="bi bi-key"></i> Cambiar contraseña</h2></div>
          <form id="f-pw" novalidate><div class="alert alert-danger py-2 small form-alert" hidden></div><div class="row g-3">
            <div class="col-12"><label class="form-label">Contraseña actual</label><input class="form-control" type="password" name="claveActual" autocomplete="current-password"></div>
            <div class="col-md-6"><label class="form-label">Nueva contraseña</label><input class="form-control" type="password" name="claveNueva" autocomplete="new-password"></div>
            <div class="col-md-6"><label class="form-label">Repite la nueva</label><input class="form-control" type="password" id="pw-rep" autocomplete="new-password"></div>
            <div class="col-12"><button class="btn btn-primary" type="submit"><i class="bi bi-shield-check"></i> Actualizar contraseña</button></div>
          </div></form></div></div></div>`;
      const f = $('#f-pw', v);
      f.addEventListener('submit', async e => {
        e.preventDefault();
        const body = P.leerForm(f);
        if (body.claveNueva !== $('#pw-rep', f).value) return P.errorForm(f, { campo: 'claveNueva', message: 'Las contraseñas no coinciden.' });
        try {
          const token = await api('/auth/cambiar-clave', { method: 'POST', body });
          P.sesion.guardar(token, null);
          f.reset(); P.limpiarErrores(f); P.toast('Contraseña actualizada.');
        } catch (err) { P.errorForm(f, err); }
      });
    }
  });

  P.iniciarApp();
})();
