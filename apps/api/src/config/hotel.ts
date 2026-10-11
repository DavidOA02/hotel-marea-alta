/**
 * Datos del emisor (ficticios en este proyecto de práctica). Se leen al usarse, no al importar,
 * porque el .env se carga después de importar los módulos.
 */
export const HOTEL = {
  nombre: 'Hotel Marea Alta',
  get razonSocial() { return process.env.HOTEL_RAZON_SOCIAL || 'Marea Alta Hoteles S.A.C.'; },
  get ruc() { return process.env.HOTEL_RUC || '20000000000'; },
  direccion: 'Av. Paracas Mz. A Lt. 10, Paracas, Pisco – Ica',
  telefono: '+51 56 000 000',
  email: 'reservas@mareaalta.pe',
  get whatsapp() { return process.env.HOTEL_WHATSAPP || '51999999999'; }
};
