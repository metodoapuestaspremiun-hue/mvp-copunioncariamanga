import { api } from '@/server/http';
import { pool } from '@/server/db';
import { csvEventos } from '@/server/services/consultas';
export const GET = api({ permiso: 'export:csv' }, async () =>
  new Response(await csvEventos(pool), { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="eventos.csv"' } }));
