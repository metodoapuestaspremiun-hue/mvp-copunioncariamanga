import { z } from 'zod';
import { api } from '@/server/http';
import { registrarConteo } from '@/server/services/salida';
export const POST = api({ permiso: 'conteo:continuan', schema: z.object({ conteo: z.number().int().min(0) }) },
  async ({ user, body, params }) => registrarConteo(user.id, { viajeId: params.id, parada: Number(params.p), conteo: body.conteo }));
