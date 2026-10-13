import { api } from '@/server/http';
import { cerrarViaje } from '@/server/services/manifiesto';
export const POST = api({ permiso: 'manifiesto:gestionar' }, async ({ user, params }) => cerrarViaje(user.id, params.id));
