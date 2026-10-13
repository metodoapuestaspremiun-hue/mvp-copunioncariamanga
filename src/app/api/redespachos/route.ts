import { api } from '@/server/http';
import { pool } from '@/server/db';
import { listarRedespachos } from '@/server/services/recepcion';
export const GET = api({ permiso: null }, async () => listarRedespachos(pool));
