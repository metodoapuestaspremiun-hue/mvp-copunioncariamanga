import { z } from 'zod';
import { api } from '@/server/http';
import { iniciarSesion } from '@/server/auth';

export const POST = api({ permiso: 'publico', schema: z.object({ email: z.string().min(3), password: z.string().min(1) }) },
  async ({ body }) => {
    const u = await iniciarSesion(body.email, body.password);
    return { id: u.id, nombre: u.nombre, roles: u.roles };
  });
