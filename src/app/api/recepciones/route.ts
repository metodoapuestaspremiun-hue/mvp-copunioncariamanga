import { z } from 'zod';
import { api } from '@/server/http';
import { ErrorNegocio } from '@/server/comun';
import { puede } from '@/shared/permisos';
import { recibirBulto } from '@/server/services/recepcion';
export const POST = api({ permiso: 'recepcion:confirmar', schema: z.object({ codigo: z.string().min(1), agenciaId: z.string() }) },
  async ({ user, body }) => {
    if (!puede(user, 'recepcion:confirmar', body.agenciaId)) throw new ErrorNegocio('SIN_PERMISO', 'No puedes recibir en esa agencia', undefined, 403);
    return recibirBulto(user.id, body);
  });
