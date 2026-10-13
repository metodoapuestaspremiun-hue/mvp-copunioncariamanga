import { z } from 'zod';
import { api } from '@/server/http';
import { resolverIncidencia } from '@/server/services/incidencias';
export const POST = api({ permiso: 'incidencia:resolver', schema: z.object({ nota: z.string().max(500).optional() }) },
  async ({ user, body, params }) => resolverIncidencia(user.id, params.id, body.nota));
