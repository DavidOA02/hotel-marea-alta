import { AsyncLocalStorage } from 'async_hooks';
import type { NextFunction, Request, Response } from 'express';

export interface Contexto { ip: string | null; usuario: { id: number; nombre: string; email: string; rol: string } | null }

/** Datos de la petición en curso (IP y usuario) disponibles en cualquier servicio, sin pasarlos de mano en mano. */
export const contexto = new AsyncLocalStorage<Contexto>();

export function middlewareContexto(req: Request, _res: Response, next: NextFunction) {
  contexto.run({ ip: req.ip ?? null, usuario: null }, next);
}
