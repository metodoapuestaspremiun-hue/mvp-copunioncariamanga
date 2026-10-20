'use client';
import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { llamar, nuevoEventId, fmtLegible, fechaEC } from '@/lib/cliente';
import { Error_, Estado, ResultadoGrande, Scanner } from '@/components/ui';
import { useUsuario } from '@/components/Sesion';
import { puede } from '@/shared/permisos';

export default function Parada() {
  const { id, p } = useParams<{ id: string; p: string }>();
  const searchParams = useSearchParams();
  const u = useUsuario();
  const orden = Number(p);

  const [d, setD] = useState<any>(null);
  const [err, setErr] = useState<any>(null);
  const [ok, setOk] = useState('');
  const modoInicial = (searchParams.get('modo') === 'descarga') ? 'descarga' : 'carga';
  const [modo, setModo] = useState<'carga' | 'descarga'>(modoInicial);
  const [res, setRes] = useState<any>(null);
  const [hist, setHist] = useState<any[]>([]);
  const [conteo, setConteo] = useState(''); const [usuarios, setUsuarios] = useState<any[]>([]);
  const [exc, setExc] = useState({ motivo: '', solicitadoPor: '' }); const [ocupado, setOcupado] = useState(false);
  const cargar = useCallback(() => llamar(`/api/viajes/${id}/paradas/${p}`).then(setD).catch(setErr), [id, p]);
  useEffect(() => { cargar(); llamar('/api/usuarios').then(setUsuarios).catch(() => {}); }, [cargar]);
  const act = async (fn: () => Promise<any>, msg: string) => { setErr(null); setOk(''); try { await fn(); setOk(msg); } catch (e) { setErr(e); } await cargar(); };
  const escanear = async (codigo: string) => {
    setErr(null); setOcupado(true);
    try {
      const r: any = await llamar('/api/escaneos', 'POST', { eventId: nuevoEventId(), tipo: modo, viajeId: id, parada: orden, codigo, deviceId: navigator.userAgent.slice(0, 60) });
      setRes(r); setHist(h => [{ ...r, modo, t: new Date() }, ...h].slice(0, 12));
      if (typeof navigator.vibrate === 'function') navigator.vibrate(r.resultado === 'ok' ? 80 : [200, 80, 200]);
    } catch (e) { setErr(e); setRes(null); } finally { setOcupado(false); await cargar(); }
  };
  if (err && (err.codigo === 'SIN_MANIFIESTO' || (typeof err === 'string' && err.includes('SIN_MANIFIESTO')))) {
    return (
      <div>
        <h1>Parada {orden}</h1>
        <div className="card" style={{ textAlign: 'center', padding: '40px 20px' }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>📋</div>
          <h2 style={{ margin: '0 0 8px' }}>El manifiesto aún no está cerrado</h2>
          <p className="muted">El Operador de Ventanilla debe cerrar el manifiesto antes de que puedas operar esta parada.</p>
          <p className="muted">Una vez cerrado, aquí verás los paquetes que suben, bajan y continúan en el bus.</p>
          <Link href={'/viajes/' + id} className="btn sec" style={{ marginTop: 12, display: 'inline-block' }}>← Volver al viaje</Link>
        </div>
      </div>
    );
  }
  if (!d) return <div><Error_ e={err} />Cargando...</div>;
  const ev = d.evaluacion; const aut = d.autorizacion;
  const lista = (rol: string) => d.bultos.filter((b: any) => b.rol === rol);
  const Col = ({ titulo, rol }: { titulo: string; rol: string }) => (
    <div className="card"><h2>{titulo} ({lista(rol).length})</h2><table><tbody>{lista(rol).map((b: any) => <tr key={b.bultoId}><td className="mono">{fmtLegible(b.codigo)}</td><td>{b.encomienda} #{b.numero}</td><td><Estado e={b.estado} /></td></tr>)}</tbody></table></div>);
  const enParada = d.viaje.parada_actual === orden;
  const continuan = lista('continua').length;
  return (
    <div>
      <h1>📍 Parada {orden}: {d.parada.nombre} <span className="muted">· manifiesto v{d.version} · <Link href={'/viajes/' + id}>← volver al viaje</Link></span></h1>
      {!enParada && (
        <div className={orden < d.viaje.parada_actual ? 'err' : 'card'} style={orden >= d.viaje.parada_actual ? { background: '#1e3a5f', border: '1px solid #2563eb' } : {}}>
          {orden < d.viaje.parada_actual
            ? `⚠️ Esta parada ya salió. El bus está ahora en la parada ${d.viaje.parada_actual}.`
            : `⏳ El bus aún no llegó aquí. Está en la parada ${d.viaje.parada_actual}. Cuando llegue podrás escanear paquetes.`}
        </div>
      )}
      <Error_ e={err} />{ok && <div className="okmsg">{ok}</div>}
      <div className="grid">
        <Col titulo="⬇️ Bajan aquí" rol="baja" />
        <Col titulo="⬆️ Suben aquí" rol="sube" />
        <Col titulo="➡️ Continúan a bordo" rol="continua" />
      </div>

      {puede(u, 'escaneo:operar') && enParada && (
        <div id="escaneo" className="card" style={{ borderLeft: '4px solid #2563eb' }}>
          <h2>📷 {modo === 'carga' ? 'Subir Paquetes al Bus (Carga)' : 'Bajar Paquetes del Bus (Descarga)'}</h2>
          <div className="row" style={{ marginBottom: 12 }}>
            <label style={{ fontWeight: 700 }}>
              Operación a realizar:
              <select
                value={modo}
                onChange={e => setModo(e.target.value as any)}
                style={{ marginLeft: 8, padding: '6px 12px', fontSize: 13, fontWeight: 700 }}
              >
                <option value="carga">⬆️ Subir Paquetes (Carga a bordo)</option>
                <option value="descarga">⬇️ Bajar Paquetes (Descarga en parada)</option>
              </select>
            </label>
          </div>
          <Scanner onCode={escanear} ocupado={ocupado} />
          <ResultadoGrande r={res} />
          {hist.length > 0 && (
            <table style={{ marginTop: 12 }}>
              <tbody>
                {hist.map((h, i) => (
                  <tr key={i}>
                    <td className="mono">{fmtLegible(h.codigo ?? '')}</td>
                    <td><b>{h.modo === 'carga' ? '⬆️ Subido' : '⬇️ Bajado'}</b></td>
                    <td>{h.resultado}</td>
                    <td className="muted">{h.alerta}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {puede(u, 'conteo:continuan') && continuan > 0 && enParada && (
        <div className="card">
          <h2>Conteo de los que continúan a bordo</h2>
          <p className="muted">
            Cuenta visualmente los paquetes que siguen en el bus (el sistema espera {continuan}). Conteo registrado: <b>{d.conteo ?? 'ninguno'}</b>
          </p>
          <div className="row">
            <label>
              Cantidad contada
              <input type="number" min={0} value={conteo} onChange={e => setConteo(e.target.value)} />
            </label>
            <button
              onClick={() => act(() => llamar(`/api/viajes/${id}/paradas/${p}/conteo`, 'POST', { conteo: parseInt(conteo || '0') }), 'Conteo registrado')}
              disabled={conteo === ''}
            >
              Registrar conteo
            </button>
          </div>
        </div>
      )}

      <div id="salida" className="card" style={{ borderLeft: '4px solid #10b981' }}>
        <h2>🚀 Autorización de Partida y Salida del Bus</h2>
        {ev.normalPermitida ? (
          <div className="okmsg">✓ La carga concilia con el manifiesto. Se esperan {ev.esperadoABordo} paquete(s) a bordo al partir.</div>
        ) : (
          <div className="err">
            <b>Salida bloqueada</b>
            {ev.mensajes.map((m: string, i: number) => <div key={i}>• {m}</div>)}
          </div>
        )}
        {aut ? (
          <p style={{ marginTop: 10 }}>
            Autorización vigente ({aut.tipo}) {fechaEC(aut.autorizado_at)}{' '}
            {aut.salida_real_at ? <b>· SALIDA OFICIAL REGISTRADA {fechaEC(aut.salida_real_at)}</b> : ''}
          </p>
        ) : (
          <p className="muted" style={{ marginTop: 10 }}>Sin autorización vigente de salida.</p>
        )}
        {enParada && !aut && puede(u, 'salida:autorizar') && (
          <button
            className="verde"
            style={{ padding: '10px 18px', fontSize: 14, fontWeight: 700 }}
            disabled={!ev.normalPermitida}
            onClick={() => act(() => llamar(`/api/viajes/${id}/paradas/${p}/autorizar`, 'POST', { tipo: 'normal' }), 'Salida autorizada')}
          >
            ✓ Autorizar partida del bus
          </button>
        )}
        {enParada && !aut && !ev.normalPermitida && ev.excepcionPermitida === 'A' && puede(u, 'excepcion:autorizar') && (
          <div className="card" style={{ marginTop: 10 }}>
            <h2>Excepción A (supervisor)</h2>
            <div className="row">
              <label>
                Motivo (obligatorio)
                <input value={exc.motivo} onChange={e => setExc({ ...exc, motivo: e.target.value })} />
              </label>
              <label>
                Quién solicita la excepción (otra persona)
                <select value={exc.solicitadoPor} onChange={e => setExc({ ...exc, solicitadoPor: e.target.value })}>
                  <option value="">-- elegir --</option>
                  {usuarios.filter(x => x.id !== u.id).map(x => <option key={x.id} value={x.id}>{x.nombre}</option>)}
                </select>
              </label>
              <button
                className="rojo"
                disabled={!exc.motivo.trim() || !exc.solicitadoPor}
                onClick={() => act(() => llamar(`/api/viajes/${id}/paradas/${p}/autorizar`, 'POST', { tipo: 'excepcion_a', ...exc }), 'Excepción autorizada')}
              >
                Autorizar con excepción
              </button>
            </div>
          </div>
        )}
        {enParada && aut && !aut.salida_real_at && puede(u, 'salida:registrar_real') && (
          <button
            onClick={() => act(() => llamar(`/api/viajes/${id}/paradas/${p}/salida-real`, 'POST'), 'Salida real registrada: el bus partió')}
            style={{ padding: '10px 18px', fontSize: 14, fontWeight: 700 }}
          >
            Registrar partida real del bus
          </button>
        )}
      </div>

      <div className="card"><h2>Incidencias abiertas del viaje ({d.incidencias.length})</h2>
        <table><tbody>{d.incidencias.map((i: any) => <tr key={i.id}><td><span className="tag rojo">{i.tipo}</span></td><td className="mono">{fmtLegible(i.codigo_legible ?? '')}</td><td>{fechaEC(i.abierta_at)}</td>
          <td>{puede(u, 'incidencia:resolver') && <button className="sec" onClick={() => { const nota = prompt('Nota de resolucion (que se hizo):') ?? ''; act(() => llamar(`/api/incidencias/${i.id}/resolver`, 'POST', { nota }), 'Incidencia resuelta'); }}>Resolver</button>}</td></tr>)}</tbody></table>
        <p className="muted">Las incidencias de tipo sobrante / descarga incorrecta sin resolver bloquean la salida (no se pueden saltar con excepcion).</p></div>
    </div>);
}
