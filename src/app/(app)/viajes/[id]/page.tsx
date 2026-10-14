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
  const [bultosDisponibles, setBultosDisponibles] = useState<any[]>([]);

  const cargar = () => llamar('/api/viajes/' + id).then(setV).catch(setErr);
  useEffect(() => { cargar(); }, [id]);
  useEffect(() => {
    llamar('/api/bultos/disponibles').then(setBultosDisponibles).catch(() => {});
  }, [v]);

  const act = async (fn: () => Promise<any>, msg: string) => { setErr(null); setOk(''); try { await fn(); setOk(msg); await cargar(); } catch (e) { setErr(e); } };
  if (!v) return <div><Error_ e={err} />Cargando...</div>;
  const nombreP = (o: number) => v.paradas.find((p: any) => p.orden === o)?.nombre ?? o;
  const rol = (it: any, p: number) => it.baja_orden === p ? 'baja' : it.sube_orden === p ? 'sube' : (it.sube_orden < p && it.baja_orden > p) ? 'continua' : '';

  const estadoColor = v.estado === 'en_ruta' ? 'verde' : v.estado === 'cerrado' ? '' : 'amarillo';

  return (
    <div>
      <h1>Viaje {v.vehiculo} · {v.ruta}</h1>
      <Error_ e={err} />{ok && <div className="okmsg">{ok}</div>}

      {/* Info del viaje */}
      <div className="card">
        <div className="row" style={{ flexWrap: 'wrap', gap: 12 }}>
          <span>Estado: <span className={`tag ${estadoColor}`}>{v.estado}</span></span>
          <span>Parada actual: <b>{nombreP(v.parada_actual)}</b></span>
          <span>Manifiesto v{v.version} {v.borrador
            ? <span className="tag amarillo">BORRADOR — pendiente cerrar</span>
            : <span className="tag verde">✓ CERRADO</span>}
          </span>
        </div>
        <p style={{ marginTop: 10, marginBottom: 0 }}>
          <b>Operar parada:</b>{' '}
          {v.paradas.map((p: any) => (
            <Link key={p.orden} className="btn sec" style={{ marginRight: 6, marginTop: 4 }} href={`/viajes/${id}/paradas/${p.orden}`}>
              {p.orden}. {p.nombre}
            </Link>
          ))}
        </p>
      </div>

      {/* Agregar bulto — solo Operador/Despachador mientras el manifiesto es borrador */}
      {gestiona && v.borrador && (
        <div className="card">
          <h2>Agregar paquete al manifiesto</h2>

          {bultosDisponibles.length > 0 ? (
            <div style={{ marginBottom: 14 }}>
              <label>
                <span>Paquetes en bodega listos para este viaje ({bultosDisponibles.length})</span>
                <select
                  onChange={e => {
                    const sel = bultosDisponibles.find(b => b.codigo_legible === e.target.value);
                    if (sel) {
                      const paradaSube = v.paradas.find((p: any) => p.agencia_id === sel.origen_agencia_id);
                      const paradaBaja = v.paradas.find((p: any) => p.agencia_id === sel.destino_agencia_id);
                      setF(prev => ({
                        ...prev,
                        codigo: sel.codigo_legible,
                        sube: paradaSube ? paradaSube.orden : prev.sube,
                        baja: paradaBaja ? paradaBaja.orden : prev.baja,
                      }));
                    }
                  }}
                  defaultValue=""
                >
                  <option value="">— Selecciona un paquete de la lista —</option>
                  {bultosDisponibles.map(b => (
                    <option key={b.id} value={b.codigo_legible}>
                      {fmtLegible(b.codigo_legible)} · {b.enc_codigo} #{b.numero} ({b.origen_nombre} ➔ {b.destino_nombre})
                    </option>
                  ))}
                </select>
              </label>
            </div>
          ) : (
            <p className="muted">No hay paquetes pendientes en bodega para agregar.</p>
          )}

          <div className="row">
            <label>Código del bulto
              <input value={f.codigo} onChange={e => setF({ ...f, codigo: e.target.value })} placeholder="XXXX-XXXX o escanear QR" />
            </label>
            <label>Sube en
              <select value={f.sube} onChange={e => setF({ ...f, sube: +e.target.value })}>
                {v.paradas.map((p: any) => <option key={p.orden} value={p.orden}>{p.orden}. {p.nombre}</option>)}
              </select>
            </label>
            <label>Baja en
              <select value={f.baja} onChange={e => setF({ ...f, baja: +e.target.value })}>
                {v.paradas.map((p: any) => <option key={p.orden} value={p.orden}>{p.orden}. {p.nombre}</option>)}
              </select>
            </label>
            <button
              onClick={() => act(async () => {
                await llamar(`/api/viajes/${id}/manifiesto/items`, 'POST', { codigo: f.codigo, subeOrden: f.sube, bajaOrden: f.baja });
                setF({ ...f, codigo: '' });
              }, 'Paquete agregado al manifiesto')}
              disabled={!f.codigo}
            >Agregar</button>
          </div>
          <p className="muted" style={{ marginTop: 8 }}>Si el paquete hace escala (ej. Quito → Zumba parando en Loja), el sistema creará automáticamente el redespacho al recibirlo en la parada intermedia.</p>
        </div>
      )}

      {/* Manifiesto */}
      <div className="card">
        <h2>Manifiesto · versión {v.version}</h2>
        <table>
          <thead><tr><th>Bulto</th><th>Encomienda</th><th>Destinatario</th><th>Sube</th><th>Baja</th><th>Estado</th><th></th></tr></thead>
          <tbody>
            {v.items.map((it: any) => (
              <tr key={it.bulto_id}>
                <td className="mono">{fmtLegible(it.codigo_legible)}</td>
                <td>{it.enc_codigo} #{it.numero}</td>
                <td>{it.dest_nombre}</td>
                <td>{nombreP(it.sube_orden)}</td>
                <td>{nombreP(it.baja_orden)}</td>
                <td><Estado e={it.estado} /></td>
                <td>{gestiona && v.borrador && (
                  <button className="sec" onClick={() => act(() => llamar(`/api/viajes/${id}/manifiesto/items?bultoId=${it.bulto_id}`, 'DELETE'), 'Paquete quitado')}>Quitar</button>
                )}</td>
              </tr>
            ))}
            {!v.items.length && <tr><td colSpan={7} className="muted">Sin paquetes en el manifiesto</td></tr>}
          </tbody>
        </table>

        {/* Resumen por parada */}
        <p className="muted" style={{ marginTop: 8 }}>
          {v.paradas.map((p: any) =>
            `${p.nombre}: ↑${v.items.filter((i: any) => rol(i, p.orden) === 'sube').length} sube · ↓${v.items.filter((i: any) => rol(i, p.orden) === 'baja').length} baja · →${v.items.filter((i: any) => rol(i, p.orden) === 'continua').length} continúa`
          ).join('   |   ')}
        </p>

        {/* Botón Cerrar manifiesto */}
        {gestiona && v.borrador && (
          <button className="verde" style={{ marginTop: 10 }}
            onClick={() => act(() => llamar(`/api/viajes/${id}/manifiesto/cerrar`, 'POST'), '✓ Manifiesto cerrado — los paquetes pasan a "pendiente de despacho"')}
            disabled={!v.items.length}
          >Cerrar manifiesto</button>
        )}

        {/* Modificar manifiesto después del cierre */}
        {gestiona && !v.borrador && v.version && (
          <div className="row" style={{ marginTop: 10 }}>
            <label>Motivo del cambio (obligatorio — invalida la autorización vigente)
              <input value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="Ej: paquete olvidado en bodega" />
            </label>
            <button className="rojo"
              onClick={() => act(() => llamar(`/api/viajes/${id}/manifiesto/modificar`, 'POST', { motivo }), 'Nueva versión abierta — la autorización vigente quedó invalidada')}
              disabled={!motivo.trim()}
            >Reabrir manifiesto</button>
          </div>
        )}
      </div>
    </div>
  );
}
