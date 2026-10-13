import { Db, tx, pool, q, q1, ex } from '../db';
import { ErrorNegocio, nuevoId, registrarEvento, param } from '../comun';
import { codigoCoincide, normalizarEntrada } from '@/domain/codigos';
import { secretoRetiro } from './recepcion';

/** Cuenta el intento de forma ATOMICA y confirmada (autocommit, conexion propia), aunque la entrega luego falle. */
export async function verificarCodigo(encomiendaId: string, ingresado: string) {
  const max = await param<number>(pool, 'codigo_retiro.max_intentos', 5);
  const c = await pool.getConnection();
  try {
    const [res]: any = await c.query(
      'UPDATE codigo_retiro SET intentos=LAST_INSERT_ID(intentos+1) WHERE encomienda_id=? AND vigente_key IS NOT NULL AND expira_at>NOW(3) AND intentos<?', [encomiendaId, max]);
    if (res.affectedRows === 0) return { ok: false as const, motivo: 'NO_VIGENTE_O_AGOTADO' as const, restantes: 0 };
    const [[n]]: any = await c.query('SELECT LAST_INSERT_ID() AS n');
    const intentos = Number(n.n);
    const [rows]: any = await c.query('SELECT id,hmac FROM codigo_retiro WHERE encomienda_id=? AND vigente_key IS NOT NULL', [encomiendaId]);
    const fila = rows[0];
    if (!fila) return { ok: false as const, motivo: 'NO_VIGENTE_O_AGOTADO' as const, restantes: 0 };
    return codigoCoincide(fila.hmac, secretoRetiro(), encomiendaId, ingresado)
      ? { ok: true as const, codigoId: fila.id as string }
      : { ok: false as const, motivo: 'INCORRECTO' as const, restantes: Math.max(0, max - intentos) };
  } finally { c.release(); }
}

export async function buscarEncomiendaParaEntrega(db: Db, texto: string) {
  const raw = texto.trim().toUpperCase();
  const n = normalizarEntrada(raw);
  let e = await q1<any>(db, 'SELECT id FROM encomienda WHERE codigo=? OR codigo=?', [raw, 'E-' + n.replace(/^E/, '')]);
  if (!e && n.length === 8) {
    e = await q1<any>(db, 'SELECT e.id FROM bulto b JOIN encomienda e ON e.id=b.encomienda_id WHERE b.codigo_legible=?', [n]);
  }
  if (!e) throw new ErrorNegocio('NO_ENCONTRADA', 'No se encontro la encomienda', undefined, 404);
  const enc = await q1<any>(db,
    `SELECT e.id,e.codigo,e.dest_nombre,e.dest_tel,a.nombre destino,v.estado
       FROM encomienda e JOIN agencia a ON a.id=e.destino_agencia_id LEFT JOIN v_encomienda_estado v ON v.id=e.id WHERE e.id=?`, [e.id]);
  const bultos = await q<any>(db, 'SELECT id,numero,codigo_legible,estado FROM bulto WHERE encomienda_id=? ORDER BY numero', [e.id]);
  const cod = await q1<any>(db, 'SELECT intentos,expira_at FROM codigo_retiro WHERE encomienda_id=? AND vigente_key IS NOT NULL', [e.id]);
  const max = await param<number>(db, 'codigo_retiro.max_intentos', 5);
  return { ...enc, bultos, codigoRetiro: cod ? { intentosRestantes: Math.max(0, max - cod.intentos), expira_at: cod.expira_at } : null };
}

export interface EntregaIn {
  encomiendaId: string; metodo: 'codigo' | 'documento' | 'tercero'; codigo?: string;
  receptorNombre: string; receptorDoc?: string | null; supervisorId?: string | null; motivo?: string | null;
}

export async function entregar(actorId: string, c: EntregaIn) {
  if (c.metodo === 'codigo') {
    if (!c.codigo) throw new ErrorNegocio('CODIGO_NO_VERIFICADO', 'Ingresa el codigo de retiro', undefined, 400);
  } else if (!c.receptorDoc?.trim()) throw new ErrorNegocio('DOCUMENTO_OBLIGATORIO', 'El documento del receptor es obligatorio', undefined, 400);

  let codigoId: string | undefined;
  if (c.metodo === 'codigo') {
    const v = await verificarCodigo(c.encomiendaId, c.codigo!);
    if (!v.ok) {
      throw new ErrorNegocio(v.motivo === 'INCORRECTO' ? 'CODIGO_INCORRECTO' : 'CODIGO_NO_VIGENTE',
        v.motivo === 'INCORRECTO' ? `Codigo incorrecto. Intentos restantes: ${v.restantes}` : 'El codigo no esta vigente o se agotaron los intentos: usa verificacion con documento',
        { restantes: v.restantes });
    }
    codigoId = v.codigoId;
  }
  return tx(async db => {
    const bultos = await q<any>(db, "SELECT id,estado FROM bulto WHERE encomienda_id=? AND estado<>'anulado' FOR UPDATE", [c.encomiendaId]);
    const disp = bultos.filter(b => b.estado === 'disponible_retiro');
    const pendientes = bultos.filter(b => !['disponible_retiro', 'entregado'].includes(b.estado));
    if (!disp.length) throw new ErrorNegocio('NADA_DISPONIBLE', 'No hay bultos disponibles para entregar');
    const parcial = pendientes.length > 0;
    if (parcial) {
      const falt = await q<any>(db, "SELECT id FROM incidencia WHERE tipo='faltante' AND resuelta_at IS NULL AND bulto_id IN (?)", [pendientes.map(b => b.id)]);
      if (!falt.length) throw new ErrorNegocio('PARCIAL_SIN_FALTANTE_ABIERTO', 'Faltan bultos por llegar. Una entrega parcial exige un faltante abierto');
      if (!c.supervisorId || !c.motivo?.trim()) throw new ErrorNegocio('PARCIAL_REQUIERE_SUPERVISOR_Y_MOTIVO', 'La entrega parcial exige supervisor y motivo');
    }
    const id = nuevoId();
    await ex(db, 'INSERT INTO entrega(id,encomienda_id,parcial,entregado_por,metodo,receptor_nombre,receptor_doc,autorizado_por,motivo) VALUES (?,?,?,?,?,?,?,?,?)',
      [id, c.encomiendaId, parcial ? 1 : 0, actorId, c.metodo, c.receptorNombre.trim(), c.receptorDoc?.trim() ?? null, c.supervisorId ?? null, c.motivo?.trim() ?? null]);
    for (const b of disp) {
      await ex(db, 'INSERT INTO entrega_bulto(entrega_id,bulto_id) VALUES (?,?)', [id, b.id]);
      await ex(db, "UPDATE bulto SET estado='entregado', version=version+1 WHERE id=?", [b.id]);
      await registrarEvento(db, { tipo: 'entrega', resultado: parcial ? 'parcial' : 'completa', bultoId: b.id, actorId, payload: { metodo: c.metodo, receptor: c.receptorNombre, supervisor: c.supervisorId ?? null } });
    }
    if (codigoId) await ex(db, 'UPDATE codigo_retiro SET consumido_at=NOW(3), vigente_key=NULL WHERE id=?', [codigoId]);
    // Cualquier otro codigo vigente se invalida (en parcial se emite uno nuevo al completarse el resto)
    await ex(db, 'UPDATE codigo_retiro SET invalidado_at=NOW(3), vigente_key=NULL WHERE encomienda_id=? AND vigente_key IS NOT NULL', [c.encomiendaId]);
    return { entregaId: id, parcial, bultosEntregados: disp.length };
  });
}
void q1;
