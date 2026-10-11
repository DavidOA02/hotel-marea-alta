/* ==========================================================
   HOTEL MAREA ALTA — Cliente de la API (fetch)
   Uso: MareaAPI.request('/reservas', { method: 'POST', body: {...} })
   ========================================================== */
(function () {
  'use strict';

  const base = ((window.CONFIG && window.CONFIG.apiUrl) || '').replace(/\/+$/, '');

  class ApiError extends Error {
    constructor(message, status, data) {
      super(message);
      this.name = 'ApiError';
      this.status = status;      // 0 = sin conexión
      this.data = data || null;  // { mensaje, campo, errores }
      this.campo = (data && data.campo) || null;
    }
  }

  const MENSAJES = {
    0: 'No pudimos conectar con el servidor. Revisa tu conexión o escríbenos por WhatsApp.',
    401: 'Clave de administración incorrecta.',
    404: 'No encontramos lo que buscas.',
    429: 'Demasiadas solicitudes seguidas. Espera un minuto e inténtalo de nuevo.',
    500: 'Ocurrió un error en el servidor. Inténtalo más tarde o escríbenos por WhatsApp.',
    503: 'El servicio no está disponible en este momento.'
  };

  async function request(path, { method = 'GET', body, headers = {}, timeout = 15000 } = {}) {
    if (!base) throw new ApiError('La API no está configurada.', 0);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeout);
    try {
      const res = await fetch(base + path, {
        method,
        headers: { Accept: 'application/json', ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...headers },
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: ctrl.signal
      });
      const text = await res.text();
      let data = null;
      try { data = text ? JSON.parse(text) : null; } catch (e) { data = null; }
      if (!res.ok) {
        const msg = (data && (data.mensaje || data.title)) || MENSAJES[res.status] || MENSAJES[500];
        throw new ApiError(msg, res.status, data);
      }
      return data;
    } catch (err) {
      if (err instanceof ApiError) throw err;
      throw new ApiError(err.name === 'AbortError' ? 'El servidor tardó demasiado en responder.' : MENSAJES[0], 0);
    } finally {
      clearTimeout(timer);
    }
  }

  // Comprueba una sola vez si la API (y su base de datos) está disponible
  let readyPromise = null;
  function ready() {
    if (!readyPromise) {
      readyPromise = base
        ? request('/salud', { timeout: 3000 }).then(() => true, () => false)
        : Promise.resolve(false);
      readyPromise.then(ok => {
        document.documentElement.classList.toggle('api-online', ok);
        if (!ok && base) console.info('[Marea Alta] API no disponible: modo sin backend (WhatsApp/Formspree).');
      });
    }
    return readyPromise;
  }

  // Fecha AAAA-MM-DD → "16 oct 2026"
  const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  function fecha(iso, conAnio = false) {
    if (!iso) return '';
    const [y, m, d] = iso.slice(0, 10).split('-');
    return `${Number(d)} ${MESES[Number(m) - 1]}${conAnio ? ' ' + y : ''}`;
  }
  const soles = new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN', minimumFractionDigits: 2 });

  window.MareaAPI = { request, ready, ApiError, fecha, soles: n => soles.format(Number(n || 0)), get enabled() { return !!base; } };
})();
