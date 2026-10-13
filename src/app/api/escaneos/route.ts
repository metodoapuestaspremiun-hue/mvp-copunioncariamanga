import { z } from 'zod';
import { api } from '@/server/http';
import { escanear } from '@/server/services/escanear';
export const POST = api({ permiso: 'escaneo:operar', schema: z.object({
  eventId: z.string().uuid(), tipo: z.enum(['carga', 'descarga']), viajeId: z.string(), parada: z.number().int().positive(),
  codigo: z.string().min(1).max(64), deviceId: z.string().max(80).optional(), declaradoAt: z.string().optional(),
}) }, async ({ user, body }) => escanear({ ...body, actorId: user.id }));
