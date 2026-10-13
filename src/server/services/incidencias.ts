import { Db, tx, q, q1, ex } from '../db';
import { ErrorNegocio, nuevoId, registrarEvento } from '../comun';
import { buscarBulto } from './manifiesto';

export const TIPOS = ['faltante', 'sobrante', 'descarga_incorrecta', 'dano', 'etiqueta_ilegible', 'redespacho_vencido', 'retiro_vencido', 'discrepancia_recepcion', 'pasado_de_parada'] as const;

export async function abrirIncidencia(actorId: string, i: { tipo: (typeof TIPOS)[number]; codigo?: string; viajeId?: string; nota?: string }) {
  return tx(async db => {
    const b = i.codigo ? await buscarBulto(db, i.codigo) : null;
    if (i.codigo && !b) throw new ErrorNegocio('BULTO_NO_ENCONTRADO', 'No existe un bulto con ese codigo', undefined, 404);
    const ev = await registrarEvento(db, { tipo: 'incidencia_abierta', resultado: i.tipo, bultoId: b?.id ?? null, viajeId: i.viajeId ?? b?.viaje_actual_id ?? null, actorId, payload: { nota: i.nota } });
    const id = nuevoId();
    await ex(db, 'INSERT INTO incidencia(id,tipo,bulto_id,viaje_id,abierta_por_evento,nota) VALUES (?,?,?,?,?,?)', [id, i.tipo, b?.id ?? null, i.viajeId ?? b?.viaje_actual_id ?? null, ev, i.nota ?? null]);
    return { id };
  });
}
export async function resolverIncidencia(actorId: string, id: string, nota?: string) {
  return tx(async db => {
    const inc = await q1<any>(db, 'SELECT * FROM incidencia WHERE id=? FOR UPDATE', [id]);
    if (!inc) throw new ErrorNegocio('NO_ENCONTRADA', 'Incidencia no encontrada', undefined, 404);
    if (inc.resuelta_at) throw new ErrorNegocio('YA_RESUELTA', 'La incidencia ya estaba resuelta');
    const ev = await registrarEvento(db, { tipo: 'incidencia_resuelta', resultado: inc.tipo, bultoId: inc.bulto_id, viajeId: inc.viaje_id, actorId, payload: { nota }, corrige: inc.abierta_por_evento });
    await ex(db, 'UPDATE incidencia SET resuelta_por_evento=?, resuelta_at=NOW(3), nota=COALESCE(?,nota) WHERE id=?', [ev, nota ?? null, id]);
    return { ok: true };
  });
}
export async function listarIncidencias(db: Db, soloAbiertas = true) {
  return q<any>(db,
    `SELECT i.id,i.tipo,i.abierta_at,i.resuelta_at,i.nota,b.codigo_legible,b.id bulto_id,e.codigo enc_codigo,i.viaje_id
       FROM incidencia i LEFT JOIN bulto b ON b.id=i.bulto_id LEFT JOIN encomienda e ON e.id=b.encomienda_id
      ${soloAbiertas ? 'WHERE i.resuelta_at IS NULL' : ''} ORDER BY i.abierta_at DESC LIMIT 100`);
}
