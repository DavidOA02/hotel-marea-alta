export const API_URL = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api').replace(/\/+$/, '');
export const WHATSAPP = process.env.NEXT_PUBLIC_WHATSAPP || '51999999999';
export const TIPO_CAMBIO = Number(process.env.NEXT_PUBLIC_TIPO_CAMBIO || 3.7);
export const HOTEL = {
  nombre: 'Hotel Marea Alta', razon: 'Marea Alta Hoteles S.A.C.', ruc: '20000000000',
  direccion: 'Av. Paracas Mz. A Lt. 10, Paracas, Pisco – Ica', telefono: '+51 56 000 000', email: 'reservas@mareaalta.pe'
};
export const enlaceWhatsapp = (texto = 'Hola, quisiera información sobre el Hotel Marea Alta.') =>
  `https://wa.me/${WHATSAPP}?text=${encodeURIComponent(texto)}`;
