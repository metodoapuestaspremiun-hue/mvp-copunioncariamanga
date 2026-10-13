import { z } from 'zod';
import { api } from '@/server/http';
import { pool } from '@/server/db';
import { cotizarPara } from '@/server/services/encomienda';

export const POST = api({ permiso: 'cotizar', schema: z.object({
  origenId: z.string(), destinoId: z.string(),
  bultos: z.array(z.object({ pesoG: z.number().int().positive(), largoMm: z.number().int().positive().nullish(), anchoMm: z.number().int().positive().nullish(), altoMm: z.number().int().positive().nullish() })).min(1),
}) }, async ({ body }) => {
  const c = await cotizarPara(pool, body.origenId, body.destinoId, body.bultos);
  return { ...c.resultado, etiqueta: c.etiqueta };
});
