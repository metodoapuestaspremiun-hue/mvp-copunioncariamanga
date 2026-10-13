import { z } from 'zod';
import { api } from '@/server/http';
import { pool } from '@/server/db';
import { abrirIncidencia, listarIncidencias, TIPOS } from '@/server/services/incidencias';
export const GET = api({ permiso: null, schema: z.object({ todas: z.string().optional() }) }, async ({ body }) => listarIncidencias(pool, body.todas !== '1'));
export const POST = api({ permiso: null, schema: z.object({ tipo: z.enum(TIPOS), codigo: z.string().optional(), viajeId: z.string().optional(), nota: z.string().max(500).optional() }) },
  async ({ user, body }) => abrirIncidencia(user.id, body));
