import { api } from '@/server/http';
import { pool } from '@/server/db';
import { listarMensajes } from '@/server/services/consultas';
export const GET = api({ permiso: 'ver:mensajes' }, async () => listarMensajes(pool));
