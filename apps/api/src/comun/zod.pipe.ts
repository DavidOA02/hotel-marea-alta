import { BadRequestException, PipeTransform } from '@nestjs/common';
import { primerError } from '@marea/shared';
import type { ZodType } from 'zod';

/** Valida el cuerpo con un esquema Zod compartido y responde { mensaje, campo }. */
export class ZodPipe implements PipeTransform {
  constructor(private readonly esquema: ZodType) {}
  transform(valor: unknown) {
    const r = this.esquema.safeParse(valor);
    if (!r.success) throw new BadRequestException(primerError(r.error));
    return r.data;
  }
}
