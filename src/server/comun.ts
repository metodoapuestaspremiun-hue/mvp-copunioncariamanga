import { randomUUID } from 'node:crypto';
import { Db, q1, ex, pj } from './db';

export class ErrorNegocio extends Error {
  constructor(public codigo: string, public mensaje?: string, public detalle?: unknown, public status = 409) {
    super(mensaje ?? codigo);
  }
}
export const nuevoId = () => randomUUID();

export async function param<T = any>(db: Db, clave: string, def?: T): Promise<T> {
  const r = await q1<{ valor: unknown }>(db, 'SELECT valor FROM parametro WHERE clave=?', [clave]);
  if (!r) { if (def === undefined) throw new Error(`Falta el parametro ${clave}`); return def; }
  return pj<T>(r.valor) as T;
}

export interface NuevoEvento {
  id?: string; tipo: string; resultado?: string | null; bultoId?: string | null; viajeId?: string | null;
  parada?: number | null; actorId: string; deviceId?: string | null; declarado?: string | Date | null;
  payload?: unknown; corrige?: string | null;
}
export async function registrarEvento(db: Db, e: NuevoEvento): Promise<string> {
  const id = e.id ?? nuevoId();
  await ex(db,
    `INSERT INTO evento(id,tipo,resultado,bulto_id,viaje_id,parada_orden,actor_id,device_id,ocurrido_declarado,payload,corrige_evento_id)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    [id, e.tipo, e.resultado ?? null, e.bultoId ?? null, e.viajeId ?? null, e.parada ?? null, e.actorId,
     e.deviceId ?? null, e.declarado ? new Date(e.declarado) : null, JSON.stringify(e.payload ?? {}), e.corrige ?? null]);
  return id;
}
export async function auditar(db: Db, actorId: string | null, accion: string, entidad?: string, entidadId?: string, despues?: unknown) {
  await ex(db, 'INSERT INTO audit_log(actor_id,accion,entidad,entidad_id,despues) VALUES (?,?,?,?,?)',
    [actorId, accion, entidad ?? null, entidadId ?? null, despues === undefined ? null : JSON.stringify(despues)]);
}
