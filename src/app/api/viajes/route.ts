import { z } from 'zod';
import { api } from '@/server/http';
import { pool } from '@/server/db';
import { crearViaje, listarViajes } from '@/server/services/manifiesto';
export const GET = api({ permiso: null }, async () => listarViajes(pool));
export const POST = api({ permiso: 'manifiesto:gestionar', schema: z.object({ rutaId: z.string(), fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), vehiculo: z.string().min(1).max(40), conductor: z.string().max(80).nullish() }) },
  async ({ user, body }) => crearViaje(user.id, body));
