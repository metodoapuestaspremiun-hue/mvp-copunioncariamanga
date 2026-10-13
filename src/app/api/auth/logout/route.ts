import { api } from '@/server/http';
import { cerrarSesion } from '@/server/auth';
export const POST = api({ permiso: null }, async () => { await cerrarSesion(); return { ok: true }; });
