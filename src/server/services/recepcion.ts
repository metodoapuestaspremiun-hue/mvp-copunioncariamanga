import { Db, tx, q, q1, ex } from '../db';
import { ErrorNegocio, nuevoId, registrarEvento, param } from '../comun';
import { transitar, tras_recepcion } from '@/domain/estados';
import { nuevoCodigoRetiro, hmacCodigo } from '@/domain/codigos';
import { encolar, despertarCola } from '../mensajes/cola';
import { T } from '../mensajes/plantillas';
import { buscarBulto } from './manifiesto';

export function secretoRetiro(): string {
  const s = process.env.RETIRO_HMAC_SECRET;
  if (!s || s === 'cambia-esto') { if (process.env.NODE_ENV === 'production') throw new Error('Configura RETIRO_HMAC_SECRET'); return 'secreto-solo-para-desarrollo'; }
  return s;
}

/** Emite un codigo nuevo si TODOS los bultos no anulados estan disponibles/entregados y hay al menos uno disponible. */
export async function emitirCodigoSiCorresponde(db: Db, encomiendaId: string) {
  const bs = await q<any>(db, "SELECT estado FROM bulto WHERE encomienda_id=? AND estado<>'anulado'", [encomiendaId]);
  const todos = bs.length > 0 && bs.every(b => ['disponible_retiro', 'entregado'].includes(b.estado));
  if (!todos || !bs.some(b => b.estado === 'disponible_retiro')) return null;
  await ex(db, 'UPDATE codigo_retiro SET invalidado_at=NOW(3), vigente_key=NULL WHERE encomienda_id=? AND vigente_key IS NOT NULL', [encomiendaId]);
  const codigo = nuevoCodigoRetiro();
  const dias = await param<number>(db, 'codigo_retiro.caducidad_dias', 7);
  const id = nuevoId();
  await ex(db, 'INSERT INTO codigo_retiro(id,encomienda_id,hmac,expira_at,vigente_key) VALUES (?,?,?,NOW(3) + INTERVAL ? DAY,?)',
    [id, encomiendaId, hmacCodigo(secretoRetiro(), encomiendaId, codigo), dias, encomiendaId]);
  const e = await q1<any>(db, 'SELECT e.*, a.nombre agencia FROM encomienda e JOIN agencia a ON a.id=e.destino_agencia_id WHERE e.id=?', [encomiendaId]);
  const hasta = new Date(Date.now() + dias * 86400000);
  await encolar(db, { dedupeKey: `enc:${encomiendaId}:disponible_retiro:${id}`, encomiendaId, tel: e.dest_tel, plantilla: 'disponible_retiro',
    cuerpo: T.disponible_retiro({ agencia: e.agencia, codigo, hasta, encCodigo: e.codigo }) });
  return { codigoId: id };
}

export async function recibirBulto(actorId: string, i: { codigo: string; agenciaId: string }) {
  const r = await tx(async db => {
    const b0 = await buscarBulto(db, i.codigo);
    if (!b0) throw new ErrorNegocio('BULTO_NO_ENCONTRADO', 'No existe un bulto con ese codigo', undefined, 404);
    const b = await q1<any>(db, 'SELECT b.*, e.destino_agencia_id, e.id enc_id, e.codigo enc_codigo, e.dest_tel, e.dest_nombre FROM bulto b JOIN encomienda e ON e.id=b.encomienda_id WHERE b.id=? FOR UPDATE', [b0.id]);
    if (b.estado === 'recibido_agencia' || b.estado === 'pendiente_redespacho' || b.estado === 'disponible_retiro') {
      return { resultado: 'repetido' as const, estado: b.estado, codigo: b.codigo_legible };
    }
    if (b.estado !== 'descargado') throw new ErrorNegocio('NO_DESCARGADO', `El bulto esta '${b.estado}': solo se recibe un bulto ya descargado`);

    // La agencia que recibe debe ser la de la parada donde se descargo (si no, es otra agencia: error)
    const ev = await q1<any>(db, "SELECT viaje_id,parada_orden FROM evento WHERE bulto_id=? AND tipo='escaneo_descarga' AND resultado='ok' ORDER BY recibido_servidor DESC LIMIT 1", [b.id]);
    if (ev) {
      const p = await q1<any>(db, 'SELECT p.agencia_id FROM parada p JOIN viaje v ON v.ruta_id=p.ruta_id WHERE v.id=? AND p.orden=?', [ev.viaje_id, ev.parada_orden]);
      if (p?.agencia_id && p.agencia_id !== i.agenciaId) throw new ErrorNegocio('AGENCIA_NO_CORRESPONDE', 'Este bulto se descargo en otra agencia');
    }
    transitar(b.estado, 'recibir');
    const sig = tras_recepcion(i.agenciaId, b.destino_agencia_id);
    await ex(db, 'UPDATE bulto SET estado=?, agencia_custodia_id=?, version=version+1 WHERE id=?', [sig, i.agenciaId, b.id]);
    await registrarEvento(db, { tipo: 'recepcion', resultado: sig, bultoId: b.id, actorId, payload: { agenciaId: i.agenciaId } });

    let plazoDue: Date | null = null;
    if (sig === 'pendiente_redespacho') {
      const horas = await param<number>(db, 'redespacho.plazo_horas', 12);
      plazoDue = new Date(Date.now() + horas * 3600000);
      await ex(db, 'INSERT INTO redespacho(id,bulto_id,agencia_resp_id,recibido_at,due_at) VALUES (?,?,?,NOW(3),?)', [nuevoId(), b.id, i.agenciaId, plazoDue]);
      // Debe existir un tramo que parta desde esta agencia hacia el destino final
      const tramos = await q<any>(db, 'SELECT * FROM bulto_tramo WHERE bulto_id=? ORDER BY orden', [b.id]);
      if (!tramos.some(t => t.desde_agencia_id === i.agenciaId)) {
        await ex(db, 'INSERT INTO bulto_tramo(id,bulto_id,orden,desde_agencia_id,hasta_agencia_id) VALUES (?,?,?,?,?)',
          [nuevoId(), b.id, tramos.length + 1, i.agenciaId, b.destino_agencia_id]);
      }
      const tot = await q1<any>(db, "SELECT COUNT(*) total, SUM(estado IN ('pendiente_redespacho','disponible_retiro','recibido_agencia','entregado')) rec FROM bulto WHERE encomienda_id=? AND estado<>'anulado'", [b.enc_id]);
      const ag = await q1<any>(db, 'SELECT nombre FROM agencia WHERE id=?', [i.agenciaId]);
      const dest = await q1<any>(db, 'SELECT nombre FROM agencia WHERE id=?', [b.destino_agencia_id]);
      await encolar(db, { dedupeKey: `enc:${b.enc_id}:llegada_intermedia:${i.agenciaId}:${Number(tot.rec)}:${b.dest_tel}`, encomiendaId: b.enc_id, tel: b.dest_tel, plantilla: 'llegada_intermedia',
        cuerpo: T.llegada_intermedia({ agencia: ag.nombre, recibidos: Number(tot.rec), total: Number(tot.total), destino: dest.nombre }) });
    } else {
      await emitirCodigoSiCorresponde(db, b.enc_id);
    }
    return { resultado: 'ok' as const, estado: sig, codigo: b.codigo_legible, encomienda: b.enc_codigo, redespachoVence: plazoDue };
  });
  despertarCola();
  return r;
}

export async function listarRedespachos(db: Db) {
  return q<any>(db,
    `SELECT r.id,r.recibido_at,r.due_at,r.cerrado_at,(r.cerrado_at IS NULL AND r.due_at<NOW(3)) AS vencido,
            b.id bulto_id,b.codigo_legible,b.numero,b.estado,e.codigo enc_codigo,e.dest_nombre,a.nombre agencia,ad.nombre destino
       FROM redespacho r JOIN bulto b ON b.id=r.bulto_id JOIN encomienda e ON e.id=b.encomienda_id
       JOIN agencia a ON a.id=r.agencia_resp_id JOIN agencia ad ON ad.id=e.destino_agencia_id
      ORDER BY (r.cerrado_at IS NULL) DESC, r.due_at ASC LIMIT 100`);
}
