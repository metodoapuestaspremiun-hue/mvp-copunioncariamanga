import { Db, tx, q, q1, ex } from '../db';
import { ErrorNegocio, nuevoId, registrarEvento } from '../comun';
import { transitar } from '@/domain/estados';
import { clasificarCodigo } from '@/domain/codigos';

export async function buscarBulto(db: Db, codigo: string, forUpdate = false) {
  const c = clasificarCodigo(codigo);
  if (!c) throw new ErrorNegocio('CODIGO_INVALIDO', 'Codigo no reconocido', undefined, 400);
  const b = await q1<any>(db, `SELECT * FROM bulto WHERE ${c.qrToken ? 'qr_token' : 'codigo_legible'}=? ${forUpdate ? 'FOR UPDATE' : ''}`, [c.qrToken ?? c.codigoLegible]);
  return b;
}
export const versionVigente = async (db: Db, viajeId: string): Promise<number | null> =>
  (await q1<any>(db, 'SELECT MAX(version) v FROM manifiesto WHERE viaje_id=? AND cerrado_at IS NOT NULL', [viajeId]))?.v ?? null;
const borrador = (db: Db, viajeId: string) =>
  q1<any>(db, 'SELECT * FROM manifiesto WHERE viaje_id=? AND cerrado_at IS NULL ORDER BY version DESC LIMIT 1', [viajeId]);

async function viajeLock(db: Db, id: string) {
  const v = await q1<any>(db, 'SELECT * FROM viaje WHERE id=? FOR UPDATE', [id]);
  if (!v) throw new ErrorNegocio('VIAJE_NO_ENCONTRADO', 'Viaje no encontrado', undefined, 404);
  return v;
}

export async function crearViaje(actorId: string, i: { rutaId: string; fecha: string; vehiculo: string; conductor?: string | null }) {
  return tx(async c => {
    const id = nuevoId();
    await ex(c, 'INSERT INTO viaje(id,ruta_id,fecha,vehiculo,conductor,creado_por) VALUES (?,?,?,?,?,?)', [id, i.rutaId, i.fecha, i.vehiculo, i.conductor ?? null, actorId]);
    await ex(c, 'INSERT INTO manifiesto(id,viaje_id,version) VALUES (?,?,1)', [nuevoId(), id]);
    await registrarEvento(c, { tipo: 'viaje_creado', viajeId: id, actorId });
    return { id };
  });
}

export async function listarViajes(db: Db) {
  return q<any>(db,
    `SELECT v.id,v.fecha,v.vehiculo,v.estado,v.parada_actual,r.nombre ruta,
            v.conductor, v.ayudante,
            (SELECT COUNT(*) FROM manifiesto_item mi JOIN manifiesto m ON m.id=mi.manifiesto_id
              WHERE m.viaje_id=v.id AND m.version=(SELECT MAX(version) FROM manifiesto WHERE viaje_id=v.id)) AS items
       FROM viaje v JOIN ruta r ON r.id=v.ruta_id ORDER BY v.fecha DESC, v.id DESC LIMIT 50`);
}

/** Lista los usuarios que pueden actuar como tripulación (chofer / ayudante) */
export async function listarTripulantes(db: Db) {
  return q<any>(db,
    `SELECT u.id, u.nombre, u.email,
            GROUP_CONCAT(ur.rol ORDER BY ur.rol SEPARATOR ',') AS roles
       FROM usuario u
       JOIN usuario_rol ur ON ur.usuario_id = u.id
      WHERE u.activo = 1
        AND ur.rol IN ('ayudante','operador','despachador','guardia','responsable_agencia','supervisor')
      GROUP BY u.id, u.nombre, u.email
      ORDER BY u.nombre`);
}

export async function obtenerViaje(db: Db, id: string) {
  const v = await q1<any>(db, 'SELECT v.*, r.nombre ruta FROM viaje v JOIN ruta r ON r.id=v.ruta_id WHERE v.id=?', [id]);
  if (!v) throw new ErrorNegocio('VIAJE_NO_ENCONTRADO', 'Viaje no encontrado', undefined, 404);
  const paradas = await q<any>(db, 'SELECT p.orden,p.nombre,p.agencia_id FROM parada p WHERE ruta_id=? ORDER BY orden', [v.ruta_id]);
  const manifiestos = await q<any>(db, 'SELECT version,cerrado_at,cerrado_por,motivo_cambio FROM manifiesto WHERE viaje_id=? ORDER BY version', [id]);
  const ultima = manifiestos[manifiestos.length - 1];
  const items = ultima ? await q<any>(db,
    `SELECT mi.bulto_id,mi.sube_orden,mi.baja_orden,b.estado,b.codigo_legible,b.numero,e.codigo enc_codigo,e.dest_nombre
       FROM manifiesto_item mi JOIN manifiesto m ON m.id=mi.manifiesto_id JOIN bulto b ON b.id=mi.bulto_id JOIN encomienda e ON e.id=b.encomienda_id
      WHERE m.viaje_id=? AND m.version=? ORDER BY mi.sube_orden, e.codigo, b.numero`, [id, ultima.version]) : [];
  // Datos de tripulación asignada
  const conductorUsr = v.conductor_usuario_id
    ? await q1<any>(db, 'SELECT id, nombre, email FROM usuario WHERE id=?', [v.conductor_usuario_id])
    : null;
  const ayudanteUsr = v.ayudante_usuario_id
    ? await q1<any>(db, 'SELECT id, nombre, email FROM usuario WHERE id=?', [v.ayudante_usuario_id])
    : null;
  return {
    ...v,
    paradas, manifiestos,
    borrador: !!ultima && !ultima.cerrado_at,
    version: ultima?.version ?? null,
    items,
    conductorUsr,
    ayudanteUsr,
  };
}

export async function agregarItem(actorId: string, i: { viajeId: string; codigo: string; subeOrden: number; bajaOrden: number }) {
  return tx(async c => {
    const v = await viajeLock(c, i.viajeId);
    const m = await borrador(c, i.viajeId);
    if (!m) throw new ErrorNegocio('SIN_BORRADOR', 'El manifiesto esta cerrado. Usa "Modificar manifiesto" (con motivo)');
    const b = await buscarBulto(c, i.codigo, true);
    if (!b) throw new ErrorNegocio('BULTO_NO_ENCONTRADO', 'No existe un bulto con ese codigo', undefined, 404);
    if (!['registrado', 'pendiente_redespacho'].includes(b.estado)) throw new ErrorNegocio('ESTADO_NO_VALIDO', `El bulto esta en estado '${b.estado}' y no puede agregarse`);

    const paradas = await q<any>(c, 'SELECT * FROM parada WHERE ruta_id=? ORDER BY orden', [v.ruta_id]);
    const pS = paradas.find(p => p.orden === i.subeOrden), pB = paradas.find(p => p.orden === i.bajaOrden);
    if (!pS || !pB || i.subeOrden >= i.bajaOrden) throw new ErrorNegocio('PARADAS_INVALIDAS', 'La parada de bajada debe ser posterior a la de subida', undefined, 400);
    if (i.subeOrden < v.parada_actual) throw new ErrorNegocio('PARADA_YA_SALIO', 'El bus ya salio de esa parada');
    if (!pS.agencia_id || !pB.agencia_id) throw new ErrorNegocio('PARADA_SIN_AGENCIA', 'Un bulto no puede subir ni bajar en una parada sin agencia');

    const tramos = await q<any>(c, 'SELECT * FROM bulto_tramo WHERE bulto_id=? ORDER BY orden', [b.id]);
    const cand = tramos.filter(x => x.desde_agencia_id === pS.agencia_id);
    const tramo = cand[0];
    if (!tramo) throw new ErrorNegocio('TRAMO_NO_COINCIDE', 'El bulto no esta en esa agencia de origen para ese tramo');
    if (tramo.hasta_agencia_id !== pB.agencia_id) {
      if (tramo.orden !== tramos[tramos.length - 1].orden || pB.agencia_id === tramo.desde_agencia_id) {
        throw new ErrorNegocio('TRAMO_NO_COINCIDE', 'La parada de bajada no corresponde al recorrido del bulto');
      }
      await ex(c, 'UPDATE bulto_tramo SET hasta_agencia_id=? WHERE id=?', [pB.agencia_id, tramo.id]);
      await ex(c, 'INSERT INTO bulto_tramo(id,bulto_id,orden,desde_agencia_id,hasta_agencia_id) VALUES (?,?,?,?,?)',
        [nuevoId(), b.id, tramo.orden + 1, pB.agencia_id, tramo.hasta_agencia_id]);
    }
    const otro = await q1<any>(c,
      `SELECT v.id FROM manifiesto_item mi JOIN manifiesto m ON m.id=mi.manifiesto_id JOIN viaje v ON v.id=m.viaje_id
        WHERE mi.bulto_tramo_id=? AND v.id<>? AND v.estado<>'cerrado' LIMIT 1`, [tramo.id, i.viajeId]);
    if (otro) throw new ErrorNegocio('YA_EN_OTRO_VIAJE', 'El bulto ya esta en el manifiesto de otro viaje activo');
    try {
      await ex(c, 'INSERT INTO manifiesto_item(manifiesto_id,bulto_id,bulto_tramo_id,sube_orden,baja_orden) VALUES (?,?,?,?,?)', [m.id, b.id, tramo.id, i.subeOrden, i.bajaOrden]);
    } catch (e: any) {
      if (e.code === 'ER_DUP_ENTRY') throw new ErrorNegocio('YA_EN_MANIFIESTO', 'El bulto ya esta en este manifiesto');
      throw e;
    }
    await registrarEvento(c, { tipo: 'agregado_a_manifiesto', bultoId: b.id, viajeId: i.viajeId, actorId, payload: { sube: i.subeOrden, baja: i.bajaOrden, version: m.version } });
    return { bultoId: b.id, codigo: b.codigo_legible };
  });
}

export async function quitarItem(actorId: string, i: { viajeId: string; bultoId: string }) {
  return tx(async c => {
    const v = await viajeLock(c, i.viajeId);
    const m = await borrador(c, i.viajeId);
    if (!m) throw new ErrorNegocio('SIN_BORRADOR', 'No hay un manifiesto abierto');
    const it = await q1<any>(c, 'SELECT * FROM manifiesto_item WHERE manifiesto_id=? AND bulto_id=?', [m.id, i.bultoId]);
    if (!it) throw new ErrorNegocio('NO_ESTA_EN_MANIFIESTO', 'El bulto no esta en el manifiesto', undefined, 404);
    if (it.sube_orden < v.parada_actual) throw new ErrorNegocio('PARADA_YA_SALIO', 'No se puede quitar un bulto de una parada que ya salio');
    await ex(c, 'DELETE FROM manifiesto_item WHERE manifiesto_id=? AND bulto_id=?', [m.id, i.bultoId]);
    return { ok: true };
  });
}

export interface TripulacionInput {
  conductorId?: string | null;      // id usuario del chofer (opcional)
  conductorNombre?: string | null;  // nombre libre si no tiene cuenta
  ayudanteId?: string | null;       // id usuario del ayudante (opcional)
  ayudanteNombre?: string | null;   // nombre libre si no tiene cuenta
}

export async function cerrarManifiesto(
  actorId: string,
  viajeId: string,
  tripulacion: TripulacionInput = {},
) {
  return tx(async c => {
    const v = await viajeLock(c, viajeId);
    const m = await borrador(c, viajeId);
    if (!m) throw new ErrorNegocio('SIN_BORRADOR', 'No hay un manifiesto abierto para cerrar');
    const items = await q<any>(c, 'SELECT * FROM manifiesto_item WHERE manifiesto_id=?', [m.id]);
    if (!items.length) throw new ErrorNegocio('MANIFIESTO_VACIO', 'El manifiesto no tiene bultos');

    // Validar que al menos el conductor esté identificado
    const condNombre = tripulacion.conductorNombre?.trim() || null;
    const condId     = tripulacion.conductorId?.trim()     || null;
    const ayNombre   = tripulacion.ayudanteNombre?.trim()  || null;
    const ayId       = tripulacion.ayudanteId?.trim()      || null;
    if (!condNombre && !condId) throw new ErrorNegocio('CONDUCTOR_REQUERIDO', 'Debes indicar el chofer antes de cerrar el manifiesto', undefined, 400);

    // Validar que los IDs de usuario existan
    if (condId) {
      const u = await q1<any>(c, 'SELECT id FROM usuario WHERE id=? AND activo=1', [condId]);
      if (!u) throw new ErrorNegocio('CONDUCTOR_INVALIDO', 'El usuario seleccionado como chofer no existe o está inactivo', undefined, 400);
    }
    if (ayId) {
      const u = await q1<any>(c, 'SELECT id FROM usuario WHERE id=? AND activo=1', [ayId]);
      if (!u) throw new ErrorNegocio('AYUDANTE_INVALIDO', 'El usuario seleccionado como ayudante no existe o está inactivo', undefined, 400);
    }

    const prevV = await versionVigente(c, viajeId);
    const previos = prevV ? await q<any>(c, 'SELECT mi.* FROM manifiesto_item mi JOIN manifiesto m ON m.id=mi.manifiesto_id WHERE m.viaje_id=? AND m.version=?', [viajeId, prevV]) : [];
    const prevIds = new Set(previos.map(p => p.bulto_id));
    const nuevosIds = new Set(items.map(i => i.bulto_id));

    for (const it of items) {
      const b = await q1<any>(c, 'SELECT * FROM bulto WHERE id=? FOR UPDATE', [it.bulto_id]);
      if (['registrado', 'pendiente_redespacho'].includes(b.estado)) {
        const nuevo = transitar(b.estado, 'cerrar_manifiesto');
        await ex(c, 'UPDATE bulto SET estado=?, viaje_actual_id=?, version=version+1 WHERE id=?', [nuevo, viajeId, b.id]);
        await registrarEvento(c, { tipo: 'manifiesto_cerrado', bultoId: b.id, viajeId, actorId, payload: { version: m.version, desde: b.estado } });
      } else if (!prevIds.has(b.id)) {
        throw new ErrorNegocio('ESTADO_NO_VALIDO', `El bulto ${b.codigo_legible} esta en estado '${b.estado}'`);
      }
    }
    for (const p of previos.filter(p => !nuevosIds.has(p.bulto_id))) {
      const b = await q1<any>(c, 'SELECT * FROM bulto WHERE id=? FOR UPDATE', [p.bulto_id]);
      if (b.estado !== 'pendiente_despacho') throw new ErrorNegocio('NO_SE_PUEDE_RETIRAR', `El bulto ${b.codigo_legible} ya esta '${b.estado}': no se puede retirar del manifiesto`);
      const tr = await q1<any>(c, 'SELECT orden FROM bulto_tramo WHERE id=?', [p.bulto_tramo_id]);
      await ex(c, 'UPDATE bulto SET estado=?, viaje_actual_id=NULL, version=version+1 WHERE id=?', [tr.orden > 1 ? 'pendiente_redespacho' : 'registrado', b.id]);
      await registrarEvento(c, { tipo: 'retirado_de_manifiesto', bultoId: b.id, viajeId, actorId });
    }

    await ex(c, 'UPDATE manifiesto SET cerrado_at=NOW(3), cerrado_por=? WHERE id=?', [actorId, m.id]);

    // Actualizar tripulación y timestamp de cierre en el viaje
    await ex(c,
      `UPDATE viaje SET
         conductor              = COALESCE(?, conductor),
         ayudante              = ?,
         conductor_usuario_id  = ?,
         ayudante_usuario_id   = ?,
         manifiesto_cerrado_at = NOW(3),
         manifiesto_cerrado_por = ?
       WHERE id = ?`,
      [condNombre, ayNombre, condId, ayId, actorId, viajeId],
    );

    if (v.estado === 'planificado') await ex(c, "UPDATE viaje SET estado='manifiesto_cerrado' WHERE id=?", [viajeId]);
    await registrarEvento(c, {
      tipo: 'manifiesto_version_cerrada', viajeId, actorId,
      payload: { version: m.version, conductorId: condId, conductorNombre: condNombre, ayudanteId: ayId, ayudanteNombre: ayNombre },
    });
    return { version: m.version };
  });
}

/** Cambio despues del cierre: nueva version + motivo obligatorio + invalida la autorizacion vigente. */
export async function modificarManifiesto(actorId: string, viajeId: string, motivo: string) {
  if (!motivo?.trim()) throw new ErrorNegocio('MOTIVO_OBLIGATORIO', 'Todo cambio despues del cierre exige motivo', undefined, 400);
  return tx(async c => {
    await viajeLock(c, viajeId);
    if (await borrador(c, viajeId)) throw new ErrorNegocio('YA_HAY_BORRADOR', 'Ya hay un manifiesto abierto');
    const vig = await versionVigente(c, viajeId);
    if (!vig) throw new ErrorNegocio('SIN_MANIFIESTO', 'El viaje no tiene un manifiesto cerrado');
    const nueva = vig + 1; const mid = nuevoId();
    await ex(c, 'INSERT INTO manifiesto(id,viaje_id,version,motivo_cambio) VALUES (?,?,?,?)', [mid, viajeId, nueva, motivo.trim()]);
    await ex(c, `INSERT INTO manifiesto_item(manifiesto_id,bulto_id,bulto_tramo_id,sube_orden,baja_orden)
                 SELECT ?, mi.bulto_id, mi.bulto_tramo_id, mi.sube_orden, mi.baja_orden FROM manifiesto_item mi JOIN manifiesto m ON m.id=mi.manifiesto_id
                  WHERE m.viaje_id=? AND m.version=?`, [mid, viajeId, vig]);
    const inv = await ex(c, `UPDATE autorizacion_salida SET invalidada_at=NOW(3), invalidada_motivo=?, vigente_key=NULL
                 WHERE viaje_id=? AND invalidada_at IS NULL AND salida_real_at IS NULL`, [`manifiesto v${nueva}`, viajeId]);
    await registrarEvento(c, { tipo: 'manifiesto_modificado', viajeId, actorId, payload: { version: nueva, motivo: motivo.trim(), autorizacionesInvalidadas: inv.affectedRows } });
    return { version: nueva, autorizacionesInvalidadas: inv.affectedRows };
  });
}

export async function cerrarViaje(actorId: string, viajeId: string) {
  return tx(async c => {
    await viajeLock(c, viajeId);
    const vig = await versionVigente(c, viajeId);
    if (!vig) throw new ErrorNegocio('SIN_MANIFIESTO', 'El viaje no tiene manifiesto cerrado');
    const abordo = await q<any>(c,
      `SELECT b.codigo_legible FROM manifiesto_item mi JOIN manifiesto m ON m.id=mi.manifiesto_id JOIN bulto b ON b.id=mi.bulto_id
        WHERE m.viaje_id=? AND m.version=? AND b.estado IN ('pendiente_despacho','cargado','en_transito')`, [viajeId, vig]);
    if (abordo.length) throw new ErrorNegocio('VIAJE_CON_BULTOS_ABORDO', `Aun hay ${abordo.length} bulto(s) sin descargar`, abordo.map(a => a.codigo_legible));
    await ex(c, "UPDATE viaje SET estado='cerrado' WHERE id=?", [viajeId]);
    await registrarEvento(c, { tipo: 'viaje_cerrado', viajeId, actorId });

    // Regenerar el siguiente turno para la misma ruta (Ruta Fija Recurrente)
    const viajeActual = await q1<any>(c, 'SELECT ruta_id, vehiculo, conductor FROM viaje WHERE id=?', [viajeId]);
    if (viajeActual) {
      const nuevoViajeId = nuevoId();
      // Fecha para el siguiente día o el mismo día según corresponda
      const fechaManana = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      await ex(c, 'INSERT INTO viaje(id, ruta_id, fecha, vehiculo, conductor, creado_por) VALUES (?,?,?,?,?,?)',
        [nuevoViajeId, viajeActual.ruta_id, fechaManana, viajeActual.vehiculo, viajeActual.conductor, actorId]);
      await ex(c, 'INSERT INTO manifiesto(id, viaje_id, version) VALUES (?,?,1)', [nuevoId(), nuevoViajeId]);
      await registrarEvento(c, { tipo: 'viaje_creado', viajeId: nuevoViajeId, actorId, payload: { regenerado_de: viajeId } });
    }

    return { ok: true };
  });
}
