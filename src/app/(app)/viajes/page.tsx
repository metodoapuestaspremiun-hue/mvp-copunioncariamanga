'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { llamar } from '@/lib/cliente';
import { Error_ } from '@/components/ui';
import { useUsuario } from '@/components/Sesion';
import { puede } from '@/shared/permisos';

export default function Viajes() {
  const u = useUsuario(); const router = useRouter();
  const [v, setV] = useState<any[]>([]); const [cat, setCat] = useState<any>(null); const [err, setErr] = useState<any>(null);
  const [f, setF] = useState({ rutaId: '', fecha: new Date().toISOString().slice(0, 10), vehiculo: '', conductor: '' });
  useEffect(() => { llamar('/api/viajes').then(setV).catch(setErr); llamar('/api/catalogos').then((c: any) => { setCat(c); setF(x => ({ ...x, rutaId: c.rutas[0]?.id ?? '' })); }); }, []);
  const crear = async () => { setErr(null); try { const r: any = await llamar('/api/viajes', 'POST', { ...f, conductor: f.conductor || null }); router.push('/viajes/' + r.id); } catch (e) { setErr(e); } };
  return (
    <div><h1>Viajes</h1><Error_ e={err} />
      {puede(u, 'manifiesto:gestionar') && cat && <div className="card"><h2>Nuevo viaje</h2><div className="row">
        <label>Ruta<select value={f.rutaId} onChange={e => setF({ ...f, rutaId: e.target.value })}>{cat.rutas.map((r: any) => <option key={r.id} value={r.id}>{r.nombre}</option>)}</select></label>
        <label>Fecha<input type="date" value={f.fecha} onChange={e => setF({ ...f, fecha: e.target.value })} /></label>
        <label>Vehiculo (placa / n.o)<input value={f.vehiculo} onChange={e => setF({ ...f, vehiculo: e.target.value })} /></label>
        <label>Conductor<input value={f.conductor} onChange={e => setF({ ...f, conductor: e.target.value })} /></label>
        <button onClick={crear} disabled={!f.vehiculo}>Crear viaje</button></div></div>}
      <div className="card"><table><thead><tr><th>Fecha</th><th>Vehiculo</th><th>Ruta</th><th>Estado</th><th>Parada actual</th><th>Bultos</th></tr></thead>
        <tbody>{v.map(x => <tr key={x.id}><td>{String(x.fecha).slice(0, 10)}</td><td><Link href={'/viajes/' + x.id}>{x.vehiculo}</Link></td><td>{x.ruta}</td><td>{x.estado}</td><td>{x.parada_actual}</td><td>{x.items}</td></tr>)}</tbody></table></div></div>
  );
}
