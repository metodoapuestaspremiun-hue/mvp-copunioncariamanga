import { api } from '@/server/http';
import { pool, q } from '@/server/db';

export const GET = api({ permiso: null }, async () => {
  // Retorna los bultos que están en bodega listos para subir a un viaje
  const bultos = await q<any>(
    pool,
    `SELECT b.id, b.codigo_legible, b.numero, b.peso_g, e.codigo as enc_codigo, e.dest_nombre,
            e.origen_agencia_id, e.destino_agencia_id,
            ao.nombre as origen_nombre, ad.nombre as destino_nombre, b.encomienda_id
       FROM bulto b
       JOIN encomienda e ON e.id = b.encomienda_id
       JOIN agencia ao ON ao.id = e.origen_agencia_id
       JOIN agencia ad ON ad.id = e.destino_agencia_id
      WHERE b.estado IN ('registrado', 'pendiente_redespacho')
      ORDER BY e.creado_at DESC, b.numero ASC
      LIMIT 100`
  );
  return bultos;
});
