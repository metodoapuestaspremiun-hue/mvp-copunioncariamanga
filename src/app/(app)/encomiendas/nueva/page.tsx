'use client';
import { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import { llamar, dinero } from '@/lib/cliente';
import { Error_, Etiqueta } from '@/components/ui';
import { useUsuario } from '@/components/Sesion';

const vacio = () => ({ kg: '', l: '', a: '', h: '', fotoUrl: '' });

export default function Nueva() {
  const u = useUsuario();
  const [cat, setCat] = useState<any>(null);
  const [f, setF] = useState<any>({ origenId: '', destinoId: '', remitenteNombre: '', remitenteTel: '', destNombre: '', destTel: '', contenido: '', refExterna: '' });
  const [bultos, setBultos] = useState([vacio()]);
  const [cot, setCot] = useState<any>(null);
  const [manual, setManual] = useState({ valor: '', motivo: '' });
  const [err, setErr] = useState<any>(null);
  const [res, setRes] = useState<any>(null);
  const [ocupado, setOcupado] = useState(false);
  const [subiendoFoto, setSubiendoFoto] = useState<number | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [indiceBultoFoto, setIndiceBultoFoto] = useState<number>(0);

  useEffect(() => {
    llamar('/api/catalogos')
      .then((c: any) => {
        setCat(c);
        const agencias = c?.agencias || [];
        const mia = u?.roles?.find(r => r.agenciaId)?.agenciaId ?? agencias[0]?.id ?? '';
        const otra = agencias.find((a: any) => a.id !== mia)?.id ?? agencias[1]?.id ?? mia;
        setF((x: any) => ({ ...x, origenId: mia, destinoId: otra }));
      })
      .catch((err) => {
        console.error('Error cargando catálogos:', err);
        setErr(err);
      });
  }, [u]);

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
        manual: manual.valor ? { valorCent: Math.round(parseFloat(manual.valor) * 100), motivo: manual.motivo } : null,
      });
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
          <button className="sec" onClick={() => location.reload()}>
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
      <h1>Nueva encomienda</h1>
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
        <h2>Ruta</h2>
        <div className="row">
          <label>
            Agencia origen
            <select value={f.origenId} onChange={set('origenId')}>
              {cat.agencias.map((a: any) => (
                <option key={a.id} value={a.id}>
                  {a.nombre}
                </option>
              ))}
            </select>
          </label>
          <label>
            Agencia destino
            <select value={f.destinoId} onChange={set('destinoId')}>
              {cat.agencias.map((a: any) => (
                <option key={a.id} value={a.id}>
                  {a.nombre}
                </option>
              ))}
            </select>
          </label>
        </div>
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
        <table>
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
          onClick={guardar}
          disabled={ocupado || !f.remitenteNombre || !f.destNombre || bultos.some(b => !b.kg)}
        >
          {ocupado ? 'Registrando...' : 'Registrar encomienda e imprimir etiquetas con QR'}
        </button>
      </div>
    </div>
  );
}
