'use client';
import { useEffect, useState, useMemo, useRef } from 'react';
import Link from 'next/link';
import { llamar, fechaEC } from '@/lib/cliente';
import { Error_, Estado } from '@/components/ui';

/* ─── Tipos ─────────────────────────────────────────────── */
interface Encomienda {
  id: string;
  codigo: string;
  dest_nombre: string;
  remitente_nombre: string;
  origen: string;
  destino: string;
  creado_at: string;
  estado: string | null;
  bultos: number | null;
}

interface Grupo {
  viaje_id: string | null;
  viaje_vehiculo: string | null;
  viaje_conductor: string | null;
  viaje_estado: string | null;
  ruta_nombre: string | null;
  encomiendas: Encomienda[];
  total_bultos: number;
}

/* ─── Helpers ───────────────────────────────────────────── */
const estadoViajeBadge = (estado: string | null) => {
  if (!estado) return null;
  const colores: Record<string, string> = {
    en_ruta: '#059669', preparacion: '#d97706', cerrado: '#64748b',
  };
  const etiquetas: Record<string, string> = {
    en_ruta: 'En ruta', preparacion: 'Preparación', cerrado: 'Cerrado',
  };
  const color = colores[estado] ?? '#64748b';
  const label = etiquetas[estado] ?? estado;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '2px 9px', borderRadius: 999, fontSize: 11, fontWeight: 700,
      background: color + '18', color, border: `1px solid ${color}40`,
    }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: color, display: 'inline-block' }} />
      {label}
    </span>
  );
};

const labelViaje = (g: Grupo) => {
  if (!g.viaje_id) return 'Sin viaje asignado';
  const ruta = g.ruta_nombre ?? 'Ruta desconocida';
  const bus  = g.viaje_vehiculo ? ` · ${g.viaje_vehiculo}` : '';
  return `${ruta}${bus}`;
};

/* ─── Componente Principal ───────────────────────────────── */
export default function EncomiendasPorViaje() {
  const [grupos, setGrupos] = useState<Grupo[]>([]);
  const [cargando, setCargando] = useState(true);
  const [err, setErr] = useState<any>(null);
  const [q, setQ] = useState('');
  const [tabActiva, setTabActiva] = useState<string>('__todos__');
  const inputRef = useRef<HTMLInputElement>(null);

  /* ── Carga inicial ─────────────────────────────────────── */
  const cargar = (texto = q) => {
    setCargando(true);
    setErr(null);
    llamar(`/api/encomiendas?grouped=true&q=${encodeURIComponent(texto)}`)
      .then((data: Grupo[]) => {
        setGrupos(data);
        setCargando(false);
      })
      .catch((e) => { setErr(e); setCargando(false); });
  };

  useEffect(() => { cargar(''); }, []);

  /* ── Totales globales ─────────────────────────────────── */
  const totalEncs  = useMemo(() => grupos.reduce((s, g) => s + g.encomiendas.length, 0), [grupos]);
  const totalBultos = useMemo(() => grupos.reduce((s, g) => s + g.total_bultos, 0), [grupos]);

  /* ── Tabs dinámicos ───────────────────────────────────── */
  const tabs = useMemo(() => {
    const list: { id: string; label: string; encomiendas: number; bultos: number }[] = [
      { id: '__todos__', label: 'Todos', encomiendas: totalEncs, bultos: totalBultos },
    ];
    for (const g of grupos) {
      list.push({
        id: g.viaje_id ?? '__sin_viaje__',
        label: labelViaje(g),
        encomiendas: g.encomiendas.length,
        bultos: g.total_bultos,
      });
    }
    return list;
  }, [grupos, totalEncs, totalBultos]);

  /* ── Grupo activo ─────────────────────────────────────── */
  const grupoActivo: Encomienda[] = useMemo(() => {
    if (tabActiva === '__todos__') return grupos.flatMap(g => g.encomiendas);
    const key = tabActiva === '__sin_viaje__' ? null : tabActiva;
    return grupos.find(g => g.viaje_id === key)?.encomiendas ?? [];
  }, [grupos, tabActiva]);

  /* ── Viaje del tab activo ─────────────────────────────── */
  const grupoInfo: Grupo | null = useMemo(() => {
    if (tabActiva === '__todos__' || tabActiva === '__sin_viaje__') return null;
    return grupos.find(g => g.viaje_id === tabActiva) ?? null;
  }, [grupos, tabActiva]);

  /* ── Mapa encomienda_id → grupo (para columna Viaje en "Todos") ── */
  const encIdToGrupo = useMemo(() => {
    const m = new Map<string, Grupo>();
    for (const g of grupos) {
      for (const enc of g.encomiendas) {
        m.set(enc.id, g);
      }
    }
    return m;
  }, [grupos]);

  /* ── Buscador ─────────────────────────────────────────── */
  const manejarBusqueda = () => cargar(q);
  const manejarTecla    = (e: React.KeyboardEvent) => { if (e.key === 'Enter') manejarBusqueda(); };

  /* ── Si el tab activo desaparece al buscar, volver a todos ── */
  useEffect(() => {
    if (tabActiva !== '__todos__' && tabActiva !== '__sin_viaje__') {
      const existe = grupos.some(g => g.viaje_id === tabActiva);
      if (!existe) setTabActiva('__todos__');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grupos]);


  /* ─── Render ──────────────────────────────────────────── */
  return (
    <div style={{ width: '100%' }}>

      {/* Cabecera */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ margin: 0 }}>Encomiendas</h1>
          {!cargando && (
            <p style={{ margin: '4px 0 0', color: '#64748b', fontSize: 13 }}>
              {totalEncs} encomiendas · {totalBultos} paquetes · {grupos.length} {grupos.length === 1 ? 'viaje' : 'viajes'}
            </p>
          )}
        </div>
        <Link href="/encomiendas/nueva" className="btn" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}>
          + Nueva encomienda
        </Link>
      </div>

      <Error_ e={err} />

      {/* Buscador */}
      <div className="card" style={{ marginBottom: 16, padding: '14px 18px' }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 220, position: 'relative' }}>
            <span style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', fontSize: 15, pointerEvents: 'none' }}>🔍</span>
            <input
              ref={inputRef}
              value={q}
              onChange={e => setQ(e.target.value)}
              onKeyDown={manejarTecla}
              placeholder="Buscar por código, remitente o destinatario…"
              style={{ width: '100%', paddingLeft: 34, paddingRight: 12, paddingTop: 9, paddingBottom: 9, border: '1.5px solid #e2e8f0', borderRadius: 10, fontSize: 14, outline: 'none', fontFamily: 'inherit', transition: 'border-color 0.15s' }}
              onFocus={e => (e.target.style.borderColor = '#1d4ed8')}
              onBlur={e => (e.target.style.borderColor = '#e2e8f0')}
            />
          </div>
          <button onClick={manejarBusqueda} className="btn" style={{ whiteSpace: 'nowrap' }}>
            Buscar
          </button>
          {q && (
            <button
              className="btn sec"
              onClick={() => { setQ(''); cargar(''); }}
              style={{ whiteSpace: 'nowrap' }}
            >
              Limpiar
            </button>
          )}
        </div>
      </div>

      {/* Barra de Tabs */}
      <div className="dash-tabs-bar" style={{ marginBottom: 16 }}>
        {tabs.map(t => (
          <button
            key={t.id}
            type="button"
            className={`dash-tab-btn ${tabActiva === t.id ? 'activo' : ''}`}
            onClick={() => setTabActiva(t.id)}
          >
            <span style={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'inline-block' }}>
              {t.id === '__todos__'     ? '📦 Todos'
               : t.id === '__sin_viaje__' ? '🕐 Sin viaje'
               : `🚌 ${t.label}`}
            </span>
            <span className="dash-tab-count">
              {t.encomiendas}
            </span>
            {t.bultos > 0 && t.id !== '__todos__' && (
              <span style={{ padding: '2px 6px', borderRadius: 999, fontSize: 10, fontWeight: 600, background: tabActiva === t.id ? 'rgba(255,255,255,0.25)' : '#e2e8f0', color: tabActiva === t.id ? '#fff' : '#475569' }}>
                {t.bultos} pkg
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Banner de viaje activo (cuando no es "todos") */}
      {grupoInfo && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10,
          background: '#eff6ff', border: '1.5px solid #bfdbfe', borderRadius: 12, padding: '12px 18px', marginBottom: 14,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ fontSize: 26 }}>🚌</div>
            <div>
              <div style={{ fontWeight: 800, fontSize: 15, color: '#1e3a8a', marginBottom: 2 }}>
                {grupoInfo.ruta_nombre ?? 'Ruta desconocida'}
              </div>
              <div style={{ fontSize: 12.5, color: '#3b82f6', display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                {grupoInfo.viaje_vehiculo && <span>🚍 {grupoInfo.viaje_vehiculo}</span>}
                {grupoInfo.viaje_conductor && <span>👤 {grupoInfo.viaje_conductor}</span>}
                {estadoViajeBadge(grupoInfo.viaje_estado)}
              </div>
            </div>
          </div>
          <Link
            href={`/viajes/${grupoInfo.viaje_id}`}
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

      {/* Tabla de encomiendas */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {cargando ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#64748b' }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>⏳</div>
            Cargando encomiendas…
          </div>
        ) : grupoActivo.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>📭</div>
            <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 4 }}>
              {q ? 'Sin resultados para esa búsqueda' : 'No hay encomiendas en este viaje'}
            </div>
            {q && (
              <div style={{ fontSize: 13, marginTop: 4 }}>
                Prueba con otro código, remitente o destinatario
              </div>
            )}
          </div>
        ) : (
          <div className="tabla-scroll">
            <table className="tabla-fija" style={{ width: '100%' }}>
              <thead>
                <tr>
                  <th style={{ width: 120 }}>Código</th>
                  <th>Destinatario</th>
                  <th>Remitente</th>
                  <th>Ruta</th>
                  <th style={{ width: 70, textAlign: 'center' }}>Paquetes</th>
                  <th style={{ width: 110 }}>Estado</th>
                  <th style={{ width: 130 }}>Creada</th>
                  {tabActiva === '__todos__' && <th style={{ width: 100 }}>Viaje</th>}
                </tr>
              </thead>
              <tbody>
                {grupoActivo.map(e => {
                  const gEnc = tabActiva === '__todos__' ? encIdToGrupo.get(e.id) : null;
                  return (
                    <tr key={e.id}>
                      <td>
                        <Link
                          href={`/encomiendas/${e.id}`}
                          style={{ fontWeight: 700, fontFamily: 'monospace', fontSize: 13 }}
                        >
                          {e.codigo}
                        </Link>
                      </td>
                      <td style={{ fontWeight: 600 }}>{e.dest_nombre}</td>
                      <td style={{ color: '#64748b', fontSize: 13 }}>{e.remitente_nombre}</td>
                      <td style={{ fontSize: 13 }}>
                        <span style={{ color: '#475569' }}>{e.origen}</span>
                        <span style={{ margin: '0 5px', color: '#94a3b8' }}>→</span>
                        <span style={{ fontWeight: 600 }}>{e.destino}</span>
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <span style={{
                          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                          width: 28, height: 28, borderRadius: '50%',
                          background: '#f1f5f9', fontWeight: 700, fontSize: 13, color: '#334155',
                        }}>
                          {e.bultos ?? 0}
                        </span>
                      </td>
                      <td><Estado e={e.estado ?? 'en_proceso'} /></td>
                      <td style={{ fontSize: 12, color: '#64748b' }}>{fechaEC(e.creado_at)}</td>
                      {tabActiva === '__todos__' && (
                        <td>
                          {gEnc?.viaje_id ? (
                            <Link
                              href={`/viajes/${gEnc.viaje_id}`}
                              title={`Ver viaje: ${gEnc.ruta_nombre ?? ''}`}
                              style={{
                                display: 'inline-flex', alignItems: 'center', gap: 4,
                                padding: '3px 9px', borderRadius: 6, fontSize: 11.5, fontWeight: 700,
                                background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe',
                                textDecoration: 'none', transition: 'all 0.15s',
                              }}
                            >
                              🚌 Ver viaje
                            </Link>
                          ) : (
                            <span style={{ color: '#94a3b8', fontSize: 12 }}>—</span>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Footer con total */}
        {!cargando && grupoActivo.length > 0 && (
          <div style={{
            padding: '10px 18px', borderTop: '1px solid #f1f5f9',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            background: '#fafafa', fontSize: 12.5, color: '#64748b',
          }}>
            <span>
              {grupoActivo.length} encomienda{grupoActivo.length !== 1 ? 's' : ''}
              {' · '}
              {grupoActivo.reduce((s, e) => s + Number(e.bultos ?? 0), 0)} paquetes
            </span>
            {grupoInfo?.viaje_id && (
              <Link
                href={`/viajes/${grupoInfo.viaje_id}`}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontWeight: 700, color: '#1d4ed8', fontSize: 12.5 }}
              >
                Abrir viaje completo →
              </Link>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
