'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { llamar, dinero, fechaEC, fmtLegible } from '@/lib/cliente';
import { Error_, Estado, Etiqueta, BotonAtras } from '@/components/ui';

export default function Detalle() {
  const { id } = useParams<{ id: string }>();
  const [e, setE] = useState<any>(null); const [err, setErr] = useState<any>(null);
  useEffect(() => { llamar('/api/encomiendas/' + id).then(setE).catch(setErr); }, [id]);
  if (!e) return <div><Error_ e={err} />Cargando...</div>;
  return (
    <div>
      <BotonAtras href="/encomiendas" label="Volver a Encomiendas" />
      <h1>Encomienda {e.codigo} <Estado e={e.estado_calculado ?? 'en_proceso'} /></h1>
      <div className="grid">
        <div className="card"><h2>Datos</h2><p>{e.origen_nombre} → <b>{e.destino_nombre}</b></p>
          <p>Remitente: {e.remitente_nombre} {e.remitente_tel}<br />Destinatario: {e.dest_nombre} {e.dest_tel}</p>
          <p className="muted">Contenido: {e.contenido_declarado ?? '-'} · Ref. guia: {e.ref_externa ?? '-'} · Creada {fechaEC(e.creado_at)}</p>
          {e.cotizacion && <p>Valor cotizado: <b>{dinero(e.cotizacion.valor_cent)}</b> <span className="muted">{e.cotizacion.etiqueta} {e.cotizacion.sin_regla ? '· manual: ' + e.cotizacion.motivo : ''}</span></p>}</div>
        <div className="card"><h2>Bultos</h2><table><tbody>{e.bultos.map((b: any) => <tr key={b.id}><td>#{b.numero}</td><td className="mono">{fmtLegible(b.codigo_legible)}</td><td>{b.peso_g} g</td><td><Estado e={b.estado} /></td><td><Link href={'/bultos/' + b.id}>Linea de tiempo</Link></td></tr>)}</tbody></table></div></div>
      <p className="noprint"><button onClick={() => window.print()}>Reimprimir etiquetas</button></p>
      <div className="etiquetas imprimible">{e.bultos.map((b: any) => <Etiqueta key={b.id} token={b.qr_token} legible={b.codigo_legible} destino={e.destino_nombre} numero={b.numero} total={e.bultos.length} encomienda={e.codigo} />)}</div>
    </div>);
}
