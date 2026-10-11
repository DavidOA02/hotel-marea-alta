import { API_URL } from './config';

/** Error de la API con { mensaje, campo } listo para mostrar en el formulario. */
export class ApiError extends Error {
  constructor(message: string, public status: number, public campo: string | null = null) { super(message); }
}

const MENSAJES: Record<number, string> = {
  0: 'No pudimos conectar con el servidor. Revisa tu conexión o escríbenos por WhatsApp.',
  401: 'Tu sesión no es válida. Ingresa de nuevo.', 403: 'No tienes permiso para esta acción.',
  429: 'Demasiadas solicitudes seguidas. Espera un minuto e inténtalo de nuevo.',
  500: 'Ocurrió un error en el servidor. Inténtalo más tarde.'
};

export async function api<T = any>(ruta: string, { method = 'GET', body, token, timeout = 15000 }:
  { method?: string; body?: unknown; token?: string | null; timeout?: number } = {}): Promise<T> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(API_URL + ruta, {
      method, signal: ctrl.signal, cache: 'no-store',
      headers: { Accept: 'application/json', ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined
    });
    const texto = await res.text();
    const data = texto ? JSON.parse(texto) : null;
    if (!res.ok) throw new ApiError(data?.mensaje || MENSAJES[res.status] || MENSAJES[500], res.status, data?.campo ?? null);
    return data as T;
  } catch (e: any) {
    if (e instanceof ApiError) throw e;
    throw new ApiError(e?.name === 'AbortError' ? 'El servidor tardó demasiado en responder.' : MENSAJES[0], 0);
  } finally { clearTimeout(t); }
}
