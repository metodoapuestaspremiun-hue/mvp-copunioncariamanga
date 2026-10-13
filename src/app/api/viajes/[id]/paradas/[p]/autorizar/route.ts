import { z } from 'zod';
import { api } from '@/server/http';
import { ErrorNegocio } from '@/server/comun';
import { puede } from '@/shared/permisos';
import { autorizarSalida } from '@/server/services/salida';

export const POST = api({ permiso: null, schema: z.object({ tipo: z.enum(['normal', 'excepcion_a']), solicitadoPor: z.string().optional(), motivo: z.string().optional() }) },
  async ({ user, body, params }) => {
    const permiso = body.tipo === 'normal' ? 'salida:autorizar' : 'excepcion:autorizar';
    if (!puede(user, permiso)) throw new ErrorNegocio('SIN_PERMISO', 'No tienes permiso para autorizar esta salida', undefined, 403);
    return autorizarSalida(user.id, { viajeId: params.id, parada: Number(params.p), ...body });
  });
