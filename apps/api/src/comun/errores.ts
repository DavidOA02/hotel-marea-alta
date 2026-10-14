import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import type { Response } from 'express';

/** Error de negocio con mensaje para el usuario y campo opcional. */
export class ErrorNegocio extends HttpException {
  constructor(status: number, mensaje: string, campo: string | null = null) {
    super({ mensaje, campo }, status);
  }
}
export const falla = (status: number, mensaje: string, campo: string | null = null) => new ErrorNegocio(status, mensaje, campo);

/** Todas las respuestas de error tienen la forma { mensaje, campo }. */
@Catch()
export class FiltroErrores implements ExceptionFilter {
  private readonly log = new Logger('Errores');
  catch(e: any, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    if (e instanceof HttpException) {
      const cuerpo: any = e.getResponse();
      const mensaje = typeof cuerpo === 'string' ? cuerpo : cuerpo.mensaje ?? (Array.isArray(cuerpo.message) ? cuerpo.message[0] : cuerpo.message) ?? 'Error.';
      const campo = typeof cuerpo === 'object' ? cuerpo.campo ?? null : null;
      const textos: Record<number, string> = { 401: 'Tu sesión no es válida. Ingresa de nuevo.', 403: 'No tienes permiso para esta acción.', 404: 'No encontrado.' };
      return res.status(e.getStatus()).json({ mensaje: mensaje === 'Unauthorized' || mensaje === 'Forbidden resource' || mensaje.startsWith('Cannot ') ? textos[e.getStatus()] ?? mensaje : mensaje, campo });
    }
    // Errores de PostgreSQL convertidos en mensajes útiles
    if (e?.code === '23P01') return res.status(409).json({ mensaje: 'Esa habitación acaba de ser reservada para esas fechas. Inténtalo de nuevo.', campo: 'fechaEntrada' });
    if (e?.code === '23505') return res.status(409).json({ mensaje: 'Ya existe un registro con esos datos.', campo: null });
    if (e?.code === '40001' || e?.code === '40P01') return res.status(409).json({ mensaje: 'Otra operación se realizó al mismo tiempo. Inténtalo de nuevo.', campo: null });
    if (e?.type === 'entity.parse.failed') return res.status(400).json({ mensaje: 'El cuerpo de la petición no es un JSON válido.', campo: null });
    if (e?.type === 'entity.too.large') return res.status(413).json({ mensaje: 'El cuerpo de la petición es demasiado grande.', campo: null });
    // Dato imposible que llegó a la base (número fuera de rango, fecha o texto con formato no válido): es del cliente, no del servidor
    if (['22P02', '22003', '22007', '22008'].includes(e?.code)) {
      // PostgreSQL puede incluir el valor recibido (datos personales) en su mensaje.
      this.log.warn(`Dato rechazado por PostgreSQL (${e.code}).`);
      return res.status(400).json({ mensaje: 'Algún dato no tiene un formato válido. Revísalo e inténtalo de nuevo.', campo: null });
    }
    this.log.error(e?.stack ?? e);
    return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ mensaje: 'Ocurrió un error en el servidor. Inténtalo más tarde.', campo: null });
  }
}
