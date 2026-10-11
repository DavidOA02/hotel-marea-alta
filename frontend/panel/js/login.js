/* Inicio de sesión y cambio de contraseña obligatorio */
(function () {
  'use strict';
  const P = window.Panel;
  const $ = id => document.getElementById(id);
  $('anio').textContent = new Date().getFullYear();

  const motivo = new URLSearchParams(location.search).get('motivo');
  const avisos = { expirada: 'Tu sesión expiró o fue cerrada. Ingresa de nuevo.', salida: '', cambiar: 'Debes cambiar tu contraseña para continuar.', inactividad: 'Cerramos tu sesión por inactividad para proteger los datos del hotel.' };
  // Los usuarios de prueba solo se muestran al trabajar en tu PC (no en el sitio publicado)
  if (!['localhost', '127.0.0.1'].includes(location.hostname)) $('demo-users').remove();
  if (avisos[motivo]) { const a = $('login-alert'); a.textContent = avisos[motivo]; a.className = 'alert alert-warning py-2 small'; a.hidden = false; }
  if (P.sesion.get() && P.sesion.usuario && !P.sesion.usuario.debeCambiarClave) location.replace('app.html');

  document.querySelectorAll('[data-toggle-pw]').forEach(b => b.addEventListener('click', () => {
    const i = $(b.dataset.togglePw);
    i.type = i.type === 'password' ? 'text' : 'password';
    b.innerHTML = `<i class="bi bi-eye${i.type === 'password' ? '' : '-slash'}"></i>`;
  }));
  document.querySelectorAll('[data-demo]').forEach(b => b.addEventListener('click', () => {
    const [e, c] = b.dataset.demo.split('|');
    $('email').value = e; $('clave').value = c; $('clave').focus();
  }));

  const alerta = (id, msg) => { const a = $(id); a.textContent = msg; a.className = 'alert alert-danger py-2 small'; a.hidden = !msg; };

  $('form-login').addEventListener('submit', async ev => {
    ev.preventDefault();
    const email = $('email').value.trim(), clave = $('clave').value;
    if (!email || !clave) return alerta('login-alert', 'Escribe tu correo y contraseña.');
    alerta('login-alert', '');
    const btn = $('btn-login');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Ingresando…';
    try {
      const listo = await window.MareaAPI.ready();
      if (!listo) throw new Error('No se pudo conectar con la API. ¿Está ejecutándose el backend (dotnet run)?');
      const token = await P.api('/auth/login', { method: 'POST', body: { email, clave } });
      P.sesion.guardar(token, null);
      const u = await P.api('/auth/yo');
      P.sesion.guardar(null, u);
      if (u.debeCambiarClave) {
        $('clave-actual').value = clave;
        $('form-login').hidden = true;
        $('form-cambio').hidden = false;
        $('clave-nueva').focus();
      } else {
        location.replace('app.html');
      }
    } catch (err) {
      alerta('login-alert', err.message);
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<i class="bi bi-box-arrow-in-right"></i> Ingresar';
    }
  });

  $('form-cambio').addEventListener('submit', async ev => {
    ev.preventDefault();
    const nueva = $('clave-nueva').value, repite = $('clave-repite').value;
    if (nueva !== repite) return alerta('cambio-alert', 'Las contraseñas no coinciden.');
    try {
      const token = await P.api('/auth/cambiar-clave', { method: 'POST', body: { claveActual: $('clave-actual').value, claveNueva: nueva } });
      P.sesion.guardar(token, null);
      const u = await P.api('/auth/yo');
      P.sesion.guardar(null, u);
      location.replace('app.html');
    } catch (err) { alerta('cambio-alert', err.message); }
  });
})();
