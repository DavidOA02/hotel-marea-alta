'use client';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { api, ApiError } from '@/lib/api';

export interface UsuarioPanel { id: number; nombre: string; email: string; rol: 'Administrador' | 'Recepcionista'; debeCambiarClave: boolean; ultimoAcceso?: string | null }
interface RespuestaToken { accessToken: string; refreshToken: string; expiresIn: number; usuario: UsuarioPanel }
interface EstadoSesion {
  token: string | null; refresh: string | null; expira: number; usuario: UsuarioPanel | null;
  guardar: (r: RespuestaToken) => void;
  salir: (motivo?: string) => void;
}

/** Sesión del panel (Zustand). Se guarda en sessionStorage: se borra al cerrar la pestaña. */
export const useSesion = create<EstadoSesion>()(persist((set) => ({
  token: null, refresh: null, expira: 0, usuario: null,
  guardar: r => set({ token: r.accessToken, refresh: r.refreshToken, expira: Date.now() + (r.expiresIn - 60) * 1000, usuario: r.usuario }),
  salir: motivo => {
    set({ token: null, refresh: null, expira: 0, usuario: null });
    if (typeof window !== 'undefined') window.location.href = '/panel' + (motivo ? `?motivo=${motivo}` : '');
  }
}), { name: 'marea-panel', storage: createJSONStorage(() => sessionStorage) }));

export const esAdmin = () => useSesion.getState().usuario?.rol === 'Administrador';

/** Refresco global: las acciones del panel lo incrementan y las vistas recargan sus datos. */
export const useRefresco = create<{ n: number; refrescar: () => void }>(set => ({ n: 0, refrescar: () => set(s => ({ n: s.n + 1 })) }));
export const refrescar = () => useRefresco.getState().refrescar();

let renovando: Promise<void> | null = null;
async function renovar() {
  const { refresh, guardar } = useSesion.getState();
  if (!refresh) throw new ApiError('Sin sesión', 401);
  renovando ??= api<RespuestaToken>('/auth/renovar', { method: 'POST', body: { refreshToken: refresh } }).then(guardar).finally(() => { renovando = null; });
  return renovando;
}

/** API autenticada: renueva el token antes de que venza y cierra la sesión si deja de ser válida. */
export async function apiPanel<T = any>(ruta: string, opciones: { method?: string; body?: unknown } = {}): Promise<T> {
  const s = useSesion.getState();
  if (s.refresh && s.expira - Date.now() < 5 * 60 * 1000) {
    try { await renovar(); } catch { useSesion.getState().salir('expirada'); throw new ApiError('Tu sesión expiró.', 401); }
  }
  try {
    return await api<T>(ruta, { ...opciones, token: useSesion.getState().token });
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) useSesion.getState().salir('expirada');
    throw e;
  }
}
