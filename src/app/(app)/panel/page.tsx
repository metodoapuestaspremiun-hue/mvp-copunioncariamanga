'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { llamar, fechaEC } from '@/lib/cliente';
import { Error_, Estado } from '@/components/ui';
import { useUsuario } from '@/components/Sesion';
import { puede } from '@/shared/permisos';

export default function Panel() {
  const u = useUsuario(); const router = useRouter();
  const [d, setD] = useState<any>(null); const [err, setErr] = useState<any>(null); const [cod, setCod] = useState('');
  const cargar = () => llamar('/api/panel').then(setD).catch(setErr);
  useEffect(() => { cargar(); const t = setInterval(cargar, 15000); return () => clearInterval(t); }, []);
  const buscar = async () => { setErr(null); try { const b: any = await llamar('/api/bultos?codigo=' + encodeURIComponent(cod)); router.push('/bultos/' + b.id); } catch (e) { setErr(e); } };
  if (!d) return <div>{err ? <Error_ e={err} /> : 'Cargando...'}</div>;
  const sup = puede(u, 'incidencia:resolver') || puede(u, 'ver:todo');
  return (
    <div>
      <h1>Panel</h1>
      <Error_ e={err} />
      <div className="card noprint"><div className="row">
        <label>Buscar bulto y ver su linea de tiempo<input value={cod} onChange={e => setCod(e.target.value)} onKeyDown={e => e.key === 'Enter' && buscar()} placeholder="Codigo XXXX-XXXX o QR" /></label>
        <button onClick={buscar}>Ver linea de tiempo</button></div></div>
      <div className="grid">
        <div className="card"><h2>Bultos por estado</h2>
          <table><tbody>{d.porEstado.map((e: any) => <tr key={e.estado}><td><Estado e={e.estado} /></td><td className="num">{e.n}</td></tr>)}
            {!d.porEstado.length && <tr><td className="muted">Sin datos aun</td></tr>}</tbody></table>
          <p className="muted">Bultos registrados sin viaje: <b>{d.sinViaje}</b></p></div>
        <div className="card"><h2>Por recibir en agencia ({d.porRecibir.length})</h2>
          <table><tbody>{d.porRecibir.map((b: any) => <tr key={b.id}><td className="mono">{b.codigo_legible}</td><td>{b.enc_codigo}</td><td>{b.agencia}</td></tr>)}</tbody></table></div>
        <div className="card"><h2>Redespachos pendientes ({d.redespachos.length})</h2>
          <table><tbody>{d.redespachos.map((r: any) => <tr key={r.id}><td className="mono">{r.codigo_legible}</td><td>{r.agencia} → {r.destino}</td>
            <td>{r.vencido ? <span className="tag rojo">VENCIDO</span> : <span className="tag">vence {fechaEC(r.due_at)}</span>}</td></tr>)}</tbody></table></div>
        <div className="card"><h2>Incidencias abiertas ({d.incidencias.length})</h2>
          <table><tbody>{d.incidencias.map((i: any) => <tr key={i.id}><td><span className="tag rojo">{i.tipo}</span></td><td className="mono">{i.codigo_legible}</td><td>{fechaEC(i.abierta_at)}</td></tr>)}</tbody></table>
          <Link href="/incidencias">Ver / resolver</Link></div>
        <div className="card"><h2>Disponibles para retiro ({d.disponibles.length})</h2>
          <table><tbody>{d.disponibles.map((e: any) => <tr key={e.id}><td><Link href={'/encomiendas/' + e.id}>{e.codigo}</Link></td><td>{e.dest_nombre}</td><td>{e.destino}</td><td><Estado e={e.estado} /></td></tr>)}</tbody></table></div>
        <div className="card"><h2>Viajes activos</h2>
          <table><tbody>{d.viajes.map((v: any) => <tr key={v.id}><td><Link href={'/viajes/' + v.id}>{v.vehiculo}</Link></td><td>{v.ruta}</td><td>{v.estado} (parada {v.parada_actual})</td></tr>)}</tbody></table></div>
        {sup && <div className="card"><h2>Excepciones de salida</h2>
          <table><tbody>{d.excepciones.map((x: any) => <tr key={x.id}><td>{fechaEC(x.autorizado_at)}</td><td>{x.autorizado_por}</td><td>{x.motivo}</td></tr>)}</tbody></table>
          <h2 style={{ marginTop: 12 }}>Modificaciones de manifiesto</h2>
          <table><tbody>{d.modificaciones.map((m: any, i: number) => { let p: any = {}; try { p = typeof m.payload === 'string' ? JSON.parse(m.payload) : m.payload; } catch {} return <tr key={i}><td>{fechaEC(m.recibido_servidor)}</td><td>{m.nombre}</td><td>{p?.motivo}</td></tr>; })}</tbody></table></div>}
      </div>
      {puede(u, 'export:csv') && <p><a className="btn sec" href="/api/export/eventos">Descargar CSV de eventos</a></p>}
    </div>
  );
}
