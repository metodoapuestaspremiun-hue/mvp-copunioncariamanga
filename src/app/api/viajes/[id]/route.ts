import { api } from '@/server/http';
import { pool } from '@/server/db';
import { obtenerViaje } from '@/server/services/manifiesto';
export const GET = api({ permiso: null }, async ({ params }) => obtenerViaje(pool, params.id));
