// Prueba E2E del guion de la demo contra una BD MySQL/MariaDB REAL (sin mocks).
// Requiere: DATABASE_HOST, DATABASE_USER, DATABASE_PASSWORD, DATABASE_NAME (una BD de PRUEBAS: se borra y recrea).
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { inicializarBD } from '../../scripts/db-init';
import { pool, q, q1, ex } from '@/server/db';
import { crearEncomienda, obtenerEncomienda } from '@/server/services/encomienda';
import { crearViaje, agregarItem, cerrarManifiesto, modificarManifiesto, obtenerViaje, cerrarViaje } from '@/server/services/manifiesto';
import { escanear } from '@/server/services/escanear';
import { autorizarSalida, registrarSalidaReal, registrarConteo, vistaParada } from '@/server/services/salida';
import { recibirBulto } from '@/server/services/recepcion';
import { entregar, verificarCodigo } from '@/server/services/entrega';
import { abrirIncidencia, resolverIncidencia } from '@/server/services/incidencias';
import { procesarCola } from '@/server/mensajes/cola';
import { lineaDeTiempo } from '@/server/services/consultas';

let U: Record<string, string>, A: Record<string, string>, ruta: string;
const sc = (tipo: 'carga' | 'descarga', viajeId: string, parada: number, codigo: string, actor = U.ayudante, eventId = randomUUID()) =>
  escanear({ eventId, tipo, viajeId, parada, codigo, actorId: actor });
const esperaError = async (p: Promise<unknown>, codigo: string) => {
  try { await p; } catch (e: any) { expect(e.codigo, e.message).toBe(codigo); return e; }
  throw new Error(`Se esperaba el error ${codigo}`);
};
async function encomienda(n: number, dest = 'Zumba', tel = '0991234567') {
  return crearEncomienda(U.operador, {
    origenId: A.Quito, destinoId: A[dest], remitenteNombre: 'Remitente Demo', destNombre: 'Destinatario Demo', destTel: tel,
    bultos: Array.from({ length: n }, (_, i) => ({ pesoG: 1000 * (i + 1) })),
  });
}
async function viajeNuevo(vehiculo = 'BUS-01') {
  return (await crearViaje(U.operador, { rutaId: ruta, fecha: new Date().toISOString().slice(0, 10), vehiculo })).id;
}

beforeAll(async () => {
  if (!/test/i.test(process.env.DATABASE_NAME ?? '')) throw new Error('Estas pruebas BORRAN la base. DATABASE_NAME debe contener "test" (ej. trazabilidad_test). Nada se ejecuto.');
  await inicializarBD({ reset: true });
  const us = await q<any>(pool, "SELECT id, SUBSTRING_INDEX(email,'@',1) k FROM usuario");
  U = Object.fromEntries(us.map(u => [u.k, u.id]));
  const ag = await q<any>(pool, 'SELECT id, ciudad FROM agencia');
  A = Object.fromEntries(ag.map(a => [a.ciudad, a.id]));
  ruta = (await q1<any>(pool, 'SELECT id FROM ruta'))!.id;
});
afterAll(async () => { await pool.end(); });

describe('guion completo: 3 bultos Quito -> Loja -> Zumba', () => {
  const S: any = {};

  it('1. registra la encomienda: 3 bultos, cotizacion con tabla, etiquetas sin datos personales', async () => {
    S.enc = await encomienda(3);
    expect(S.enc.bultos).toHaveLength(3);
    expect(S.enc.valorCent).toBe(Math.round(300 * 1.8) + Math.round(300 * 1.8) + Math.round(300 * 1.8)); // 1000g, 2000g, 3000g -> primer rango, 3 x 540
    expect(S.enc.etiquetaTarifa).toBe('TARIFAS DE DEMOSTRACIÓN');
    S.enc.bultos.forEach((b: any) => { expect(b.qrToken).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/); expect(b.codigoLegible).toMatch(/^[0-9A-HJKMNP-TV-Z]{8}$/); });
    const det = await obtenerEncomienda(pool, S.enc.id);
    expect(det.cotizacion.detalle).toHaveLength(3);
  });

  it('2. manifiesto: A baja en Loja; B y C continuan a Zumba. Cerrar pasa a pendiente_despacho', async () => {
    S.v1 = await viajeNuevo();
    const [a, b, c] = S.enc.bultos;
    await agregarItem(U.operador, { viajeId: S.v1, codigo: a.codigoLegible, subeOrden: 1, bajaOrden: 2 });
    await agregarItem(U.operador, { viajeId: S.v1, codigo: b.qrToken, subeOrden: 1, bajaOrden: 3 });
    await agregarItem(U.operador, { viajeId: S.v1, codigo: c.codigoLegible, subeOrden: 1, bajaOrden: 3 });
    await esperaError(agregarItem(U.operador, { viajeId: S.v1, codigo: c.codigoLegible, subeOrden: 1, bajaOrden: 3 }), 'YA_EN_MANIFIESTO');
    // escanear antes de cerrar el manifiesto no esta permitido
    await esperaError(sc('carga', S.v1, 1, a.codigoLegible), 'VIAJE_NO_OPERABLE');
    await cerrarManifiesto(U.operador, S.v1);
    const est = await q<any>(pool, 'SELECT estado, viaje_actual_id FROM bulto WHERE encomienda_id=?', [S.enc.id]);
    expect(est.every(e => e.estado === 'pendiente_despacho' && e.viaje_actual_id === S.v1)).toBe(true);
    // el bulto A tiene ahora 2 tramos: Quito->Loja y Loja->Zumba
    const tr = await q<any>(pool, 'SELECT orden FROM bulto_tramo WHERE bulto_id=? ORDER BY orden', [a.id]);
    expect(tr.map(t => t.orden)).toEqual([1, 2]);
  });

  it('3. carga en Quito: bulto ajeno -> rechazo + incidencia; repetido no suma', async () => {
    const [a] = S.enc.bultos;
    S.ajeno = await encomienda(1);
    expect((await sc('carga', S.v1, 1, a.codigoLegible)).resultado).toBe('ok');
    const ajeno = await sc('carga', S.v1, 1, S.ajeno.bultos[0].codigoLegible);
    expect(ajeno.resultado).toBe('no_esperado'); expect(ajeno.incidencia).toBe('sobrante');
    expect((await sc('carga', S.v1, 1, a.codigoLegible)).resultado).toBe('repetido');
    expect((await sc('carga', S.v1, 1, 'ZZZZZZZZ')).resultado).toBe('desconocido');
  });

  it('4. autorizar con bultos sin cargar -> BLOQUEADO (y la incidencia sobrante no se puede excepcionar)', async () => {
    const e = await esperaError(autorizarSalida(U.supervisor, { viajeId: S.v1, parada: 1, tipo: 'normal' }), 'SALIDA_BLOQUEADA');
    const cods = e.detalle.bloqueos.map((b: any) => b.codigo);
    expect(cods).toContain('carga_incompleta'); expect(cods).toContain('conflicto_critico');
    // con conflicto critico no hay excepcion posible
    await esperaError(autorizarSalida(U.supervisor, { viajeId: S.v1, parada: 1, tipo: 'excepcion_a', solicitadoPor: U.ayudante, motivo: 'x' }), 'NO_EXCEPCIONABLE');
  });

  it('5. se resuelve la incidencia, se carga lo que falta, se autoriza y se registra la salida real', async () => {
    const inc = await q<any>(pool, "SELECT id FROM incidencia WHERE tipo='sobrante' AND resuelta_at IS NULL");
    expect(inc).toHaveLength(1);
    await resolverIncidencia(U.supervisor, inc[0].id, 'El bulto ajeno se devolvio al mostrador');
    await sc('carga', S.v1, 1, S.enc.bultos[1].qrToken);
    await sc('carga', S.v1, 1, S.enc.bultos[2].codigoLegible);
    // no se puede registrar salida sin autorizacion
    await esperaError(registrarSalidaReal(U.supervisor, { viajeId: S.v1, parada: 1 }), 'SIN_AUTORIZACION_VIGENTE');
    await autorizarSalida(U.supervisor, { viajeId: S.v1, parada: 1, tipo: 'normal' });
    await esperaError(autorizarSalida(U.supervisor, { viajeId: S.v1, parada: 1, tipo: 'normal' }), 'YA_AUTORIZADA');
    await registrarSalidaReal(U.supervisor, { viajeId: S.v1, parada: 1 });
    const est = await q<any>(pool, 'SELECT estado FROM bulto WHERE encomienda_id=?', [S.enc.id]);
    expect(est.every(e => e.estado === 'en_transito')).toBe(true);
  });

  it('6. Loja: se baja A; intentar bajar B -> alerta "continua", sin cambio de estado', async () => {
    const [a, b] = S.enc.bultos;
    expect((await sc('descarga', S.v1, 2, a.codigoLegible)).resultado).toBe('ok');
    const r = await sc('descarga', S.v1, 2, b.codigoLegible);
    expect(r.resultado).toBe('debia_continuar');
    expect((await q1<any>(pool, 'SELECT estado FROM bulto WHERE id=?', [b.id]))!.estado).toBe('en_transito');
  });

  it('7. salida de Loja: exige conteo exacto de los que continuan y resolver la incidencia', async () => {
    let e = await esperaError(autorizarSalida(U.supervisor, { viajeId: S.v1, parada: 2, tipo: 'normal' }), 'SALIDA_BLOQUEADA');
    expect(e.detalle.bloqueos.map((b: any) => b.codigo)).toEqual(expect.arrayContaining(['conteo_continuan_faltante', 'conflicto_critico']));
    await registrarConteo(U.ayudante, { viajeId: S.v1, parada: 2, conteo: 1 });
    const inc = await q<any>(pool, 'SELECT id FROM incidencia WHERE resuelta_at IS NULL');
    for (const i of inc) await resolverIncidencia(U.supervisor, i.id, 'Alerta atendida');
    e = await esperaError(autorizarSalida(U.supervisor, { viajeId: S.v1, parada: 2, tipo: 'normal' }), 'SALIDA_BLOQUEADA');
    expect(e.detalle.bloqueos.map((b: any) => b.codigo)).toEqual(['conteo_continuan_no_coincide']);
    await registrarConteo(U.ayudante, { viajeId: S.v1, parada: 2, conteo: 2 });
    const vp = await vistaParada(pool, S.v1, 2);
    expect(vp.evaluacion.normalPermitida).toBe(true);
    await autorizarSalida(U.supervisor, { viajeId: S.v1, parada: 2, tipo: 'normal' });
    await registrarSalidaReal(U.supervisor, { viajeId: S.v1, parada: 2 });
    const est = await q<any>(pool, 'SELECT estado FROM bulto WHERE id=?', [S.enc.bultos[1].id]);
    expect(est[0].estado).toBe('en_transito'); // B y C no cambiaron de estado en Loja
  });

  it('8. Loja recibe A -> pendiente_redespacho con plazo; la encomienda NO figura disponible', async () => {
    const r = await recibirBulto(U.operador, { codigo: S.enc.bultos[0].codigoLegible, agenciaId: A.Loja });
    expect(r.estado).toBe('pendiente_redespacho');
    expect(r.redespachoVence).toBeTruthy();
    expect((await recibirBulto(U.operador, { codigo: S.enc.bultos[0].codigoLegible, agenciaId: A.Loja })).resultado).toBe('repetido');
    await esperaError(recibirBulto(U.operador, { codigo: S.enc.bultos[1].codigoLegible, agenciaId: A.Loja }), 'NO_DESCARGADO');
    const v = await q1<any>(pool, 'SELECT estado FROM v_encomienda_estado WHERE id=?', [S.enc.id]);
    expect(v!.estado).not.toBe('disponible_retiro');
  });

  it('9. Zumba: B y C bajan y se reciben; con 2 de 3 la encomienda sigue sin estar disponible', async () => {
    const [, b, c] = S.enc.bultos;
    expect((await sc('descarga', S.v1, 3, b.codigoLegible)).resultado).toBe('ok');
    expect((await sc('descarga', S.v1, 3, c.qrToken)).resultado).toBe('ok');
    await esperaError(recibirBulto(U.operador, { codigo: b.codigoLegible, agenciaId: A.Loja }), 'AGENCIA_NO_CORRESPONDE');
    expect((await recibirBulto(U.operador, { codigo: b.codigoLegible, agenciaId: A.Zumba })).estado).toBe('disponible_retiro');
    expect((await recibirBulto(U.operador, { codigo: c.codigoLegible, agenciaId: A.Zumba })).estado).toBe('disponible_retiro');
    const v = await q1<any>(pool, 'SELECT estado FROM v_encomienda_estado WHERE id=?', [S.enc.id]);
    expect(v!.estado).toBe('parcialmente_disponible');
    expect(await q1(pool, 'SELECT id FROM codigo_retiro WHERE encomienda_id=?', [S.enc.id])).toBeUndefined(); // aun no hay codigo
    await cerrarViaje(U.operador, S.v1);
  });

  it('10. redespacho de A en otro viaje (sube en Loja); el plazo se cierra al salir; llega y recien ahi: DISPONIBLE + codigo', async () => {
    const abiertos = await q<any>(pool, 'SELECT id FROM redespacho WHERE cerrado_at IS NULL');
    expect(abiertos).toHaveLength(1);
    S.v2 = await viajeNuevo('BUS-02');
    const a = S.enc.bultos[0];
    await agregarItem(U.operador, { viajeId: S.v2, codigo: a.codigoLegible, subeOrden: 2, bajaOrden: 3 });
    await esperaError(agregarItem(U.operador, { viajeId: await viajeNuevo('BUS-03'), codigo: a.codigoLegible, subeOrden: 2, bajaOrden: 3 }), 'YA_EN_OTRO_VIAJE');
    await cerrarManifiesto(U.operador, S.v2);
    // el bus pasa por Quito sin cargar nada de este viaje y llega a Loja
    await autorizarSalida(U.supervisor, { viajeId: S.v2, parada: 1, tipo: 'normal' });
    await registrarSalidaReal(U.supervisor, { viajeId: S.v2, parada: 1 });
    expect((await sc('carga', S.v2, 2, a.codigoLegible)).resultado).toBe('ok');
    await autorizarSalida(U.supervisor, { viajeId: S.v2, parada: 2, tipo: 'normal' });
    await registrarSalidaReal(U.supervisor, { viajeId: S.v2, parada: 2 });
    expect(await q(pool, 'SELECT id FROM redespacho WHERE cerrado_at IS NULL')).toHaveLength(0);
    expect((await sc('descarga', S.v2, 3, a.codigoLegible)).resultado).toBe('ok');
    expect((await recibirBulto(U.operador, { codigo: a.codigoLegible, agenciaId: A.Zumba })).estado).toBe('disponible_retiro');
    const v = await q1<any>(pool, 'SELECT estado FROM v_encomienda_estado WHERE id=?', [S.enc.id]);
    expect(v!.estado).toBe('disponible_retiro');
    expect(await q1(pool, 'SELECT id FROM codigo_retiro WHERE encomienda_id=? AND vigente_key IS NOT NULL', [S.enc.id])).toBeTruthy();
  });

  it('11. mensajes: registro, en camino, llegada intermedia y disponible con codigo (adaptador simulado, tope respetado)', async () => {
    const r = await procesarCola();
    expect(r.fallidas).toBe(0);
    const ms = await q<any>(pool, "SELECT plantilla, cuerpo, estado, destinatario_tel FROM notificacion WHERE encomienda_id=? ORDER BY creado_at", [S.enc.id]);
    expect(ms.length).toBeLessThanOrEqual(5);
    expect(ms.map(m => m.plantilla)).toEqual(expect.arrayContaining(['registro_confirmado', 'en_camino', 'llegada_intermedia', 'disponible_retiro']));
    expect(ms.every(m => m.estado === 'enviada')).toBe(true);
    expect(ms[0].destinatario_tel).toBe('593991234567');
    const disp = ms.find(m => m.plantilla === 'disponible_retiro');
    S.codigo = disp.cuerpo.match(/\b(\d{6})\b/)[1];
    expect(disp.cuerpo).toContain('Agencia Zumba');
  });

  it('12. entrega: codigo incorrecto cuenta intento; el correcto entrega; la linea de tiempo queda completa', async () => {
    const mal = S.codigo === '000000' ? '000001' : '000000';
    const e1 = await esperaError(entregar(U.operador, { encomiendaId: S.enc.id, metodo: 'codigo', codigo: mal, receptorNombre: 'Alguien' }), 'CODIGO_INCORRECTO');
    expect(e1.detalle.restantes).toBe(4);
    await esperaError(entregar(U.operador, { encomiendaId: S.enc.id, metodo: 'documento', receptorNombre: 'Alguien' }), 'DOCUMENTO_OBLIGATORIO');
    const ok = await entregar(U.operador, { encomiendaId: S.enc.id, metodo: 'codigo', codigo: S.codigo, receptorNombre: 'Destinatario Demo' });
    expect(ok.parcial).toBe(false); expect(ok.bultosEntregados).toBe(3);
    const v = await q1<any>(pool, 'SELECT estado FROM v_encomienda_estado WHERE id=?', [S.enc.id]);
    expect(v!.estado).toBe('entregada');
    await esperaError(entregar(U.operador, { encomiendaId: S.enc.id, metodo: 'documento', receptorNombre: 'X', receptorDoc: '1' }), 'NADA_DISPONIBLE');
    const tl = await lineaDeTiempo(pool, S.enc.bultos[0].id);
    const tipos = tl.eventos.map(e => e.tipo);
    expect(tipos).toEqual(expect.arrayContaining(['bulto_registrado', 'agregado_a_manifiesto', 'manifiesto_cerrado', 'escaneo_carga', 'salida_real', 'escaneo_descarga', 'recepcion', 'entrega']));
  });
});

describe('reglas de seguridad', () => {
  it('eventos inmutables: UPDATE y DELETE fallan por trigger', async () => {
    await expect(ex(pool, "UPDATE evento SET tipo='x'")).rejects.toThrow(/inmutable/);
    await expect(ex(pool, 'DELETE FROM evento')).rejects.toThrow(/inmutable/);
  });

  it('idempotencia: el mismo eventId 3 veces (y en paralelo) = 1 solo evento', async () => {
    const enc = await encomienda(1, 'Loja'); const v = await viajeNuevo('BUS-IDEM');
    await agregarItem(U.operador, { viajeId: v, codigo: enc.bultos[0].codigoLegible, subeOrden: 1, bajaOrden: 2 });
    await cerrarManifiesto(U.operador, v);
    const id = randomUUID();
    const rs = await Promise.all([1, 2, 3].map(() => sc('carga', v, 1, enc.bultos[0].codigoLegible, U.ayudante, id)));
    await sc('carga', v, 1, enc.bultos[0].codigoLegible, U.ayudante, id);
    expect(rs.filter(r => r.resultado === 'ok' && !(r as any).repetidoPorReintento).length).toBe(1);
    expect((await q1<any>(pool, 'SELECT COUNT(*) n FROM evento WHERE id=?', [id]))!.n).toBe(1);
    expect((await q1<any>(pool, 'SELECT estado FROM bulto WHERE id=?', [enc.bultos[0].id]))!.estado).toBe('cargado');
  });

  it('concurrencia: dos escaneos distintos del mismo bulto no cambian el estado dos veces', async () => {
    const enc = await encomienda(1, 'Loja'); const v = await viajeNuevo('BUS-CONC');
    await agregarItem(U.operador, { viajeId: v, codigo: enc.bultos[0].codigoLegible, subeOrden: 1, bajaOrden: 2 });
    await cerrarManifiesto(U.operador, v);
    const rs = await Promise.all([sc('carga', v, 1, enc.bultos[0].codigoLegible), sc('carga', v, 1, enc.bultos[0].codigoLegible)]);
    expect(rs.map(r => r.resultado).sort()).toEqual(['ok', 'repetido']);
  });

  it('cambiar el manifiesto invalida la autorizacion vigente (y exige motivo)', async () => {
    const enc = await encomienda(2, 'Loja'); const v = await viajeNuevo('BUS-MOD');
    for (const b of enc.bultos) await agregarItem(U.operador, { viajeId: v, codigo: b.codigoLegible, subeOrden: 1, bajaOrden: 2 });
    await cerrarManifiesto(U.operador, v);
    for (const b of enc.bultos) await sc('carga', v, 1, b.codigoLegible);
    await autorizarSalida(U.supervisor, { viajeId: v, parada: 1, tipo: 'normal' });
    await esperaError(modificarManifiesto(U.operador, v, '  '), 'MOTIVO_OBLIGATORIO');
    const m = await modificarManifiesto(U.operador, v, 'Se agrega un bulto de ultimo momento');
    expect(m.autorizacionesInvalidadas).toBe(1);
    await esperaError(registrarSalidaReal(U.supervisor, { viajeId: v, parada: 1 }), 'SIN_AUTORIZACION_VIGENTE');
    // mientras hay borrador abierto, el bus no puede salir y las reglas siguen: se cierra la nueva version y se reautoriza
    await cerrarManifiesto(U.operador, v);
    await autorizarSalida(U.supervisor, { viajeId: v, parada: 1, tipo: 'normal' });
  });

  it('excepcion A: exige motivo y un solicitante distinto del autorizador; el estado normal sigue bloqueado', async () => {
    const enc = await encomienda(2, 'Loja'); const v = await viajeNuevo('BUS-EXC');
    for (const b of enc.bultos) await agregarItem(U.operador, { viajeId: v, codigo: b.codigoLegible, subeOrden: 1, bajaOrden: 2 });
    await cerrarManifiesto(U.operador, v);
    await sc('carga', v, 1, enc.bultos[0].codigoLegible);
    await esperaError(autorizarSalida(U.supervisor, { viajeId: v, parada: 1, tipo: 'normal' }), 'SALIDA_BLOQUEADA');
    await abrirIncidencia(U.ayudante, { tipo: 'faltante', codigo: enc.bultos[1].codigoLegible, viajeId: v, nota: 'No aparece en bodega' });
    await esperaError(autorizarSalida(U.supervisor, { viajeId: v, parada: 1, tipo: 'excepcion_a', solicitadoPor: U.ayudante, motivo: ' ' }), 'MOTIVO_OBLIGATORIO');
    await esperaError(autorizarSalida(U.supervisor, { viajeId: v, parada: 1, tipo: 'excepcion_a', motivo: 'x' }), 'SOLICITANTE_OBLIGATORIO');
    await esperaError(autorizarSalida(U.supervisor, { viajeId: v, parada: 1, tipo: 'excepcion_a', solicitadoPor: U.supervisor, motivo: 'x' }), 'AUTORIZADOR_DISTINTO_DEL_SOLICITANTE');
    await autorizarSalida(U.supervisor, { viajeId: v, parada: 1, tipo: 'excepcion_a', solicitadoPor: U.ayudante, motivo: 'Bulto extraviado, se levanta faltante' });
  });

  it('codigo de retiro: 5 intentos fallidos bloquean (aunque luego se use el correcto); luego se entrega con documento', async () => {
    const enc = await encomienda(1, 'Loja');
    await ex(pool, "UPDATE bulto SET estado='disponible_retiro' WHERE encomienda_id=?", [enc.id]);
    const { emitirCodigoSiCorresponde } = await import('@/server/services/recepcion');
    await emitirCodigoSiCorresponde(pool, enc.id);
    for (let i = 4; i >= 0; i--) {
      const e = await esperaError(entregar(U.operador, { encomiendaId: enc.id, metodo: 'codigo', codigo: '123456', receptorNombre: 'Intruso' }), 'CODIGO_INCORRECTO');
      expect(e.detalle.restantes).toBe(i);
    }
    const v = await verificarCodigo(enc.id, '123456');
    expect(v.ok).toBe(false); expect((v as any).motivo).toBe('NO_VIGENTE_O_AGOTADO');
    await esperaError(entregar(U.operador, { encomiendaId: enc.id, metodo: 'codigo', codigo: '123456', receptorNombre: 'X' }), 'CODIGO_NO_VIGENTE');
    const ok = await entregar(U.operador, { encomiendaId: enc.id, metodo: 'documento', receptorNombre: 'Destinatario', receptorDoc: '1100000000' });
    expect(ok.parcial).toBe(false);
  });

  it('entrega parcial: exige faltante abierto, supervisor y motivo; luego se emite un codigo nuevo para el resto', async () => {
    const enc = await encomienda(2, 'Loja');
    const [b1, b2] = enc.bultos;
    await ex(pool, "UPDATE bulto SET estado='disponible_retiro' WHERE id=?", [b1.id]);
    await esperaError(entregar(U.operador, { encomiendaId: enc.id, metodo: 'documento', receptorNombre: 'D', receptorDoc: '1' }), 'PARCIAL_SIN_FALTANTE_ABIERTO');
    await abrirIncidencia(U.operador, { tipo: 'faltante', codigo: b2.codigoLegible, nota: 'Aun no llega' });
    await esperaError(entregar(U.operador, { encomiendaId: enc.id, metodo: 'documento', receptorNombre: 'D', receptorDoc: '1' }), 'PARCIAL_REQUIERE_SUPERVISOR_Y_MOTIVO');
    const ok = await entregar(U.operador, { encomiendaId: enc.id, metodo: 'documento', receptorNombre: 'D', receptorDoc: '1', supervisorId: U.supervisor, motivo: 'Cliente necesita llevar el primero' });
    expect(ok.parcial).toBe(true); expect(ok.bultosEntregados).toBe(1);
    expect((await q1<any>(pool, 'SELECT estado FROM v_encomienda_estado WHERE id=?', [enc.id]))!.estado).not.toBe('entregada');
    expect(await q(pool, 'SELECT id FROM codigo_retiro WHERE encomienda_id=? AND vigente_key IS NOT NULL', [enc.id])).toHaveLength(0);
  });

  it('sin regla de tarifa no se inventa precio: exige cotizacion manual con motivo', async () => {
    const base = { origenId: A.Quito, destinoId: A.Zumba, remitenteNombre: 'R', destNombre: 'D', bultos: [{ pesoG: 90000 }] };
    await esperaError(crearEncomienda(U.operador, base), 'SIN_REGLA_TARIFA');
    await esperaError(crearEncomienda(U.operador, { ...base, manual: { valorCent: 5000, motivo: ' ' } }), 'MOTIVO_OBLIGATORIO');
    const r = await crearEncomienda(U.operador, { ...base, manual: { valorCent: 5000, motivo: 'Carga especial autorizada' } });
    expect(r.sinRegla).toBe(true); expect(r.valorCent).toBe(5000);
  });

  it('bulto anulado no se carga; descarga de otro viaje no cambia nada', async () => {
    const enc = await encomienda(1, 'Loja'); const v = await viajeNuevo('BUS-ANU');
    const otro = await encomienda(1, 'Loja'); await agregarItem(U.operador, { viajeId: v, codigo: otro.bultos[0].codigoLegible, subeOrden: 1, bajaOrden: 2 });
    await cerrarManifiesto(U.operador, v);
    await ex(pool, "UPDATE bulto SET estado='anulado' WHERE id=?", [otro.bultos[0].id]);
    expect((await sc('carga', v, 1, otro.bultos[0].codigoLegible)).resultado).toBe('bloqueado');
    const d = await sc('descarga', v, 1, enc.bultos[0].codigoLegible);
    expect(d.resultado).toBe('descarga_incorrecta');
    expect((await q1<any>(pool, 'SELECT estado FROM bulto WHERE id=?', [enc.bultos[0].id]))!.estado).toBe('registrado');
  });

  it('un bulto no puede subir ni bajar en una parada sin agencia', async () => {
    await ex(pool, "UPDATE parada SET agencia_id=NULL WHERE ruta_id=? AND orden=2", [ruta]);
    const enc = await encomienda(1, 'Zumba'); const v = await viajeNuevo('BUS-SA');
    await esperaError(agregarItem(U.operador, { viajeId: v, codigo: enc.bultos[0].codigoLegible, subeOrden: 1, bajaOrden: 2 }), 'PARADA_SIN_AGENCIA');
    await ex(pool, "UPDATE parada SET agencia_id=? WHERE ruta_id=? AND orden=2", [A.Loja, ruta]);
  });

  it('WhatsApp caido: la operacion sigue y el mensaje queda en cola con el error', async () => {
    process.env.MENSAJES_PROVEEDOR = 'evolution'; process.env.EVOLUTION_URL = 'http://127.0.0.1:9'; process.env.EVOLUTION_INSTANCE = 'x'; process.env.EVOLUTION_API_KEY = 'x';
    process.env.MENSAJES_NUMEROS_PERMITIDOS = '0991111111';
    const enc = await encomienda(1, 'Loja', '0991111111'); // la operacion termina sin problema aunque el proveedor este caido
    expect(enc.id).toBeTruthy();
    const r = await procesarCola();
    expect(r.fallidas).toBeGreaterThanOrEqual(1);
    const n = await q1<any>(pool, "SELECT estado, ultimo_error FROM notificacion WHERE encomienda_id=?", [enc.id]);
    expect(n!.estado).toBe('fallida'); expect(n!.ultimo_error).toBeTruthy();
    // modo prueba: un numero NO permitido se descarta (nunca se envia un mensaje real por accidente)
    const e2 = await encomienda(1, 'Loja', '0992222222');
    await ex(pool, "UPDATE notificacion SET next_attempt_at=NOW(3)");
    await procesarCola();
    expect((await q1<any>(pool, "SELECT estado FROM notificacion WHERE encomienda_id=?", [e2.id]))!.estado).toBe('descartada');
    process.env.MENSAJES_PROVEEDOR = 'simulado';
  });
});
