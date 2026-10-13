import { api } from '@/server/http';
import { pool } from '@/server/db';
import { lineaDeTiempo } from '@/server/services/consultas';
export const GET = api({ permiso: null }, async ({ params }) => lineaDeTiempo(pool, params.id));
