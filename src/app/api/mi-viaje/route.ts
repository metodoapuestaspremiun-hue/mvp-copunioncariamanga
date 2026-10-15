import { api } from '@/server/http';
import { pool } from '@/server/db';
import { q, q1 } from '@/server/db';

/**
 * GET /api/mi-viaje
 * Retorna el viaje activo donde el usuario autenticado es conductor o ayudante.
 */
export const GET = api({ permiso: null }, async ({ user }) => {
  const viaje = await q1<any>(pool,
    `SELECT v.id, v.fecha, v.vehiculo, v.estado, v.parada_actual,
            v.conductor, v.ayudante, v.manifiesto_cerrado_at,
            r.nombre AS ruta
       FROM viaje v
       JOIN ruta r ON r.id = v.ruta_id
      WHERE (v.conductor_usuario_id = ? OR v.ayudante_usuario_id = ?)
        AND v.estado IN ('manifiesto_cerrado','en_ruta')
      ORDER BY v.fecha DESC, v.id DESC
      LIMIT 1`,
    [user.id, user.id],
  );

  if (!viaje) return { viaje: null };

  // Obtener la versión vigente del manifiesto
  const version = (await q1<any>(pool,
    'SELECT MAX(version) v FROM manifiesto WHERE viaje_id=? AND cerrado_at IS NOT NULL',
    [viaje.id],
  ))?.v;

  const paradas = await q<any>(pool,
    'SELECT orden, nombre FROM parada WHERE ruta_id=(SELECT ruta_id FROM viaje WHERE id=?) ORDER BY orden',
    [viaje.id],
  );

  const items = version ? await q<any>(pool,
    `SELECT mi.bulto_id, mi.sube_orden, mi.baja_orden,
            b.estado, b.codigo_legible, b.numero,
            e.codigo enc_codigo, e.dest_nombre, e.dest_tel
       FROM manifiesto_item mi
       JOIN manifiesto m ON m.id = mi.manifiesto_id
       JOIN bulto b ON b.id = mi.bulto_id
       JOIN encomienda e ON e.id = b.encomienda_id
      WHERE m.viaje_id = ? AND m.version = ?
      ORDER BY mi.sube_orden, e.codigo, b.numero`,
    [viaje.id, version],
  ) : [];

  // Estadísticas rápidas
  const total     = items.length;
  const cargados  = items.filter((i: any) => ['cargado','en_transito'].includes(i.estado)).length;
  const entregados = items.filter((i: any) => ['descargado','recibido_agencia','disponible_retiro','entregado'].includes(i.estado)).length;
  const pendientes = items.filter((i: any) => i.estado === 'pendiente_despacho').length;

  return { viaje, version, paradas, items, stats: { total, cargados, entregados, pendientes } };
});
