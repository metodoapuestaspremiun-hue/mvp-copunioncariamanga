import { z } from 'zod';
import { cookies } from 'next/headers';
import { api } from '@/server/http';
import { ErrorNegocio } from '@/server/comun';

// Las 4 cuentas simples con sus contraseñas
const CUENTAS: Record<string, { rolId: string; nombre: string; rolDesc: string }> = {
  'ventanilla1.': { rolId: 'operador', nombre: 'Operador de Ventanilla', rolDesc: 'Ventanilla y Encomiendas' },
  'ayudantebus1.': { rolId: 'ayudante', nombre: 'Ayudante de Bus', rolDesc: 'Manifiestos y Escaneo' },
  'conductor1.': { rolId: 'guardia', nombre: 'Conductor / Control Salida', rolDesc: 'Control y Salida' },
  'gerencia1.': { rolId: 'gerente', nombre: 'Gerencia General', rolDesc: 'Supervisión y Reportes' },
};

export const POST = api({
  permiso: 'publico',
  schema: z.object({
    password: z.string().min(1),
  }),
}, async ({ body }) => {
  const clave = body.password.trim();
  const cuenta = CUENTAS[clave];

  if (!cuenta) {
    throw new ErrorNegocio('CREDENCIALES_INVALIDAS', 'Contraseña incorrecta. Verifica tu contraseña de perfil.', undefined, 401);
  }

  // Guardar cookie de sesión del rol elegido
  const cookieStore = await cookies();
  cookieStore.set('demo_rol', cuenta.rolId, {
    path: '/',
    maxAge: 60 * 60 * 24 * 7, // 7 días
    sameSite: 'lax',
    secure: process.env.COOKIE_SECURE === 'true',
  });

  return {
    ok: true,
    rolId: cuenta.rolId,
    nombre: cuenta.nombre,
    redirect: '/panel',
  };
});
