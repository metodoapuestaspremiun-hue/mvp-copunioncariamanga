import { api } from '@/server/http';
import { pool, q } from '@/server/db';
export const GET = api({ permiso: null }, async () => q(pool, 'SELECT id,nombre FROM usuario WHERE activo=1 ORDER BY nombre'));
