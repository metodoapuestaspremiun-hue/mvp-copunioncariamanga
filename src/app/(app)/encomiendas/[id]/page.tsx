'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { llamar, dinero, fechaEC, fmtLegible } from '@/lib/cliente';
import { Error_, Estado, Etiqueta, BotonAtras } from '@/components/ui';

export default function Detalle() {
  const { id } = useParams<{ id: string }>();
  const [e, setE] = useState<any>(null);
  const [err, setErr] = useState<any>(null);

  useEffect(() => { llamar('/api/encomiendas/' + id).then(setE).catch(setErr); }, [id]);

  if (!e) return (
    <div>
      <Error_ e={err} />
      {!err && <div style={{ color: '#64748b', padding: 20 }}>Cargando…</div>}
    </div>
  );

  return (
    <div>
      <BotonAtras href="/encomiendas" label="Volver a Encomiendas" />
      <h1>Encomienda {e.codigo} <Estado e={e.estado_calculado ?? 'en_proceso'} /></h1>

      {/* Banner de viaje si existe */}
      {e.viaje && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10,
          background: '#eff6ff', border: '1.5px solid #bfdbfe', borderRadius: 12, padding: '12px 18px', marginBottom: 18,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ fontSize: 24 }}>🚌</div>
            <div>
              <div style={{ fontWeight: 800, fontSize: 14, color: '#1e3a8a', marginBottom: 2 }}>
                Asignada al viaje: {e.viaje.ruta_nombre ?? 'Ruta desconocida'}
              </div>
              <div style={{ fontSize: 12, color: '#3b82f6', display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                {e.viaje.vehiculo && <span>🚍 {e.viaje.vehiculo}</span>}
                {e.viaje.conductor && <span>👤 {e.viaje.conductor}</span>}
                <span style={{
                  display: 'inline-flex', alignItems: 'center', gap: 3,
                  padding: '1px 7px', borderRadius: 999, fontSize: 11, fontWeight: 700,
                  background: e.viaje.viaje_estado === 'en_ruta' ? '#d1fae5' : '#fef3c7',
                  color:      e.viaje.viaje_estado === 'en_ruta' ? '#059669'  : '#d97706',
                }}>
                  {e.viaje.viaje_estado === 'en_ruta' ? 'En ruta' : e.viaje.viaje_estado}
                </span>
              </div>
            </div>
          </div>
          <Link
            href={`/viajes/${e.viaje.id}`}
            className="btn"
            style={{
              background: 'linear-gradient(135deg, #1d4ed8, #7c3aed)',
              border: 'none', color: '#fff', fontWeight: 700, fontSize: 13,
              display: 'inline-flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap',
              boxShadow: '0 4px 12px rgba(29,78,216,0.30)',
            }}
          >
            Ver viaje completo →
          </Link>
        </div>
      )}

      <div className="grid">
        <div className="card">
          <h2>Datos</h2>
          <p>{e.origen_nombre} → <b>{e.destino_nombre}</b></p>
          <p>
            Remitente: {e.remitente_nombre} {e.remitente_tel}<br />
            Destinatario: {e.dest_nombre} {e.dest_tel}
          </p>
          <p className="muted">
            Contenido: {e.contenido_declarado ?? '-'} · Ref. guia: {e.ref_externa ?? '-'} · Creada {fechaEC(e.creado_at)}
          </p>
          {e.cotizacion && (
            <p>
              Valor cotizado: <b>{dinero(e.cotizacion.valor_cent)}</b>{' '}
              <span className="muted">
                {e.cotizacion.etiqueta}
                {e.cotizacion.sin_regla ? ' · manual: ' + e.cotizacion.motivo : ''}
              </span>
            </p>
          )}
        </div>

        <div className="card">
          <h2>Paquetes</h2>
          <table>
            <tbody>
              {e.bultos.map((b: any) => (
                <tr key={b.id}>
                  <td>#{b.numero}</td>
                  <td className="mono">{fmtLegible(b.codigo_legible)}</td>
                  <td>{b.peso_g} g</td>
                  <td><Estado e={b.estado} /></td>
                  <td><Link href={'/bultos/' + b.id}>Línea de tiempo</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <p className="noprint">
        <button onClick={() => window.print()}>Reimprimir etiquetas</button>
      </p>
      <div className="etiquetas imprimible">
        {e.bultos.map((b: any) => (
          <Etiqueta
            key={b.id}
            token={b.qr_token}
            legible={b.codigo_legible}
            destino={e.destino_nombre}
            numero={b.numero}
            total={e.bultos.length}
            encomienda={e.codigo}
          />
        ))}
      </div>
    </div>
  );
}
