/** Validación de documentos de identidad (Perú). Devuelve un mensaje o null. */
export function validarDocumento(tipo: string, numero: string): string | null {
  const n = (numero || '').trim();
  switch (tipo) {
    case 'DNI': return /^\d{8}$/.test(n) ? null : 'El DNI debe tener 8 dígitos.';
    case 'CE': return /^[A-Za-z0-9]{9,12}$/.test(n) ? null : 'El carné de extranjería debe tener entre 9 y 12 caracteres.';
    case 'PAS': return /^[A-Za-z0-9]{6,12}$/.test(n) ? null : 'El pasaporte debe tener entre 6 y 12 letras o números.';
    case 'RUC': return /^(10|15|17|20)\d{9}$/.test(n) ? null : 'El RUC debe tener 11 dígitos.';
    default: return 'Tipo de documento no válido.';
  }
}

/** Celular: en Perú (+51) 9 dígitos que empiezan con 9; otros países, de 6 a 15 dígitos. */
export function validarTelefono(codigoPais: string, telefono: string): string | null {
  const t = (telefono || '').replace(/\D/g, '');
  if (codigoPais === '51') return /^9\d{8}$/.test(t) ? null : 'El celular debe tener 9 dígitos y empezar con 9.';
  return t.length >= 6 && t.length <= 15 ? null : 'Escribe un número de teléfono válido.';
}
