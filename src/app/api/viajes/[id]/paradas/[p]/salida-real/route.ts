import { api } from '@/server/http';
import { registrarSalidaReal } from '@/server/services/salida';
export const POST = api({ permiso: 'salida:registrar_real' }, async ({ user, params }) => registrarSalidaReal(user.id, { viajeId: params.id, parada: Number(params.p) }));
