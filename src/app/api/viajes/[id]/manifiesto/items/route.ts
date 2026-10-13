import { z } from 'zod';
import { api } from '@/server/http';
import { agregarItem, quitarItem } from '@/server/services/manifiesto';
export const POST = api({ permiso: 'manifiesto:gestionar', schema: z.object({ codigo: z.string().min(1), subeOrden: z.coerce.number().int(), bajaOrden: z.coerce.number().int() }) },
  async ({ user, body, params }) => agregarItem(user.id, { viajeId: params.id, ...body }));
export const DELETE = api({ permiso: 'manifiesto:gestionar', schema: z.object({ bultoId: z.string() }) },
  async ({ user, body, params }) => quitarItem(user.id, { viajeId: params.id, bultoId: body.bultoId }));
