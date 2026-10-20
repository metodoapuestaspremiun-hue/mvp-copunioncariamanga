'use client';
import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { fmtLegible, ETIQUETA_ESTADO } from '@/lib/cliente';

export function Error_({ e }: { e: any }) {
  if (!e) return null;
  const extra = e.detalle?.mensajes ? '\n- ' + e.detalle.mensajes.join('\n- ') : '';
  return <div className="err">{e.message}{extra}</div>;
}
export function BotonAtras({ href, label = 'Volver' }: { href?: string; label?: string }) {
  const router = typeof window !== 'undefined' ? require('next/navigation').useRouter?.() : null;
  return (
    <button
      type="button"
      className="btn-volver-atras"
      onClick={() => {
        if (href) {
          window.location.href = href;
        } else if (typeof window !== 'undefined' && window.history.length > 1) {
          window.history.back();
        } else {
          window.location.href = '/panel';
        }
      }}
      title="Volver a la pantalla anterior"
    >
      <span className="btn-volver-icono">←</span>
      <span className="btn-volver-texto">{label}</span>
    </button>
  );
}

export const Estado = ({ e }: { e: string }) => {
  const c = ['entregado', 'entregada', 'disponible_retiro'].includes(e) ? 'verde' : ['anulado', 'retenido', 'devuelto'].includes(e) ? 'rojo' : ['pendiente_redespacho', 'parcialmente_disponible'].includes(e) ? 'amarillo' : '';
  return <span className={`tag ${c}`}>{ETIQUETA_ESTADO[e] ?? e}</span>;
};

/** Resultado grande de color de un escaneo. */
export function ResultadoGrande({ r }: { r: any }) {
  if (!r) return null;
  const mapa: Record<string, [string, string]> = {
    ok: ['verde', 'CORRECTO'], repetido: ['amarillo', 'YA ESCANEADO (no suma)'], ya_a_bordo: ['amarillo', 'CONTINUA A BORDO'],
    no_esperado: ['rojo', 'NO CORRESPONDE'], conflicto_asignacion: ['rojo', 'CONFLICTO'], bloqueado: ['rojo', 'BLOQUEADO'],
    descarga_incorrecta: ['rojo', 'NO VIENE EN ESTE VIAJE'], debia_continuar: ['rojo', 'NO LO BAJE: CONTINUA'], desconocido: ['rojo', 'CODIGO DESCONOCIDO'],
  };
  const [color, texto] = mapa[r.resultado] ?? ['amarillo', String(r.resultado).toUpperCase()];
  return (
    <div className={`resultado ${color}`}>
      <div className="g">{texto}</div>
      {r.codigo && <div className="p mono">{fmtLegible(r.codigo)} {r.encomienda ? `· ${r.encomienda} #${r.numero ?? ''}` : ''}</div>}
      {r.alerta && <div className="p">{r.alerta}</div>}
      {r.incidencia && <div className="p">Incidencia abierta: {r.incidencia}</div>}
    </div>
  );
}

/** Escaner: campo de texto (lector Bluetooth o escribir) + camara con BarcodeDetector si el navegador la soporta. */
export function Scanner({ onCode, ocupado }: { onCode: (codigo: string) => void; ocupado?: boolean }) {
  const [txt, setTxt] = useState(''); const [cam, setCam] = useState(false); const [msg, setMsg] = useState('');
  const video = useRef<HTMLVideoElement>(null); const ultimo = useRef({ c: '', t: 0 }); const cb = useRef(onCode); cb.current = onCode;
  useEffect(() => {
    if (!cam) return;
    let stop = false; let stream: MediaStream | null = null;
    (async () => {
      try {
        const BD = (window as any).BarcodeDetector;
        if (!BD) { setMsg('Este navegador no lee QR con la camara. Escribe el codigo XXXX-XXXX.'); setCam(false); return; }
        const det = new BD({ formats: ['qr_code'] });
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        if (video.current) { video.current.srcObject = stream; await video.current.play(); }
        const bucle = async () => {
          if (stop) return;
          try {
            const r = await det.detect(video.current!);
            if (r[0]) { const c = r[0].rawValue as string; const n = Date.now(); if (c !== ultimo.current.c || n - ultimo.current.t > 2500) { ultimo.current = { c, t: n }; cb.current(c); } }
          } catch { /* ignorar cuadros sin QR */ }
          setTimeout(bucle, 250);
        };
        bucle();
      } catch (e: any) { setMsg('No se pudo abrir la camara (necesita HTTPS o localhost): ' + (e?.message ?? e)); setCam(false); }
    })();
    return () => { stop = true; stream?.getTracks().forEach(t => t.stop()); };
  }, [cam]);
  const enviar = () => { const c = txt.trim(); if (c) { onCode(c); setTxt(''); } };
  return (
    <div style={{ marginTop: 12 }}>
      {/* Botón de Escanear con Cámara ARRIBA de Código de Bulto */}
      <div style={{ marginBottom: 12 }}>
        <button
          type="button"
          onClick={() => { setMsg(''); setCam(c => !c); }}
          style={{
            width: '100%',
            padding: '12px 16px',
            fontSize: 14,
            fontWeight: 800,
            borderRadius: 10,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            cursor: 'pointer',
            background: cam ? '#fee2e2' : 'linear-gradient(135deg, #2563eb, #1d4ed8)',
            color: cam ? '#dc2626' : '#ffffff',
            border: cam ? '1.5px solid #ef4444' : 'none',
            boxShadow: cam ? 'none' : '0 4px 12px rgba(37, 99, 235, 0.25)',
            transition: 'all 0.15s ease',
          }}
        >
          <span style={{ fontSize: 18 }}>{cam ? '✕' : '📷'}</span>
          <span>{cam ? 'Apagar Cámara de Escaneo' : 'Escanear con Cámara (Abrir Lector QR)'}</span>
        </button>
      </div>

      {cam && (
        <div style={{ marginBottom: 14, textAlign: 'center', background: '#0f172a', padding: 12, borderRadius: 16 }}>
          <p style={{ color: '#94a3b8', fontSize: 13, margin: '0 0 10px' }}>
            Apunta la cámara al código QR de la etiqueta del bulto
          </p>
          <video ref={video} className="video" playsInline muted style={{ maxWidth: 420, margin: '0 auto', display: 'block', borderRadius: 8 }} />
        </div>
      )}

      {/* Entrada manual / Lector físico de Código de Bulto */}
      <div style={{ marginTop: 8 }}>
        <span style={{ display: 'block', fontWeight: 700, fontSize: 13, color: '#334155', marginBottom: 6 }}>
          📸 Código de Bulto (QR o Código de 8 letras)
        </span>
        <div style={{ display: 'flex', gap: 8, alignItems: 'stretch' }}>
          <input
            autoFocus
            value={txt}
            onChange={e => setTxt(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && enviar()}
            placeholder="Apunta tu lector QR o escribe XXXX-XXXX"
            autoComplete="off"
            style={{
              flex: 1,
              minWidth: 0,
              fontSize: 14,
              padding: '10px 14px',
              borderRadius: 8,
              border: '1.5px solid #cbd5e1',
            }}
          />
          <button
            onClick={enviar}
            disabled={ocupado || !txt.trim()}
            style={{
              padding: '10px 16px',
              fontSize: 13.5,
              fontWeight: 800,
              whiteSpace: 'nowrap',
              flexShrink: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 4,
            }}
          >
            <span>⚡ Procesar</span>
          </button>
        </div>
      </div>
      {msg && <div className="err" style={{ marginTop: 10 }}>{msg}</div>}
    </div>
  );
}

/** Etiqueta del bulto: QR + codigo legible + destino grande. SIN datos personales. */
export function Etiqueta({ token, legible, destino, numero, total, encomienda }: { token: string; legible: string; destino: string; numero: number; total: number; encomienda: string }) {
  const [src, setSrc] = useState('');
  useEffect(() => { QRCode.toDataURL(token, { errorCorrectionLevel: 'M', margin: 1, width: 220 }).then(setSrc); }, [token]);
  return (
    <div className="etiqueta">
      <div className="dest">{destino}</div>
      {src && <img src={src} alt="QR" />}
      <div className="leg">{fmtLegible(legible)}</div>
      <div className="muted" style={{ color: '#000' }}>{encomienda} · Bulto {numero}/{total}</div>
    </div>
  );
}
