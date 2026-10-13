import { z } from 'zod';
import { api } from '@/server/http';
import { pool } from '@/server/db';
import { buscarBultoPorCodigo } from '@/server/services/consultas';
export const GET = api({ permiso: null, schema: z.object({ codigo: z.string().min(1) }) }, async ({ body }) => buscarBultoPorCodigo(pool, body.codigo));
