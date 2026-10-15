import { api } from '@/server/http';
import { cerrarManifiesto } from '@/server/services/manifiesto';

export const POST = api({ permiso: 'manifiesto:gestionar' }, async ({ user, params, req }) => {
  const body = await req.json().catch(() => ({}));
  return cerrarManifiesto(user.id, params.id, {
    conductorId:     body?.conductorId     ?? null,
    conductorNombre: body?.conductorNombre ?? null,
    ayudanteId:      body?.ayudanteId      ?? null,
    ayudanteNombre:  body?.ayudanteNombre  ?? null,
  });
});

