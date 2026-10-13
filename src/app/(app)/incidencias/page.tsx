'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { llamar, fechaEC, fmtLegible } from '@/lib/cliente';
import { Error_ } from '@/components/ui';
import { useUsuario } from '@/components/Sesion';
import { puede } from '@/shared/permisos';

const TIPOS = ['faltante', 'sobrante', 'descarga_incorrecta', 'dano', 'etiqueta_ilegible', 'discrepancia_recepcion'];
export default function Incidencias() {
  const u = useUsuario(); const [d, setD] = useState<any[]>([]); const [err, setErr] = useState<any>(null); const [todas, setTodas] = useState(false);
  const [f, setF] = useState({ tipo: 'faltante', codigo: '', nota: '' });
  const cargar = () => llamar('/api/incidencias' + (todas ? '?todas=1' : '')).then(setD).catch(setErr);
  useEffect(() => { cargar(); }, [todas]);
  const abrir = async () => { setErr(null); try { await llamar('/api/incidencias', 'POST', { tipo: f.tipo, codigo: f.codigo || undefined, nota: f.nota || undefined }); setF({ ...f, codigo: '', nota: '' }); await cargar(); } catch (e) { setErr(e); } };
  const resolver = async (id: string) => { const nota = prompt('Nota de resolucion:') ?? ''; setErr(null); try { await llamar(`/api/incidencias/${id}/resolver`, 'POST', { nota }); await cargar(); } catch (e) { setErr(e); } };
  return (
    <div><h1>Incidencias</h1><Error_ e={err} />
      <div className="card"><h2>Reportar incidencia</h2><div className="row">
        <label>Tipo<select value={f.tipo} onChange={e => setF({ ...f, tipo: e.target.value })}>{TIPOS.map(t => <option key={t}>{t}</option>)}</select></label>
        <label>Codigo del bulto<input value={f.codigo} onChange={e => setF({ ...f, codigo: e.target.value })} /></label>
        <label>Nota<input value={f.nota} onChange={e => setF({ ...f, nota: e.target.value })} /></label><button onClick={abrir}>Reportar</button></div></div>
      <div className="card"><label style={{ flexDirection: 'row', gap: 8 }}><input type="checkbox" checked={todas} onChange={e => setTodas(e.target.checked)} /> Incluir resueltas</label>
        <table><thead><tr><th>Tipo</th><th>Bulto</th><th>Abierta</th><th>Estado</th><th>Nota</th><th></th></tr></thead><tbody>
          {d.map(i => <tr key={i.id}><td><span className="tag rojo">{i.tipo}</span></td><td className="mono">{i.bulto_id ? <Link href={'/bultos/' + i.bulto_id}>{fmtLegible(i.codigo_legible)}</Link> : ''}</td><td>{fechaEC(i.abierta_at)}</td>
            <td>{i.resuelta_at ? <span className="tag verde">Resuelta {fechaEC(i.resuelta_at)}</span> : <span className="tag rojo">Abierta</span>}</td><td>{i.nota}</td>
            <td>{!i.resuelta_at && puede(u, 'incidencia:resolver') && <button className="sec" onClick={() => resolver(i.id)}>Resolver</button>}</td></tr>)}</tbody></table></div></div>);
}
