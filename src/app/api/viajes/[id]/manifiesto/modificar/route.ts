import { z } from 'zod';
import { api } from '@/server/http';
import { modificarManifiesto } from '@/server/services/manifiesto';
export const POST = api({ permiso: 'manifiesto:gestionar', schema: z.object({ motivo: z.string() }) },
  async ({ user, body, params }) => modificarManifiesto(user.id, params.id, body.motivo));
