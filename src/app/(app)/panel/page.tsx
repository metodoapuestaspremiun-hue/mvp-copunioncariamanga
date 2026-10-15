'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { llamar, fechaEC } from '@/lib/cliente';
import { Error_, Estado } from '@/components/ui';
import { useUsuario } from '@/components/Sesion';
import { puede } from '@/shared/permisos';

export default function Panel() {
  const u = useUsuario();
  const router = useRouter();
  const [d, setD] = useState<any>(null);
  const [err, setErr] = useState<any>(null);
  const [cod, setCod] = useState('');
  const [tabActiva, setTabActiva] = useState<string>('todos');

  const cargar = () => llamar('/api/panel').then(setD).catch(setErr);
  useEffect(() => {
    cargar();
    const t = setInterval(cargar, 15000);
    return () => clearInterval(t);
  }, []);

  const buscar = async () => {
    setErr(null);
    try {
      const b: any = await llamar('/api/bultos?codigo=' + encodeURIComponent(cod));
      router.push('/bultos/' + b.id);
    } catch (e) {
      setErr(e);
    }
  };

  if (!d) return <div>{err ? <Error_ e={err} /> : 'Cargando...'}</div>;
  const sup = puede(u, 'incidencia:resolver') || puede(u, 'ver:todo');

  // Determinar tabs según permisos (sin emojis, estilo ejecutivo)
  const tabs = [
    { id: 'todos', label: 'Resumen General', count: null },
    ...(puede(u, 'encomienda:crear')
      ? [
          { id: 'porRecibir', label: 'Por Recibir', count: d.porRecibir.length },
          { id: 'disponibles', label: 'Listos para Retiro', count: d.disponibles.length },
        ]
      : []),
    { id: 'viajes', label: 'Viajes en Ruta', count: d.viajes.length },
    ...((puede(u, 'encomienda:crear') || puede(u, 'ver:todo'))
      ? [{ id: 'redespachos', label: 'Redespachos', count: d.redespachos.length }]
      : []),
    { id: 'incidencias', label: 'Incidencias', count: d.incidencias.length },
    ...(sup ? [{ id: 'auditoria', label: 'Auditoría', count: (d.excepciones?.length || 0) + (d.modificaciones?.length || 0) }] : []),
  ];

  return (
    <div style={{ width: '100%', maxWidth: '100%', margin: '0' }}>
      {/* CABECERA SUPERIOR: TÍTULO Y BÚSQUEDA RÁPIDA */}
      <div className="dash-header-wrap">
        <div className="dash-title-row">
          <h1>
            <span>
              {puede(u, 'encomienda:crear') ? 'Panel Operativo de Ventanilla' :
               puede(u, 'escaneo:operar') ? 'Panel de Control de Bus y Manifiestos' :
               puede(u, 'salida:autorizar') ? 'Panel de Control de Salidas' :
               'Panel Operativo General'}
            </span>
          </h1>

          <div className="dash-search-box noprint">
            <span style={{ fontSize: '14px', color: '#64748b', fontWeight: 700 }}>BUSCAR:</span>
            <input
              value={cod}
              onChange={e => setCod(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && buscar()}
              placeholder="Código paquete (XXXX-XXXX) o QR..."
            />
            <button
              type="button"
              onClick={buscar}
              style={{ padding: '6px 14px', fontSize: '13px', borderRadius: '10px' }}
            >
              Rastrear
            </button>
          </div>
        </div>
      </div>

      <Error_ e={err} />

      {/* SECCIÓN 1: ACCESO RÁPIDO / METRIC CARDS */}
      <div className="dash-section-title">
        <span>Estado Operativo en Tiempo Real</span>
      </div>

      <div className="dash-quick-grid">
        {puede(u, 'encomienda:crear') && (
          <>
            <div
              className={`dash-quick-card ${tabActiva === 'porRecibir' ? 'azul-activo' : ''}`}
              onClick={() => setTabActiva('porRecibir')}
              title="Click para ver paquetes por recibir en bodega"
            >
              <div className="dash-card-top">
                <span className="dash-card-sigla">REC</span>
                <span className={`dash-card-badge ${d.porRecibir.length > 0 ? 'alerta' : ''}`}>
                  {d.porRecibir.length > 0 ? 'Pendiente' : 'Al día'}
                </span>
              </div>
              <div>
                <div className="dash-card-num">{d.porRecibir.length}</div>
                <div className="dash-card-label">Por recibir en agencia</div>
              </div>
            </div>

            <div
              className={`dash-quick-card ${tabActiva === 'disponibles' ? 'azul-activo' : ''}`}
              onClick={() => setTabActiva('disponibles')}
              title="Click para ver paquetes listos para entrega al cliente"
            >
              <div className="dash-card-top">
                <span className="dash-card-sigla">ENT</span>
                <span className="dash-card-badge">En bodega</span>
              </div>
              <div>
                <div className="dash-card-num">{d.disponibles.length}</div>
                <div className="dash-card-label">Listos para retiro</div>
              </div>
            </div>
          </>
        )}

        <div
          className={`dash-quick-card ${tabActiva === 'viajes' ? 'azul-activo' : ''}`}
          onClick={() => setTabActiva('viajes')}
          title="Click para ver viajes y buses en ruta"
        >
          <div className="dash-card-top">
            <span className="dash-card-sigla">BUS</span>
            <span className="dash-card-badge">En ruta</span>
          </div>
          <div>
            <div className="dash-card-num">{d.viajes.length}</div>
            <div className="dash-card-label">Viajes activos hoy</div>
          </div>
        </div>

        {(puede(u, 'encomienda:crear') || puede(u, 'ver:todo')) && (
          <div
            className={`dash-quick-card ${tabActiva === 'redespachos' ? 'azul-activo' : ''}`}
            onClick={() => setTabActiva('redespachos')}
            title="Click para ver redespachos y conexiones intermedias"
          >
            <div className="dash-card-top">
              <span className="dash-card-sigla">RED</span>
              <span className={`dash-card-badge ${d.redespachos.some((r: any) => r.vencido) ? 'urgente' : ''}`}>
                {d.redespachos.some((r: any) => r.vencido) ? 'Vencidos' : 'Tránsito'}
              </span>
            </div>
            <div>
              <div className="dash-card-num">{d.redespachos.length}</div>
              <div className="dash-card-label">Redespachos pendientes</div>
            </div>
          </div>
        )}

        <div
          className={`dash-quick-card ${tabActiva === 'incidencias' ? 'azul-activo' : ''}`}
          onClick={() => setTabActiva('incidencias')}
          title="Click para revisar incidencias o reportes"
        >
          <div className="dash-card-top">
            <span className="dash-card-sigla" style={{ color: '#dc2626' }}>INC</span>
            <span className={`dash-card-badge ${d.incidencias.length > 0 ? 'urgente' : ''}`}>
              {d.incidencias.length > 0 ? 'Atención' : 'Sin alertas'}
            </span>
          </div>
          <div>
            <div className="dash-card-num">{d.incidencias.length}</div>
            <div className="dash-card-label">Incidencias abiertas</div>
          </div>
        </div>

        {puede(u, 'ver:todo') && (
          <div
            className="dash-quick-card"
            style={{ background: '#f8fafc' }}
            title="Paquetes registrados esperando bus de origen"
          >
            <div className="dash-card-top">
              <span className="dash-card-sigla">BOD</span>
              <span className="dash-card-badge">Sin bus</span>
            </div>
            <div>
              <div className="dash-card-num">{d.sinViaje}</div>
              <div className="dash-card-label">Paquetes en bodega origen</div>
            </div>
          </div>
        )}
      </div>

      {/* SECCIÓN 2: SELECTOR DE PESTAÑAS (TABS) */}
      <div className="dash-section-title">
        <span>Módulos de Gestión</span>
      </div>

      <div className="dash-tabs-bar noprint">
        {tabs.map(t => (
          <button
            key={t.id}
            type="button"
            className={`dash-tab-btn ${tabActiva === t.id ? 'activo' : ''}`}
            onClick={() => setTabActiva(t.id)}
          >
            <span>{t.label}</span>
            {t.count !== null && <span className="dash-tab-count">{t.count}</span>}
          </button>
        ))}
      </div>

      {/* SECCIÓN 3: CONTENIDO DE LAS PESTAÑAS */}

      {/* TAB: TODOS (PANORÁMICA COMPLETA DE UNA SOLA PANTALLA) */}
      {tabActiva === 'todos' && (
        <div className="dash-overview-grid">
          {/* 1. POR RECIBIR */}
          {puede(u, 'encomienda:crear') && (
            <div className="dash-compact-card">
              <div>
                <div className="dash-compact-header">
                  <h2>Por recibir ({d.porRecibir.length})</h2>
                  <button type="button" className="dash-compact-link" onClick={() => setTabActiva('porRecibir')}>
                    Ver todos →
                  </button>
                </div>
                <table className="dash-compact-table">
                  <tbody>
                    {d.porRecibir.slice(0, 4).map((b: any) => (
                      <tr key={b.id}>
                        <td className="mono" style={{ fontWeight: 700, color: '#1e3a8a' }}>{b.codigo_legible}</td>
                        <td style={{ color: '#475569' }}>{b.enc_codigo}</td>
                        <td style={{ textAlign: 'right', color: '#64748b' }}>{b.agencia}</td>
                      </tr>
                    ))}
                    {!d.porRecibir.length && (
                      <tr><td colSpan={3} className="muted" style={{ padding: '20px 0', textAlign: 'center' }}>Sin paquetes pendientes de recepción</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
              <div className="dash-compact-footer">
                <span>Total en tránsito: {d.porRecibir.length}</span>
                <Link href="/recepcion" style={{ color: '#1d4ed8', fontWeight: 600 }}>Recepción ➔</Link>
              </div>
            </div>
          )}

          {/* 2. DISPONIBLES / LISTOS PARA RETIRO */}
          {puede(u, 'encomienda:crear') && (
            <div className="dash-compact-card">
              <div>
                <div className="dash-compact-header">
                  <h2>Listos para retiro ({d.disponibles.length})</h2>
                  <button type="button" className="dash-compact-link" onClick={() => setTabActiva('disponibles')}>
                    Ver todos →
                  </button>
                </div>
                <table className="dash-compact-table">
                  <tbody>
                    {d.disponibles.slice(0, 4).map((e: any) => (
                      <tr key={e.id}>
                        <td><Link href={'/encomiendas/' + e.id} style={{ fontWeight: 700 }}>{e.codigo}</Link></td>
                        <td style={{ maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.dest_nombre}</td>
                        <td style={{ textAlign: 'right' }}><Estado e={e.estado} /></td>
                      </tr>
                    ))}
                    {!d.disponibles.length && (
                      <tr><td colSpan={3} className="muted" style={{ padding: '20px 0', textAlign: 'center' }}>No hay paquetes listos para entregar</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
              <div className="dash-compact-footer">
                <span>En bodega destino: {d.disponibles.length}</span>
                <Link href="/entrega" style={{ color: '#059669', fontWeight: 600 }}>Entregar ➔</Link>
              </div>
            </div>
          )}

          {/* 3. VIAJES Y UNIDADES */}
          <div className="dash-compact-card">
            <div>
              <div className="dash-compact-header">
                <h2>Viajes activos ({d.viajes.length})</h2>
                <button type="button" className="dash-compact-link" onClick={() => setTabActiva('viajes')}>
                  Ver todos →
                </button>
              </div>
              <table className="dash-compact-table">
                <tbody>
                  {d.viajes.slice(0, 4).map((v: any) => (
                    <tr key={v.id}>
                      <td><Link href={'/viajes/' + v.id} style={{ fontWeight: 700 }}>{v.vehiculo}</Link></td>
                      <td style={{ fontSize: '11.5px', color: '#475569' }}>{v.ruta}</td>
                      <td style={{ textAlign: 'right' }}>
                        <span className={`tag ${v.estado === 'en_ruta' ? 'verde' : ''}`} style={{ fontSize: '10.5px', padding: '1px 6px' }}>
                          {v.estado}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {!d.viajes.length && (
                    <tr><td colSpan={3} className="muted" style={{ padding: '20px 0', textAlign: 'center' }}>No hay turnos activos en ruta</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="dash-compact-footer">
              <span>Unidades en monitoreo: {d.viajes.length}</span>
              <Link href="/viajes" style={{ color: '#1d4ed8', fontWeight: 600 }}>Ver Viajes ➔</Link>
            </div>
          </div>

          {/* 4. REDESPACHOS */}
          {(puede(u, 'encomienda:crear') || puede(u, 'ver:todo')) && (
            <div className="dash-compact-card">
              <div>
                <div className="dash-compact-header">
                  <h2>Redespachos ({d.redespachos.length})</h2>
                  <button type="button" className="dash-compact-link" onClick={() => setTabActiva('redespachos')}>
                    Ver todos →
                  </button>
                </div>
                <table className="dash-compact-table">
                  <tbody>
                    {d.redespachos.slice(0, 4).map((r: any) => (
                      <tr key={r.id}>
                        <td className="mono" style={{ fontWeight: 700 }}>{r.codigo_legible}</td>
                        <td style={{ fontSize: '11.5px' }}>{r.agencia} → {r.destino}</td>
                        <td style={{ textAlign: 'right' }}>
                          {r.vencido ? <span className="tag rojo" style={{ fontSize: '10px' }}>Vencido</span> : <span className="tag" style={{ fontSize: '10px' }}>Al día</span>}
                        </td>
                      </tr>
                    ))}
                    {!d.redespachos.length && (
                      <tr><td colSpan={3} className="muted" style={{ padding: '20px 0', textAlign: 'center' }}>No hay paquetes con redespacho</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
              <div className="dash-compact-footer">
                <span>Por reasignar bus: {d.redespachos.length}</span>
                <Link href="/redespachos" style={{ color: '#1d4ed8', fontWeight: 600 }}>Módulo ➔</Link>
              </div>
            </div>
          )}

          {/* 5. INCIDENCIAS */}
          <div className="dash-compact-card">
            <div>
              <div className="dash-compact-header">
                <h2>Incidencias ({d.incidencias.length})</h2>
                <button type="button" className="dash-compact-link" onClick={() => setTabActiva('incidencias')}>
                  Ver todos →
                </button>
              </div>
              <table className="dash-compact-table">
                <tbody>
                  {d.incidencias.slice(0, 4).map((i: any) => (
                    <tr key={i.id}>
                      <td><span className="tag rojo" style={{ fontSize: '10.5px', padding: '1px 6px' }}>{i.tipo}</span></td>
                      <td className="mono" style={{ fontSize: '11.5px' }}>{i.codigo_legible || 'N/A'}</td>
                      <td style={{ textAlign: 'right', fontSize: '11px', color: '#64748b' }}>{fechaEC(i.abierta_at)}</td>
                    </tr>
                  ))}
                  {!d.incidencias.length && (
                    <tr><td colSpan={3} style={{ color: '#059669', padding: '20px 0', textAlign: 'center' }}>Cero incidencias reportadas</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="dash-compact-footer">
              <span>Novedades abiertas: {d.incidencias.length}</span>
              <Link href="/incidencias" style={{ color: '#dc2626', fontWeight: 600 }}>Gestionar ➔</Link>
            </div>
          </div>

          {/* 6. DISTRIBUCIÓN DE PAQUETES / ESTADO GENERAL */}
          <div className="dash-compact-card">
            <div>
              <div className="dash-compact-header">
                <h2>Paquetes del Sistema</h2>
                <span className="tag" style={{ fontSize: '11px' }}>Global</span>
              </div>
              <table className="dash-compact-table">
                <tbody>
                  {(d.porEstado || []).slice(0, 4).map((e: any) => (
                    <tr key={e.estado}>
                      <td><Estado e={e.estado} /></td>
                      <td style={{ textAlign: 'right', fontWeight: 800, color: '#0f172a' }}>{e.n}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="dash-compact-footer">
              <span>En custodia origen (sin bus):</span>
              <b>{d.sinViaje}</b>
            </div>
          </div>
        </div>
      )}

      {/* TAB: POR RECIBIR */}
      {tabActiva === 'porRecibir' && (
        <div className="dash-tab-panel">
          <div className="dash-panel-header">
            <h2>Paquetes descargados por recibir en bodega ({d.porRecibir.length})</h2>
            <Link href="/recepcion" className="btn">Escanear Recepción ➔</Link>
          </div>
          <div className="tabla-scroll">
            <table className="tabla-fija">
              <thead><tr><th>Código Paquete</th><th>Encomienda</th><th>Agencia Custodia Actual</th><th>Acción</th></tr></thead>
              <tbody>
                {d.porRecibir.map((b: any) => (
                  <tr key={b.id}>
                    <td className="mono" style={{ fontSize: '15px' }}><b>{b.codigo_legible}</b></td>
                    <td>{b.enc_codigo}</td>
                    <td>{b.agencia}</td>
                    <td>
                      <Link href="/recepcion" className="btn sec" style={{ padding: '3px 10px', fontSize: '12px' }}>
                        Recibir
                      </Link>
                    </td>
                  </tr>
                ))}
                {!d.porRecibir.length && (
                  <tr>
                    <td colSpan={4} style={{ textAlign: 'center', padding: '32px 16px', color: '#64748b' }}>
                      No hay paquetes pendientes de recepción en tu bodega.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB: LISTOS PARA ENTREGA */}
      {tabActiva === 'disponibles' && (
        <div className="dash-tab-panel">
          <div className="dash-panel-header">
            <h2>Paquetes disponibles para entrega o retiro ({d.disponibles.length})</h2>
            <Link href="/entrega" className="btn verde">Registrar Entrega ➔</Link>
          </div>
          <div className="tabla-scroll">
            <table className="tabla-fija">
              <thead><tr><th>Código Encomienda</th><th>Destinatario</th><th>Agencia Retiro</th><th>Estado</th><th>Detalle</th></tr></thead>
              <tbody>
                {d.disponibles.map((e: any) => (
                  <tr key={e.id}>
                    <td style={{ fontSize: '14.5px' }}><Link href={'/encomiendas/' + e.id}><b>{e.codigo}</b></Link></td>
                    <td><b>{e.dest_nombre}</b></td>
                    <td>{e.destino}</td>
                    <td><Estado e={e.estado} /></td>
                    <td>
                      <Link href={'/encomiendas/' + e.id} className="btn sec" style={{ padding: '3px 10px', fontSize: '12px' }}>
                        Ver Guía
                      </Link>
                    </td>
                  </tr>
                ))}
                {!d.disponibles.length && (
                  <tr>
                    <td colSpan={5} style={{ textAlign: 'center', padding: '32px 16px', color: '#64748b' }}>
                      No hay encomiendas listas para entrega en este momento.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB: VIAJES ACTIVOS */}
      {tabActiva === 'viajes' && (
        <div className="dash-tab-panel">
          <div className="dash-panel-header">
            <h2>Turnos y Viajes en Tránsito ({d.viajes.length})</h2>
            <Link href="/viajes" className="btn">Ver todos los viajes ➔</Link>
          </div>
          <div className="tabla-scroll">
            <table className="tabla-fija">
              <thead><tr><th>Unidad / Bus</th><th>Ruta Asignada</th><th>Estado</th><th>Parada Actual</th><th>Acción</th></tr></thead>
              <tbody>
                {d.viajes.map((v: any) => (
                  <tr key={v.id}>
                    <td style={{ fontSize: '15px' }}><Link href={'/viajes/' + v.id}><b>{v.vehiculo}</b></Link></td>
                    <td><b>{v.ruta}</b></td>
                    <td><span className={`tag ${v.estado === 'en_ruta' ? 'verde' : ''}`}>{v.estado}</span></td>
                    <td>Parada #{v.parada_actual}</td>
                    <td>
                      <Link href={'/viajes/' + v.id} className="btn sec" style={{ padding: '3px 10px', fontSize: '12px' }}>
                        Manifiesto
                      </Link>
                    </td>
                  </tr>
                ))}
                {!d.viajes.length && (
                  <tr>
                    <td colSpan={5} style={{ textAlign: 'center', padding: '32px 16px', color: '#64748b' }}>
                      No hay viajes activos programados actualmente.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB: REDESPACHOS */}
      {tabActiva === 'redespachos' && (
        <div className="dash-tab-panel">
          <div className="dash-panel-header">
            <h2>Redespachos Intermedios ({d.redespachos.length})</h2>
            <Link href="/redespachos" className="btn">Ir a Redespachos ➔</Link>
          </div>
          <div className="tabla-scroll">
            <table className="tabla-fija">
              <thead><tr><th>Paquete</th><th>Encomienda</th><th>Agencia Custodia</th><th>Destino Final</th><th>Plazo Límite</th></tr></thead>
              <tbody>
                {d.redespachos.map((r: any) => (
                  <tr key={r.id}>
                    <td className="mono" style={{ fontSize: '14.5px' }}><b>{r.codigo_legible}</b></td>
                    <td>{r.enc_codigo}</td>
                    <td>{r.agencia}</td>
                    <td><b>{r.destino}</b></td>
                    <td>{r.vencido ? <span className="tag rojo">VENCIDO</span> : <span className="tag">vence {fechaEC(r.due_at)}</span>}</td>
                  </tr>
                ))}
                {!d.redespachos.length && (
                  <tr>
                    <td colSpan={5} style={{ textAlign: 'center', padding: '32px 16px', color: '#64748b' }}>
                      No hay paquetes con redespachos pendientes.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB: INCIDENCIAS */}
      {tabActiva === 'incidencias' && (
        <div className="dash-tab-panel">
          <div className="dash-panel-header">
            <h2>Reportes de Incidencias Activas ({d.incidencias.length})</h2>
            <Link href="/incidencias" className="btn rojo">Gestionar Incidencias ➔</Link>
          </div>
          <div className="tabla-scroll">
            <table className="tabla-fija">
              <thead><tr><th>Tipo de Novedad</th><th>Código de Paquete</th><th>Fecha de Reporte</th><th>Estado</th></tr></thead>
              <tbody>
                {d.incidencias.map((i: any) => (
                  <tr key={i.id}>
                    <td><span className="tag rojo"><b>{i.tipo}</b></span></td>
                    <td className="mono" style={{ fontSize: '14.5px' }}><b>{i.codigo_legible || 'Sin código'}</b></td>
                    <td>{fechaEC(i.abierta_at)}</td>
                    <td><span className="tag amarillo">Pendiente resolución</span></td>
                  </tr>
                ))}
                {!d.incidencias.length && (
                  <tr>
                    <td colSpan={4} style={{ textAlign: 'center', padding: '32px 16px', color: '#059669' }}>
                      No hay incidencias abiertas. Toda la operación está funcionando con normalidad.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB: AUDITORÍA (SUPERVISORES Y GERENCIA) */}
      {tabActiva === 'auditoria' && sup && (
        <div className="dash-tab-panel">
          <div className="dash-panel-header">
            <h2>Auditoría de Operaciones y Excepciones</h2>
            {puede(u, 'export:csv') && (
              <a className="btn sec" href="/api/export/eventos">
                Descargar CSV Completo
              </a>
            )}
          </div>

          <h3 style={{ fontSize: '15px', color: '#0f172a', marginTop: 14 }}>Excepciones de salida autorizadas</h3>
          <div className="tabla-scroll" style={{ marginBottom: 20 }}>
            <table className="tabla-fija">
              <thead><tr><th>Fecha</th><th>Autorizado Por</th><th>Motivo</th></tr></thead>
              <tbody>
                {d.excepciones?.map((x: any) => (
                  <tr key={x.id}>
                    <td>{fechaEC(x.autorizado_at)}</td>
                    <td><b>{x.autorizado_por}</b></td>
                    <td>{x.motivo}</td>
                  </tr>
                ))}
                {!d.excepciones?.length && <tr><td colSpan={3} className="muted">Sin excepciones registradas</td></tr>}
              </tbody>
            </table>
          </div>

          <h3 style={{ fontSize: '15px', color: '#0f172a' }}>Modificaciones de manifiesto</h3>
          <div className="tabla-scroll">
            <table className="tabla-fija">
              <thead><tr><th>Fecha</th><th>Usuario</th><th>Motivo Declarado</th></tr></thead>
              <tbody>
                {d.modificaciones?.map((m: any, i: number) => {
                  let p: any = {};
                  try { p = typeof m.payload === 'string' ? JSON.parse(m.payload) : m.payload; } catch {}
                  return (
                    <tr key={i}>
                      <td>{fechaEC(m.recibido_servidor)}</td>
                      <td><b>{m.nombre}</b></td>
                      <td>{p?.motivo || 'Sin motivo'}</td>
                    </tr>
                  );
                })}
                {!d.modificaciones?.length && <tr><td colSpan={3} className="muted">Sin modificaciones registradas</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
