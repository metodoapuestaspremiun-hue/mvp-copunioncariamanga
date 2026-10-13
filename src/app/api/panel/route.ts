import { api } from '@/server/http';
import { pool } from '@/server/db';
import { panel } from '@/server/services/consultas';
export const GET = api({ permiso: 'ver:panel' }, async () => panel(pool));
