import { tx, q, q1, ex, pool, pj } from '../db';
import { ErrorNegocio, nuevoId, registrarEvento } from '../comun';
import { decidirEscaneo, type TipoEscaneo } from '@/domain/escaneo';
import { clasificarCodigo } from '@/domain/codigos';

export interface CmdEscaneo {
  eventId: string; tipo: TipoEscaneo; viajeId: string; parada: number;
  codigo: string; actorId: string; deviceId?: string; declaradoAt?: string;
}

async function previo(eventId: string) {
  const p = await q1<any>(pool, 'SELECT resultado,payload,bulto_id FROM evento WHERE id=?', [eventId]);
  if (!p) return null;
  const pl = pj<any>(p.payload) ?? {};
  return { resultado: p.resultado, alerta: pl.alerta, codigo: pl.codigo, numero: pl.numero, encomienda: pl.encomienda, repetidoPorReintento: true };
}

export interface RespuestaEscaneo {
  resultado: string; alerta?: string; codigo?: string; numero?: number; encomienda?: string; incidencia?: string; repetidoPorReintento?: boolean;
}

export async function escanear(c: CmdEscaneo): Promise<RespuestaEscaneo> {
  const ya = await previo(c.eventId);
  if (ya) return ya;
  try {
    return await tx(async db => {
      const viaje = await q1<any>(db, 'SELECT * FROM viaje WHERE id=?', [c.viajeId]);
      if (!viaje) throw new ErrorNegocio('VIAJE_NO_ENCONTRADO', 'Viaje no encontrado', undefined, 404);
      if (!['manifiesto_cerrado', 'en_ruta'].includes(viaje.estado)) throw new ErrorNegocio('VIAJE_NO_OPERABLE', 'El manifiesto del viaje aun no esta cerrado o el viaje ya termino');
      if (c.parada !== viaje.parada_actual) throw new ErrorNegocio('PARADA_NO_ACTUAL', `El bus esta en la parada ${viaje.parada_actual}, no en la ${c.parada}`);
      const parada = await q1<any>(db, 'SELECT * FROM parada WHERE ruta_id=? AND orden=?', [viaje.ruta_id, c.parada]);

      const cls = clasificarCodigo(c.codigo);
      const b = cls ? await q1<any>(db, `SELECT b.*, e.codigo enc_codigo FROM bulto b JOIN encomienda e ON e.id=b.encomienda_id WHERE ${cls.qrToken ? 'b.qr_token' : 'b.codigo_legible'}=? FOR UPDATE`, [cls.qrToken ?? cls.codigoLegible]) : null;
      if (!b) {
        await registrarEvento(db, { id: c.eventId, tipo: `escaneo_${c.tipo}`, resultado: 'desconocido', viajeId: c.viajeId, parada: c.parada, actorId: c.actorId, deviceId: c.deviceId, declarado: c.declaradoAt, payload: { alerta: 'Codigo desconocido' } });
        return { resultado: 'desconocido' as const, alerta: 'Codigo desconocido' };
      }
      const vig = (await q1<any>(db, 'SELECT MAX(version) v FROM manifiesto WHERE viaje_id=? AND cerrado_at IS NOT NULL', [c.viajeId]))?.v;
      const item = vig ? await q1<any>(db,
        `SELECT mi.sube_orden sube, mi.baja_orden baja FROM manifiesto_item mi JOIN manifiesto m ON m.id=mi.manifiesto_id
          WHERE m.viaje_id=? AND mi.bulto_id=? AND m.version=? ORDER BY mi.sube_orden LIMIT 1`, [c.viajeId, b.id, vig]) : null;

      const d = decidirEscaneo({ tipo: c.tipo, parada: c.parada, viajeCmd: c.viajeId, estado: b.estado, viajeBulto: b.viaje_actual_id,
        item: item ? { sube: item.sube, baja: item.baja } : null });

      await registrarEvento(db, { id: c.eventId, tipo: `escaneo_${c.tipo}`, resultado: d.resultado, bultoId: b.id, viajeId: c.viajeId, parada: c.parada,
        actorId: c.actorId, deviceId: c.deviceId, declarado: c.declaradoAt,
        payload: { alerta: d.alerta, nuevoEstado: d.nuevoEstado, codigo: b.codigo_legible, numero: b.numero, encomienda: b.enc_codigo } });

      if (d.nuevoEstado) {
        const r = await ex(db,
          `UPDATE bulto SET estado=?, version=version+1,
                  viaje_actual_id = IF(?='descargado', NULL, viaje_actual_id),
                  agencia_custodia_id = IF(?='descargado', ?, IF(?='cargado', NULL, agencia_custodia_id))
            WHERE id=? AND version=?`,
          [d.nuevoEstado, d.nuevoEstado, d.nuevoEstado, parada?.agencia_id ?? null, d.nuevoEstado, b.id, b.version]);
        if (r.affectedRows !== 1) throw new ErrorNegocio('CONFLICTO_CONCURRENCIA', 'Otro escaneo cambio este bulto al mismo tiempo. Intenta de nuevo');
      }
      if (d.incidencia) {
        await ex(db, 'INSERT INTO incidencia(id,tipo,bulto_id,viaje_id,abierta_por_evento) VALUES (?,?,?,?,?)', [nuevoId(), d.incidencia, b.id, c.viajeId, c.eventId]);
      }
      return { resultado: d.resultado, alerta: d.alerta, codigo: b.codigo_legible, numero: b.numero, encomienda: b.enc_codigo, incidencia: d.incidencia };
    });
  } catch (e: any) {
    // Dos peticiones simultaneas con el mismo eventId: la segunda falla por clave duplicada.
    if (e?.code === 'ER_DUP_ENTRY') { const p = await previo(c.eventId); if (p) return p; }
    throw e;
  }
}
void q;
