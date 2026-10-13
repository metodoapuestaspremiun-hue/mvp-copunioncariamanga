import { z } from 'zod';
import { api } from '@/server/http';
import { pool } from '@/server/db';
import { buscarEncomiendaParaEntrega } from '@/server/services/entrega';
export const GET = api({ permiso: 'entrega:crear', schema: z.object({ q: z.string().min(1) }) }, async ({ body }) => buscarEncomiendaParaEntrega(pool, body.q));
