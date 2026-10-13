import { api } from '@/server/http';
import { pool } from '@/server/db';
import { catalogos } from '@/server/services/encomienda';
export const GET = api({ permiso: null }, async () => catalogos(pool));
