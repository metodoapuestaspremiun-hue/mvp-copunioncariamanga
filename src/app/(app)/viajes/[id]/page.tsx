'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { llamar, fmtLegible } from '@/lib/cliente';
import { Error_, Estado } from '@/components/ui';
import { useUsuario } from '@/components/Sesion';
import { puede } from '@/shared/permisos';

export default function Viaje() {
  const { id } = useParams<{ id: string }>(); const u = useUsuario(); const gestiona = puede(u, 'manifiesto:gestionar');
  const [v, setV] = useState<any>(null); const [err, setErr] = useState<any>(null); const [ok, setOk] = useState('');
  const [f, setF] = useState({ codigo: '', sube: 1, baja: 2 }); const [motivo, setMotivo] = useState('');
  const cargar = () => llamar('/api/viajes/' + id).then(setV).catch(setErr);
  useEffect(() => { cargar(); }, [id]);
  const act = async (fn: () => Promise<any>, msg: string) => { setErr(null); setOk(''); try { await fn(); setOk(msg); await cargar(); } catch (e) { setErr(e); } };
  if (!v) return <div><Error_ e={err} />Cargando...</div>;
  const nombreP = (o: number) => v.paradas.find((p: any) => p.orden === o)?.nombre ?? o;
  const rol = (it: any, p: number) => it.baja_orden === p ? 'baja' : it.sube_orden === p ? 'sube' : (it.sube_orden < p && it.baja_orden > p) ? 'continua' : '';
  return (
    <div><h1>Viaje {v.vehiculo} · {v.ruta}</h1><Error_ e={err} />{ok && <div className="okmsg">{ok}</div>}
      <div className="card"><p>Estado: <b>{v.estado}</b> · Parada actual: <b>{nombreP(v.parada_actual)}</b> · Manifiesto v{v.version} {v.borrador ? <span className="tag amarillo">BORRADOR (sin cerrar)</span> : <span className="tag verde">CERRADO</span>}</p>
        <p>Operar una parada: {v.paradas.map((p: any) => <Link key={p.orden} className="btn sec" style={{ marginRight: 6 }} href={`/viajes/${id}/paradas/${p.orden}`}>{p.orden}. {p.nombre}</Link>)}</p></div>
      {gestiona && v.borrador && <div className="card"><h2>Agregar bulto al manifiesto</h2><div className="row">
        <label>Codigo del bulto<input value={f.codigo} onChange={e => setF({ ...f, codigo: e.target.value })} placeholder="XXXX-XXXX o QR" /></label>
        <label>Sube en<select value={f.sube} onChange={e => setF({ ...f, sube: +e.target.value })}>{v.paradas.map((p: any) => <option key={p.orden} value={p.orden}>{p.orden}. {p.nombre}</option>)}</select></label>
        <label>Baja en<select value={f.baja} onChange={e => setF({ ...f, baja: +e.target.value })}>{v.paradas.map((p: any) => <option key={p.orden} value={p.orden}>{p.orden}. {p.nombre}</option>)}</select></label>
        <button onClick={() => act(async () => { await llamar(`/api/viajes/${id}/manifiesto/items`, 'POST', { codigo: f.codigo, subeOrden: f.sube, bajaOrden: f.baja }); setF({ ...f, codigo: '' }); }, 'Bulto agregado')} disabled={!f.codigo}>Agregar</button></div>
        <p className="muted">Si un bulto baja antes de su destino final (ej. Quito→Zumba que baja en Loja), el sistema divide su recorrido en tramos y crea el redespacho al recibirlo.</p></div>}
      <div className="card"><h2>Manifiesto (version {v.version})</h2>
        <table><thead><tr><th>Bulto</th><th>Encomienda</th><th>Destinatario</th><th>Sube</th><th>Baja</th><th>Estado</th><th></th></tr></thead><tbody>
          {v.items.map((it: any) => <tr key={it.bulto_id}><td className="mono">{fmtLegible(it.codigo_legible)}</td><td>{it.enc_codigo} #{it.numero}</td><td>{it.dest_nombre}</td><td>{nombreP(it.sube_orden)}</td><td>{nombreP(it.baja_orden)}</td><td><Estado e={it.estado} /></td>
            <td>{gestiona && v.borrador && <button className="sec" onClick={() => act(() => llamar(`/api/viajes/${id}/manifiesto/items?bultoId=${it.bulto_id}`, 'DELETE'), 'Bulto quitado')}>Quitar</button>}</td></tr>)}
          {!v.items.length && <tr><td colSpan={7} className="muted">Sin bultos</td></tr>}</tbody></table>
        <p className="muted">Por parada: {v.paradas.map((p: any) => `${p.nombre}: sube ${v.items.filter((i: any) => rol(i, p.orden) === 'sube').length}, baja ${v.items.filter((i: any) => rol(i, p.orden) === 'baja').length}, continua ${v.items.filter((i: any) => rol(i, p.orden) === 'continua').length}`).join(' · ')}</p>
        {gestiona && v.borrador && <button className="verde" onClick={() => act(() => llamar(`/api/viajes/${id}/manifiesto/cerrar`, 'POST'), 'Manifiesto cerrado: los bultos pasan a "pendiente de despacho"')} disabled={!v.items.length}>Cerrar manifiesto</button>}
        {gestiona && !v.borrador && v.version && <div className="row" style={{ marginTop: 10 }}><label>Modificar despues del cierre (motivo obligatorio; invalida la autorizacion de salida)<input value={motivo} onChange={e => setMotivo(e.target.value)} /></label>
          <button className="rojo" onClick={() => act(() => llamar(`/api/viajes/${id}/manifiesto/modificar`, 'POST', { motivo }), 'Nueva version abierta: la autorizacion vigente quedo invalidada')} disabled={!motivo.trim()}>Modificar manifiesto</button>
          <button className="sec" onClick={() => act(() => llamar(`/api/viajes/${id}/cerrar`, 'POST'), 'Viaje cerrado')}>Cerrar viaje</button></div>}
      </div></div>);
}
