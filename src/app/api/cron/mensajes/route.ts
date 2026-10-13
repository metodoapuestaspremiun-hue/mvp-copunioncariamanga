import { api } from '@/server/http';
import { ErrorNegocio } from '@/server/comun';
import { procesarCola } from '@/server/mensajes/cola';

// Lo llama el cron de cPanel cada minuto:  curl -s -X POST -H "x-cron-secret: TU_CLAVE" https://tu-dominio/api/cron/mensajes
const handler = api({ permiso: 'publico' }, async ({ req, url }) => {
  const clave = req.headers.get('x-cron-secret') ?? url.searchParams.get('clave');
  if (!process.env.CRON_SECRET || process.env.CRON_SECRET === 'cambia-esto' || clave !== process.env.CRON_SECRET) {
    throw new ErrorNegocio('NO_AUTORIZADO', 'Clave de cron invalida', undefined, 401);
  }
  return procesarCola();
});
export const POST = handler;
export const GET = handler;
