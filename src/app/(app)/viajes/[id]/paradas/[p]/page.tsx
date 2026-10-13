'use client';
import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { llamar, nuevoEventId, fmtLegible, fechaEC } from '@/lib/cliente';
import { Error_, Estado, ResultadoGrande, Scanner } from '@/components/ui';
import { useUsuario } from '@/components/Sesion';
import { puede } from '@/shared/permisos';

export default function Parada() {
  const { id, p } = useParams<{ id: string; p: string }>(); const u = useUsuario(); const orden = Number(p);
  const [d, setD] = useState<any>(null); const [err, setErr] = useState<any>(null); const [ok, setOk] = useState('');
  const [modo, setModo] = useState<'carga' | 'descarga'>('carga'); const [res, setRes] = useState<any>(null); const [hist, setHist] = useState<any[]>([]);
  const [conteo, setConteo] = useState(''); const [usuarios, setUsuarios] = useState<any[]>([]);
  const [exc, setExc] = useState({ motivo: '', solicitadoPor: '' }); const [ocupado, setOcupado] = useState(false);
  const cargar = useCallback(() => llamar(`/api/viajes/${id}/paradas/${p}`).then(setD).catch(setErr), [id, p]);
  useEffect(() => { cargar(); llamar('/api/usuarios').then(setUsuarios).catch(() => {}); }, [cargar]);
  const act = async (fn: () => Promise<any>, msg: string) => { setErr(null); setOk(''); try { await fn(); setOk(msg); } catch (e) { setErr(e); } await cargar(); };
  const escanear = async (codigo: string) => {
    setErr(null); setOcupado(true);
    try {
      const r: any = await llamar('/api/escaneos', 'POST', { eventId: nuevoEventId(), tipo: modo, viajeId: id, parada: orden, codigo, deviceId: navigator.userAgent.slice(0, 60) });
      setRes(r); setHist(h => [{ ...r, modo, t: new Date() }, ...h].slice(0, 12));
      if (typeof navigator.vibrate === 'function') navigator.vibrate(r.resultado === 'ok' ? 80 : [200, 80, 200]);
    } catch (e) { setErr(e); setRes(null); } finally { setOcupado(false); await cargar(); }
  };
  if (!d) return <div><Error_ e={err} />Cargando...</div>;
  const ev = d.evaluacion; const aut = d.autorizacion;
  const lista = (rol: string) => d.bultos.filter((b: any) => b.rol === rol);
  const Col = ({ titulo, rol }: { titulo: string; rol: string }) => (
    <div className="card"><h2>{titulo} ({lista(rol).length})</h2><table><tbody>{lista(rol).map((b: any) => <tr key={b.bultoId}><td className="mono">{fmtLegible(b.codigo)}</td><td>{b.encomienda} #{b.numero}</td><td><Estado e={b.estado} /></td></tr>)}</tbody></table></div>);
  const enParada = d.viaje.parada_actual === orden;
  const continuan = lista('continua').length;
  return (
    <div>
      <h1>Parada {orden}: {d.parada.nombre} <span className="muted">· manifiesto v{d.version} · <Link href={'/viajes/' + id}>volver al viaje</Link></span></h1>
      {!enParada && <div className="err">El bus esta en la parada {d.viaje.parada_actual}. {orden < d.viaje.parada_actual ? 'Esta parada ya salio.' : 'Aun no llega a esta parada.'}</div>}
      <Error_ e={err} />{ok && <div className="okmsg">{ok}</div>}
      <div className="grid"><Col titulo="Bajan aqui" rol="baja" /><Col titulo="Suben aqui" rol="sube" /><Col titulo="Continuan a bordo" rol="continua" /></div>

      {puede(u, 'escaneo:operar') && enParada && <div className="card"><h2>Escaneo</h2>
        <div className="row"><label>Operacion<select value={modo} onChange={e => setModo(e.target.value as any)}><option value="carga">Carga (suben)</option><option value="descarga">Descarga (bajan)</option></select></label></div>
        <Scanner onCode={escanear} ocupado={ocupado} /><ResultadoGrande r={res} />
        {hist.length > 0 && <table><tbody>{hist.map((h, i) => <tr key={i}><td className="mono">{fmtLegible(h.codigo ?? '')}</td><td>{h.modo}</td><td>{h.resultado}</td><td className="muted">{h.alerta}</td></tr>)}</tbody></table>}</div>}

      {puede(u, 'conteo:continuan') && continuan > 0 && enParada && <div className="card"><h2>Conteo de los que continuan a bordo</h2>
        <p className="muted">Cuenta con tus ojos los bultos que siguen en el bus (el sistema espera {continuan}). Conteo registrado: <b>{d.conteo ?? 'ninguno'}</b></p>
        <div className="row"><label>Cantidad contada<input type="number" min={0} value={conteo} onChange={e => setConteo(e.target.value)} /></label>
          <button onClick={() => act(() => llamar(`/api/viajes/${id}/paradas/${p}/conteo`, 'POST', { conteo: parseInt(conteo || '0') }), 'Conteo registrado')} disabled={conteo === ''}>Registrar conteo</button></div></div>}

      <div className="card"><h2>Salida de esta parada</h2>
        {ev.normalPermitida ? <div className="okmsg">La carga concilia con el manifiesto. Se esperan {ev.esperadoABordo} bulto(s) a bordo al salir.</div>
          : <div className="err"><b>Salida bloqueada</b>{ev.mensajes.map((m: string, i: number) => <div key={i}>• {m}</div>)}</div>}
        {aut ? <p>Autorizacion vigente ({aut.tipo}) {fechaEC(aut.autorizado_at)} {aut.salida_real_at ? <b>· SALIDA REGISTRADA {fechaEC(aut.salida_real_at)}</b> : ''}</p> : <p className="muted">Sin autorizacion vigente.</p>}
        {enParada && !aut && puede(u, 'salida:autorizar') && <button className="verde" disabled={!ev.normalPermitida} onClick={() => act(() => llamar(`/api/viajes/${id}/paradas/${p}/autorizar`, 'POST', { tipo: 'normal' }), 'Salida autorizada')}>Autorizar salida</button>}
        {enParada && !aut && !ev.normalPermitida && ev.excepcionPermitida === 'A' && puede(u, 'excepcion:autorizar') && <div className="card" style={{ marginTop: 10 }}><h2>Excepcion A (supervisor)</h2>
          <div className="row"><label>Motivo (obligatorio)<input value={exc.motivo} onChange={e => setExc({ ...exc, motivo: e.target.value })} /></label>
            <label>Quien solicita la excepcion (otra persona)<select value={exc.solicitadoPor} onChange={e => setExc({ ...exc, solicitadoPor: e.target.value })}><option value="">-- elegir --</option>{usuarios.filter(x => x.id !== u.id).map(x => <option key={x.id} value={x.id}>{x.nombre}</option>)}</select></label>
            <button className="rojo" disabled={!exc.motivo.trim() || !exc.solicitadoPor} onClick={() => act(() => llamar(`/api/viajes/${id}/paradas/${p}/autorizar`, 'POST', { tipo: 'excepcion_a', ...exc }), 'Excepcion autorizada')}>Autorizar con excepcion</button></div></div>}
        {enParada && aut && !aut.salida_real_at && puede(u, 'salida:registrar_real') && <button onClick={() => act(() => llamar(`/api/viajes/${id}/paradas/${p}/salida-real`, 'POST'), 'Salida real registrada: el bus salio')}>Registrar salida real</button>}
      </div>

      <div className="card"><h2>Incidencias abiertas del viaje ({d.incidencias.length})</h2>
        <table><tbody>{d.incidencias.map((i: any) => <tr key={i.id}><td><span className="tag rojo">{i.tipo}</span></td><td className="mono">{fmtLegible(i.codigo_legible ?? '')}</td><td>{fechaEC(i.abierta_at)}</td>
          <td>{puede(u, 'incidencia:resolver') && <button className="sec" onClick={() => { const nota = prompt('Nota de resolucion (que se hizo):') ?? ''; act(() => llamar(`/api/incidencias/${i.id}/resolver`, 'POST', { nota }), 'Incidencia resuelta'); }}>Resolver</button>}</td></tr>)}</tbody></table>
        <p className="muted">Las incidencias de tipo sobrante / descarga incorrecta sin resolver bloquean la salida (no se pueden saltar con excepcion).</p></div>
    </div>);
}
