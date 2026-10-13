import { api } from '@/server/http';
import { cerrarManifiesto } from '@/server/services/manifiesto';
export const POST = api({ permiso: 'manifiesto:gestionar' }, async ({ user, params }) => cerrarManifiesto(user.id, params.id));
