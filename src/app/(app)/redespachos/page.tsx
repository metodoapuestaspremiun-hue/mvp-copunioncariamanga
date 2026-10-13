'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { llamar, fechaEC, fmtLegible } from '@/lib/cliente';
import { Error_, Estado } from '@/components/ui';

export default function Redespachos() {
  const [d, setD] = useState<any[]>([]); const [err, setErr] = useState<any>(null);
  useEffect(() => { llamar('/api/redespachos').then(setD).catch(setErr); }, []);
  return (
    <div><h1>Redespachos</h1><Error_ e={err} />
      <p className="muted">Bultos que bajaron en una agencia intermedia y deben continuar en otro viaje. Para asignarlos: Viajes → manifiesto borrador → "Agregar bulto" con el codigo del bulto.</p>
      <div className="card"><table><thead><tr><th>Bulto</th><th>Encomienda</th><th>Agencia responsable</th><th>Destino final</th><th>Plazo</th><th>Estado</th></tr></thead><tbody>
        {d.map(r => <tr key={r.id}><td className="mono"><Link href={'/bultos/' + r.bulto_id}>{fmtLegible(r.codigo_legible)}</Link></td><td>{r.enc_codigo} #{r.numero}</td><td>{r.agencia}</td><td>{r.destino}</td>
          <td>{r.cerrado_at ? <span className="tag verde">Despachado {fechaEC(r.cerrado_at)}</span> : r.vencido ? <span className="tag rojo">VENCIDO ({fechaEC(r.due_at)})</span> : <span className="tag amarillo">vence {fechaEC(r.due_at)}</span>}</td><td><Estado e={r.estado} /></td></tr>)}
        {!d.length && <tr><td colSpan={6} className="muted">No hay redespachos</td></tr>}</tbody></table></div></div>);
}
