import { api } from '@/server/http';
import { listarTripulantes } from '@/server/services/manifiesto';
import { pool } from '@/server/db';

/** GET /api/tripulantes — Lista usuarios disponibles como chofer/ayudante */
export const GET = api({ permiso: null }, async () => listarTripulantes(pool));
