import { api } from '@/server/http';
import { pool } from '@/server/db';
import { vistaParada } from '@/server/services/salida';
export const GET = api({ permiso: null }, async ({ params }) => vistaParada(pool, params.id, Number(params.p)));
