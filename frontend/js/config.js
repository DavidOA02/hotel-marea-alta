/* ==========================================================
   HOTEL MAREA ALTA — CONFIGURACIÓN (edita antes de publicar)
   ========================================================== */
window.CONFIG = {
  // URL de la API ASP.NET Core (backend/HotelApi).
  // · En tu PC:          'http://localhost:5000/api'
  // · Publicado:         'https://api.mareaalta.pe/api'
  // · Sin backend (''):  la web funciona igual en modo WhatsApp/Formspree.
  // Si la API no responde, la web cambia sola al modo sin backend.
  apiUrl: 'http://localhost:5000/api',

  // Panel: minutos sin actividad antes de cerrar la sesión (PC compartida de recepción)
  panelInactividadMin: 30,

  whatsapp: '51999999999',      // número con código de país, sin + ni espacios
  formEndpoint: '',             // Formspree (solo se usa si NO hay API)
  tipoCambio: 3.70,             // soles por dólar (referencial; actualízalo)
  igv: 0.18,

  // Tarifas por noche en soles con IGV. Si la API está activa, se
  // reemplazan automáticamente por las de la base de datos.
  rooms: {
    duna:      { name: 'Habitación Duna',      price: 450,  cap: 2 },
    horizonte: { name: 'Habitación Horizonte', price: 650,  cap: 3 },
    pleamar:   { name: 'Suite Pleamar',        price: 1090, cap: 4 }
  }
};
