'use client';
import { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import { llamar, dinero } from '@/lib/cliente';
import { Error_, Etiqueta, BotonAtras } from '@/components/ui';
import { useUsuario } from '@/components/Sesion';

const vacio = () => ({ kg: '', l: '', a: '', h: '', fotoUrl: '' });

export default function Nueva() {
  const u = useUsuario();
  const [cat, setCat] = useState<any>(null);
  const [f, setF] = useState<any>({ origenId: '', destinoId: '', viajeId: '', remitenteNombre: '', remitenteTel: '', destNombre: '', destTel: '', contenido: '', refExterna: '' });
  const [bultos, setBultos] = useState([vacio()]);
  const [cot, setCot] = useState<any>(null);
  const [manual, setManual] = useState({ valor: '', motivo: '' });
  const [err, setErr] = useState<any>(null);
  const [res, setRes] = useState<any>(null);
  const [ocupado, setOcupado] = useState(false);
  const [subiendoFoto, setSubiendoFoto] = useState<number | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [indiceBultoFoto, setIndiceBultoFoto] = useState<number>(0);

  // Encontrar viajes válidos que cubran el tramo origen -> destino
  const viajesCompatibles = (cat?.viajes || []).filter((v: any) => {
    if (!f.origenId || !f.destinoId || f.origenId === f.destinoId) return true;
    const ruta = cat?.rutas?.find((r: any) => r.id === v.ruta_id);
    if (!ruta || !ruta.paradas) return true;
    const pOrigen = ruta.paradas.find((p: any) => p.agencia_id === f.origenId);
    const pDestino = ruta.paradas.find((p: any) => p.agencia_id === f.destinoId);
    // Para que el bus cubra el envío, debe pasar primero por el origen y después por el destino
    return pOrigen && pDestino && pOrigen.orden < pDestino.orden;
  });

  useEffect(() => {
    // Restaurar borrador de localStorage si existe
    try {
      const savedF = localStorage.getItem('encomienda_borrador_f');
      const savedBultos = localStorage.getItem('encomienda_borrador_bultos');
      const savedManual = localStorage.getItem('encomienda_borrador_manual');
      if (savedF) setF(JSON.parse(savedF));
      if (savedBultos) setBultos(JSON.parse(savedBultos));
      if (savedManual) setManual(JSON.parse(savedManual));
    } catch (e) {
      console.warn('Error leyendo localStorage', e);
    }
  }, []);

  // Guardar automáticamente en localStorage ante cualquier cambio
  useEffect(() => {
    try {
      localStorage.setItem('encomienda_borrador_f', JSON.stringify(f));
    } catch {}
  }, [f]);

  useEffect(() => {
    try {
      localStorage.setItem('encomienda_borrador_bultos', JSON.stringify(bultos));
    } catch {}
  }, [bultos]);

  useEffect(() => {
    try {
      localStorage.setItem('encomienda_borrador_manual', JSON.stringify(manual));
    } catch {}
  }, [manual]);

  const limpiarBorrador = () => {
    try {
      localStorage.removeItem('encomienda_borrador_f');
      localStorage.removeItem('encomienda_borrador_bultos');
      localStorage.removeItem('encomienda_borrador_manual');
    } catch {}
  };

  useEffect(() => {
    llamar('/api/catalogos')
      .then((c: any) => {
        setCat(c);
        const agencias = c?.agencias || [];
        const mia = u?.roles?.find(r => r.agenciaId)?.agenciaId ?? agencias[0]?.id ?? '';
        const otra = agencias.find((a: any) => a.id !== mia)?.id ?? agencias[1]?.id ?? mia;

        setF((prev: any) => {
          const origenFinal = prev.origenId || mia;
          const destinoFinal = prev.destinoId || otra;

          let viajeAuto = prev.viajeId || '';
          if (!viajeAuto && c?.rutas && c?.viajes) {
            const rutaCompat = c.rutas.find((r: any) => {
              const po = r.paradas?.find((p: any) => p.agencia_id === origenFinal);
              const pd = r.paradas?.find((p: any) => p.agencia_id === destinoFinal);
              return po && pd && po.orden < pd.orden;
            });
            if (rutaCompat) {
              const vComp = c.viajes.find((v: any) => v.ruta_id === rutaCompat.id);
              if (vComp) viajeAuto = vComp.id;
            }
          }

          return {
            ...prev,
            origenId: origenFinal,
            destinoId: destinoFinal,
            viajeId: viajeAuto,
          };
        });
      })
      .catch((err) => {
        console.error('Error cargando catálogos:', err);
        setErr(err);
      });
  }, [u]);

  // Manejo inteligente de cambio de origen o destino
  const cambiarRuta = (campo: 'origenId' | 'destinoId', valor: string) => {
    const nuevoOrigen = campo === 'origenId' ? valor : f.origenId;
    const nuevoDestino = campo === 'destinoId' ? valor : f.destinoId;

    // Buscar primer viaje compatible con el nuevo origen y destino
    let viajeAuto = '';
    if (cat?.rutas && cat?.viajes && nuevoOrigen && nuevoDestino && nuevoOrigen !== nuevoDestino) {
      const rutaCompat = cat.rutas.find((r: any) => {
        const po = r.paradas?.find((p: any) => p.agencia_id === nuevoOrigen);
        const pd = r.paradas?.find((p: any) => p.agencia_id === nuevoDestino);
        return po && pd && po.orden < pd.orden;
      });
      if (rutaCompat) {
        const vComp = cat.viajes.find((v: any) => v.ruta_id === rutaCompat.id);
        if (vComp) viajeAuto = vComp.id;
      }
    }

    setF((prev: any) => ({
      ...prev,
      [campo]: valor,
      viajeId: viajeAuto || prev.viajeId,
    }));
  };

  const cuerpo = () => ({
    origenId: f.origenId,
    destinoId: f.destinoId,
    bultos: bultos.map(b => ({
      pesoG: Math.round(parseFloat(b.kg || '0') * 1000),
      largoMm: b.l ? Math.round(parseFloat(b.l) * 10) : null,
      anchoMm: b.a ? Math.round(parseFloat(b.a) * 10) : null,
      altoMm: b.h ? Math.round(parseFloat(b.h) * 10) : null,
    })),
  });

  const calcular = async () => {
    setErr(null);
    try {
      setCot(await llamar('/api/cotizaciones/calcular', 'POST', cuerpo()));
    } catch (e) {
      setErr(e);
    }
  };

  const subirFoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setErr(null);
    setSubiendoFoto(indiceBultoFoto);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('prefijo', `bulto-${indiceBultoFoto + 1}`);

      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al subir imagen');

      setBultos(prev => prev.map((b, idx) => (idx === indiceBultoFoto ? { ...b, fotoUrl: data.url } : b)));
    } catch (error: any) {
      setErr(error);
    } finally {
      setSubiendoFoto(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const guardar = async () => {
    setErr(null);
    setOcupado(true);
    try {
      const fotosTexto = bultos
        .map((b, i) => (b.fotoUrl ? `Bulto #${i + 1}: ${b.fotoUrl}` : null))
        .filter(Boolean)
        .join(' | ');

      const refFinal = f.refExterna
        ? (fotosTexto ? `${f.refExterna} [Fotos: ${fotosTexto}]` : f.refExterna)
        : (fotosTexto ? `[Fotos: ${fotosTexto}]` : null);

      const r: any = await llamar('/api/encomiendas', 'POST', {
        ...cuerpo(),
        remitenteNombre: f.remitenteNombre,
        remitenteTel: f.remitenteTel || null,
        destNombre: f.destNombre,
        destTel: f.destTel || null,
        contenido: f.contenido || null,
        refExterna: refFinal,
        viajeId: f.viajeId || null,
        manual: manual.valor ? { valorCent: Math.round(parseFloat(manual.valor) * 100), motivo: manual.motivo } : null,
      });
      limpiarBorrador();
      setRes(r);
    } catch (e: any) {
      setErr(e);
      if (e.codigo === 'SIN_REGLA_TARIFA') setCot({ sinRegla: true, detalle: e.detalle });
    } finally {
      setOcupado(false);
    }
  };

  const set = (k: string) => (e: any) => setF({ ...f, [k]: e.target.value });
  const setB = (i: number, k: string) => (e: any) =>
    setBultos(bultos.map((b, j) => (j === i ? { ...b, [k]: e.target.value } : b)));

  const descartarBorrador = () => {
    limpiarBorrador();
    const agencias = cat?.agencias || [];
    const mia = u?.roles?.find(r => r.agenciaId)?.agenciaId ?? agencias[0]?.id ?? '';
    const otra = agencias.find((a: any) => a.id !== mia)?.id ?? agencias[1]?.id ?? mia;
    setF({ origenId: mia, destinoId: otra, viajeId: '', remitenteNombre: '', remitenteTel: '', destNombre: '', destTel: '', contenido: '', refExterna: '' });
    setBultos([vacio()]);
    setManual({ valor: '', motivo: '' });
    setCot(null);
  };

  if (!cat) return <div>Cargando...</div>;
  const destino = cat.agencias.find((a: any) => a.id === f.destinoId)?.nombre ?? '';

  if (res)
    return (
      <div>
        <h1>Encomienda registrada: {res.codigo}</h1>
        <div className="okmsg">
          Valor cotizado: <b>{dinero(res.valorCent)}</b> {res.sinRegla ? '(cotizacion manual)' : ''} ·{' '}
          {res.etiquetaTarifa ?? ''}. El sistema no registra cobros.
        </div>
        <p className="noprint">
          <button onClick={() => window.print()}>Imprimir etiquetas</button>{' '}
          <Link className="btn sec" href={'/encomiendas/' + res.id}>
            Ver encomienda
          </Link>{' '}
          <button className="sec" onClick={() => { limpiarBorrador(); location.reload(); }}>
            Registrar otra
          </button>
        </p>
        <div className="etiquetas imprimible">
          {res.bultos.map((b: any) => (
            <Etiqueta
              key={b.id}
              token={b.qrToken}
              legible={b.codigoLegible}
              destino={destino}
              numero={b.numero}
              total={res.bultos.length}
              encomienda={res.codigo}
            />
          ))}
        </div>
      </div>
    );

  return (
    <div>
      <BotonAtras href="/panel" label="Volver al Panel" />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginBottom: 12 }}>
        <h1 style={{ margin: 0 }}>Nueva encomienda</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: '12px', color: '#16a34a', display: 'flex', alignItems: 'center', gap: 4 }}>
            💾 Guardado automático en este navegador
          </span>
          <button type="button" className="sec" style={{ padding: '4px 10px', fontSize: '12px' }} onClick={descartarBorrador}>
            Limpiar formulario
          </button>
        </div>
      </div>
      <Error_ e={err} />

      {/* Input oculto para cámara o subir foto */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        style={{ display: 'none' }}
        onChange={subirFoto}
      />

      <div className="card">
        <h2>Ruta y Asignación de Viaje</h2>
        <div className="row">
          <label>
            Agencia origen
            <select value={f.origenId} onChange={e => cambiarRuta('origenId', e.target.value)}>
              {cat.agencias.map((a: any) => (
                <option key={a.id} value={a.id}>
                  {a.nombre}
                </option>
              ))}
            </select>
          </label>
          <label>
            Agencia destino
            <select value={f.destinoId} onChange={e => cambiarRuta('destinoId', e.target.value)}>
              {cat.agencias.map((a: any) => (
                <option key={a.id} value={a.id}>
                  {a.nombre}
                </option>
              ))}
            </select>
          </label>
          <label>
            🚌 Viaje / Turno asignado (Manifiesto automático)
            <select value={f.viajeId || ''} onChange={set('viajeId')}>
              <option value="">-- Sin viaje inmediato (queda en bodega) --</option>
              {viajesCompatibles.length > 0 ? (
                viajesCompatibles.map((v: any) => (
                  <option key={v.id} value={v.id}>
                    ⭐ {v.vehiculo} · {v.ruta_nombre} {v.conductor ? `(${v.conductor})` : ''}
                  </option>
                ))
              ) : (
                <option disabled>No hay viajes activos directos para este tramo</option>
              )}
            </select>
          </label>
        </div>
        <p className="muted" style={{ marginTop: 8, fontSize: '12.5px' }}>
          💡 <b>Filtro inteligente activo:</b> Se muestran y pre-seleccionan automáticamente solo los turnos de buses que cubren el trayecto desde el origen hacia el destino elegido.
        </p>
      </div>

      <div className="grid">
        <div className="card">
          <h2>Remitente</h2>
          <label>
            Nombre
            <input value={f.remitenteNombre} onChange={set('remitenteNombre')} placeholder="Nombre completo" />
          </label>
          <label style={{ marginTop: 8 }}>
            Teléfono
            <input value={f.remitenteTel} onChange={set('remitenteTel')} placeholder="0991234567" />
          </label>
        </div>
        <div className="card">
          <h2>Destinatario (recibe los avisos)</h2>
          <label>
            Nombre
            <input value={f.destNombre} onChange={set('destNombre')} placeholder="Nombre completo" />
          </label>
          <label style={{ marginTop: 8 }}>
            WhatsApp (recibirá código de retiro)
            <input value={f.destTel} onChange={set('destTel')} placeholder="0991234567" />
          </label>
        </div>
      </div>

      <div className="card">
        <h2>Bultos y Registro Fotográfico de Evidencia</h2>

        {/* Vista desktop: tabla compacta */}
        <div className="tabla-bultos-desktop">
          <div className="tabla-scroll">
            <table className="tabla-fija">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Peso (kg)</th>
                  <th>Largo (cm)</th>
                  <th>Ancho (cm)</th>
                  <th>Alto (cm)</th>
                  <th>Foto de Evidencia</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {bultos.map((b, i) => (
                  <tr key={i}>
                    <td>{i + 1}</td>
                    {['kg', 'l', 'a', 'h'].map(k => (
                      <td key={k}>
                        <input
                          style={{ width: 85 }}
                          type="number"
                          step="0.1"
                          min="0"
                          value={(b as any)[k]}
                          onChange={setB(i, k)}
                          placeholder={k === 'kg' ? 'Ej. 5' : '-'}
                        />
                      </td>
                    ))}
                    <td>
                      {b.fotoUrl ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <a href={b.fotoUrl} target="_blank" rel="noreferrer" title="Ver foto ampliada">
                            <img
                              src={b.fotoUrl}
                              alt="Evidencia"
                              style={{ width: 44, height: 44, objectFit: 'cover', borderRadius: 8, border: '1px solid #cbd5e1' }}
                            />
                          </a>
                          <button
                            type="button"
                            className="sec"
                            style={{ padding: '4px 10px', fontSize: 12 }}
                            onClick={() => {
                              setIndiceBultoFoto(i);
                              fileInputRef.current?.click();
                            }}
                          >
                            Cambiar
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          className="sec"
                          style={{ padding: '6px 12px', fontSize: 12.5 }}
                          disabled={subiendoFoto === i}
                          onClick={() => {
                            setIndiceBultoFoto(i);
                            fileInputRef.current?.click();
                          }}
                        >
                          {subiendoFoto === i ? 'Subiendo...' : '📸 Tomar / Subir Foto'}
                        </button>
                      )}
                    </td>
                    <td>
                      {bultos.length > 1 && (
                        <button type="button" className="sec" onClick={() => setBultos(bultos.filter((_, j) => j !== i))}>
                          Quitar
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Vista móvil: cards verticales por bulto */}
        <div className="tabla-bultos-card">
          {bultos.map((b, i) => (
            <div key={i} className="bulto-card-movil">
              <div className="bulto-num">
                <span>📦 Bulto #{i + 1}</span>
                {bultos.length > 1 && (
                  <button type="button" className="sec" style={{ padding: '3px 10px', fontSize: 12 }} onClick={() => setBultos(bultos.filter((_, j) => j !== i))}>
                    Quitar
                  </button>
                )}
              </div>
              <div className="bulto-inputs">
                {[{ k: 'kg', label: 'Peso (kg)', ph: 'Ej. 5' }, { k: 'l', label: 'Largo (cm)', ph: '-' }, { k: 'a', label: 'Ancho (cm)', ph: '-' }, { k: 'h', label: 'Alto (cm)', ph: '-' }].map(({ k, label, ph }) => (
                  <div key={k} className="bulto-campo">
                    <label>
                      {label}
                      <input
                        type="number"
                        step="0.1"
                        min="0"
                        value={(b as any)[k]}
                        onChange={setB(i, k)}
                        placeholder={ph}
                      />
                    </label>
                  </div>
                ))}
              </div>
              <div>
                {b.fotoUrl ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <a href={b.fotoUrl} target="_blank" rel="noreferrer">
                      <img src={b.fotoUrl} alt="Evidencia" style={{ width: 52, height: 52, objectFit: 'cover', borderRadius: 8, border: '1px solid #cbd5e1' }} />
                    </a>
                    <button
                      type="button"
                      className="sec"
                      style={{ fontSize: 12.5 }}
                      onClick={() => { setIndiceBultoFoto(i); fileInputRef.current?.click(); }}
                    >
                      Cambiar foto
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="sec"
                    disabled={subiendoFoto === i}
                    style={{ width: '100%', justifyContent: 'center' }}
                    onClick={() => { setIndiceBultoFoto(i); fileInputRef.current?.click(); }}
                  >
                    {subiendoFoto === i ? 'Subiendo...' : '📸 Tomar / Subir Foto de Evidencia'}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>

        <p style={{ marginTop: 12 }}>
          <button type="button" className="sec" onClick={() => setBultos([...bultos, vacio()])}>
            + Agregar bulto
          </button>
        </p>
        <div className="row" style={{ marginTop: 14 }}>
          <label>
            Contenido declarado
            <input value={f.contenido} onChange={set('contenido')} placeholder="Ej. Repuestos, ropa, documentos..." />
          </label>
          <label>
            Referencia interna o guía
            <input value={f.refExterna} onChange={set('refExterna')} placeholder="Ej. Guía papel #12345" />
          </label>
        </div>
      </div>

      <div className="card">
        <h2>Cotización</h2>
        <p className="muted">
          {cat.etiquetaTarifa ?? ''}. La tarifa sale de una tabla versionada; el sistema no registra cobros.
        </p>
        <button type="button" className="sec" onClick={calcular}>
          Calcular tarifa
        </button>
        {cot && !cot.sinRegla && (
          <p style={{ fontSize: 20, marginTop: 12 }}>
            Total: <b>{dinero(cot.valorCent)}</b>{' '}
            <span className="muted">(peso facturable {cot.pesoFactTotalG} g)</span>
          </p>
        )}
        {cot?.sinRegla && (
          <div style={{ marginTop: 12 }}>
            <div className="err">
              No hay regla de tarifa para este peso/ruta. Registra una cotización manual con motivo.
            </div>
            <div className="row">
              <label>
                Valor ($)
                <input
                  type="number"
                  step="0.01"
                  value={manual.valor}
                  onChange={e => setManual({ ...manual, valor: e.target.value })}
                />
              </label>
              <label>
                Motivo
                <input
                  value={manual.motivo}
                  onChange={e => setManual({ ...manual, motivo: e.target.value })}
                  placeholder="Justificación de tarifa especial"
                />
              </label>
            </div>
          </div>
        )}
      </div>

      <div style={{ marginTop: 20 }}>
        <button
          className="btn-accion-principal"
          onClick={guardar}
          disabled={ocupado || !f.remitenteNombre || !f.destNombre || bultos.some(b => !b.kg)}
        >
          {ocupado ? 'Registrando...' : '✅ Registrar encomienda e imprimir etiquetas con QR'}
        </button>
      </div>
    </div>
  );
}
