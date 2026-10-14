'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { llamar, fechaEC, fmtLegible } from '@/lib/cliente';
import { Error_, Estado, BotonAtras } from '@/components/ui';

const NOMBRES: Record<string, string> = { bulto_registrado: 'Bulto registrado', agregado_a_manifiesto: 'Agregado al manifiesto', manifiesto_cerrado: 'Manifiesto cerrado',
  escaneo_carga: 'Escaneo de carga', escaneo_descarga: 'Escaneo de descarga', salida_real: 'Salida real del bus', recepcion: 'Recepcion en agencia', entrega: 'Entrega',
  incidencia_abierta: 'Incidencia abierta', incidencia_resuelta: 'Incidencia resuelta', retirado_de_manifiesto: 'Retirado del manifiesto' };
export default function Linea() {
  const { id } = useParams<{ id: string }>(); const [d, setD] = useState<any>(null); const [err, setErr] = useState<any>(null);
  useEffect(() => { llamar(`/api/bultos/${id}/timeline`).then(setD).catch(setErr); }, [id]);
  if (!d) return <div><Error_ e={err} />Cargando...</div>;
  const b = d.bulto;
  return (
    <div>
      <BotonAtras label="Volver a Encomienda" />
      <h1>Linea de tiempo · <span className="mono">{fmtLegible(b.codigo_legible)}</span> <Estado e={b.estado} /></h1>
      <p>{b.enc_codigo} #{b.numero} · {b.origen} → <b>{b.destino}</b> · {b.dest_nombre}</p>
      <div className="card"><table><thead><tr><th>Cuando</th><th>Que paso</th><th>Resultado</th><th>Parada</th><th>Quien</th></tr></thead><tbody>
        {d.eventos.map((e: any) => <tr key={e.id}><td>{fechaEC(e.recibido_servidor)}</td><td>{NOMBRES[e.tipo] ?? e.tipo}</td><td>{e.resultado}</td><td>{e.parada_orden}</td><td>{e.actor}</td></tr>)}</tbody></table>
        <p className="muted">Los eventos son inmutables: no se editan ni se borran. Una correccion es un evento nuevo.</p></div></div>);
}
