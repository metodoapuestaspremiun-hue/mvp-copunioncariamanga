'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { llamar, fechaEC } from '@/lib/cliente';
import { Error_, Estado } from '@/components/ui';

export default function Lista() {
  const [q, setQ] = useState(''); const [d, setD] = useState<any[]>([]); const [err, setErr] = useState<any>(null);
  const cargar = () => llamar('/api/encomiendas?q=' + encodeURIComponent(q)).then(setD).catch(setErr);
  useEffect(() => { cargar(); }, []);
  return (
    <div><h1>Encomiendas</h1><Error_ e={err} />
      <div className="card"><div className="row"><label>Buscar (codigo, remitente o destinatario)<input value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => e.key === 'Enter' && cargar()} /></label><button onClick={cargar}>Buscar</button></div></div>
      <div className="card">
        <div className="tabla-scroll">
          <table className="tabla-fija"><thead><tr><th>Código</th><th>Destinatario</th><th>Ruta</th><th>Bultos</th><th>Estado</th><th>Creada</th></tr></thead>
            <tbody>{d.map(e => <tr key={e.id}><td><Link href={'/encomiendas/' + e.id}>{e.codigo}</Link></td><td>{e.dest_nombre}</td><td>{e.origen} → {e.destino}</td><td>{e.bultos}</td><td><Estado e={e.estado ?? 'en_proceso'} /></td><td>{fechaEC(e.creado_at)}</td></tr>)}</tbody>
          </table>
        </div>
      </div></div>
  );
}
