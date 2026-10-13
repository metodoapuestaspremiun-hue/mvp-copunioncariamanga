import { api } from '@/server/http';
import { pool } from '@/server/db';
import { obtenerEncomienda } from '@/server/services/encomienda';
export const GET = api({ permiso: null }, async ({ params }) => obtenerEncomienda(pool, params.id));
