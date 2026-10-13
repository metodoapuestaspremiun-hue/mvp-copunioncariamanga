import { z } from 'zod';
import { api } from '@/server/http';
import { ErrorNegocio } from '@/server/comun';
import { verificarCredenciales } from '@/server/auth';
import { puede } from '@/shared/permisos';
import { entregar } from '@/server/services/entrega';

export const POST = api({ permiso: 'entrega:crear', schema: z.object({
  encomiendaId: z.string(), metodo: z.enum(['codigo', 'documento', 'tercero']), codigo: z.string().optional(),
  receptorNombre: z.string().min(1).max(100), receptorDoc: z.string().max(30).nullish(), motivo: z.string().nullish(),
  supervisor: z.object({ email: z.string(), password: z.string() }).nullish(),
}) }, async ({ user, body }) => {
  let supervisorId: string | null = null;
  if (body.supervisor?.email) {
    // El supervisor se identifica en el momento (usuario + contrasena): nadie aprueba "en nombre de" otro.
    const s = await verificarCredenciales(body.supervisor.email, body.supervisor.password);
    if (!s || !puede(s, 'entrega_parcial:autorizar')) throw new ErrorNegocio('SUPERVISOR_INVALIDO', 'Credenciales de supervisor incorrectas o sin permiso', undefined, 403);
    if (s.id === user.id) throw new ErrorNegocio('AUTORIZADOR_DISTINTO_DEL_SOLICITANTE', 'El supervisor debe ser otra persona');
    supervisorId = s.id;
  }
  const { supervisor: _s, ...resto } = body;
  return entregar(user.id, { ...resto, supervisorId });
});
