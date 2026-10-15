'use client';
import { useState } from 'react';
import { llamar, fechaEC, fmtLegible } from '@/lib/cliente';
import { Error_, Estado } from '@/components/ui';

export default function Entrega() {
  const [q, setQ] = useState(''); const [e, setE] = useState<any>(null); const [err, setErr] = useState<any>(null); const [ok, setOk] = useState('');
  const [f, setF] = useState({ metodo: 'codigo', codigo: '', receptorNombre: '', receptorDoc: '', motivo: '', supEmail: '', supPass: '' });
  const buscar = async () => {
    setErr(null); setOk('');
    try {
      const data: any = await llamar('/api/entregas/buscar?q=' + encodeURIComponent(q));
      setE(data);
      setF(prev => ({
        ...prev,
        receptorNombre: prev.receptorNombre || data.dest_nombre || '',
        codigo: data.codigoIngresadoDirecto || (/^\d{6}$/.test(q.trim()) ? q.trim() : prev.codigo)
      }));
    } catch (x) {
      setErr(x); setE(null);
    }
  };
  const entregar = async () => {
    setErr(null); setOk('');
    try {
      const r: any = await llamar('/api/entregas', 'POST', { encomiendaId: e.id, metodo: f.metodo, codigo: f.codigo || undefined, receptorNombre: f.receptorNombre, receptorDoc: f.receptorDoc || null,
        motivo: f.motivo || null, supervisor: f.supEmail ? { email: f.supEmail, password: f.supPass } : null });
      const msg = r.parcial ? `✓ Entrega PARCIAL registrada (${r.bultosEntregados} paquete/s). El resto sigue pendiente.` : `✓ Entrega registrada con éxito (${r.bultosEntregados} paquete/s). Encomienda completa.`;
      setOk(msg);
      setE(null);
      setQ('');
      setF({ metodo: 'codigo', codigo: '', receptorNombre: '', receptorDoc: '', motivo: '', supEmail: '', supPass: '' });
    } catch (x) { setErr(x); }
  };
  const set = (k: string) => (ev: any) => setF({ ...f, [k]: ev.target.value });
  return (
    <div><h1>Entrega</h1>
      <div className="card"><div className="row"><label>Código de retiro (6 dígitos), encomienda (E-XXXX) o paquete<input value={q} onChange={ev => setQ(ev.target.value)} onKeyDown={ev => ev.key === 'Enter' && buscar()} placeholder="Ej: 947962, E-J696WYWD..." /></label><button onClick={buscar}>Buscar</button></div></div>
      <Error_ e={err} />{ok && <div className="okmsg">{ok}</div>}
      {e && <div className="grid">
        <div className="card"><h2>{e.codigo} <Estado e={e.estado ?? 'en_proceso'} /></h2><p>Destinatario: <b>{e.dest_nombre}</b> · Retira en {e.destino}</p>
          <table><tbody>{e.bultos.map((b: any) => <tr key={b.id}><td>#{b.numero}</td><td className="mono">{fmtLegible(b.codigo_legible)}</td><td><Estado e={b.estado} /></td></tr>)}</tbody></table>
          <p className="muted">{e.codigoRetiro ? `Código de retiro vigente hasta ${fechaEC(e.codigoRetiro.expira_at)}. Intentos restantes: ${e.codigoRetiro.intentosRestantes}` : 'No hay código de retiro vigente (se emite cuando TODOS los paquetes están disponibles). Se puede entregar con documento.'}</p></div>
        <div className="card"><h2>Registrar entrega</h2>
          <label>Verificacion<select value={f.metodo} onChange={set('metodo')}><option value="codigo">Codigo de retiro (6 digitos)</option><option value="documento">Documento de identidad</option><option value="tercero">Tercero autorizado (con documento)</option></select></label>
          {f.metodo === 'codigo' && <label style={{ marginTop: 8 }}>Codigo que dice el destinatario<input inputMode="numeric" maxLength={6} value={f.codigo} onChange={set('codigo')} /></label>}
          <label style={{ marginTop: 8 }}>Nombre de quien recibe<input value={f.receptorNombre} onChange={set('receptorNombre')} /></label>
          <label style={{ marginTop: 8 }}>Documento {f.metodo === 'codigo' ? '(opcional)' : '(obligatorio)'}<input value={f.receptorDoc} onChange={set('receptorDoc')} /></label>
          <details style={{ marginTop: 10 }}><summary>Entrega parcial (faltan paquetes) — requiere supervisor</summary>
            <p className="muted">Solo si hay un faltante abierto. El supervisor se identifica aqui con su usuario y contrasena.</p>
            <label>Motivo<input value={f.motivo} onChange={set('motivo')} /></label>
            <label style={{ marginTop: 8 }}>Correo del supervisor<input value={f.supEmail} onChange={set('supEmail')} placeholder="supervisor@demo.local" /></label>
            <label style={{ marginTop: 8 }}>Contrasena del supervisor<input type="password" value={f.supPass} onChange={set('supPass')} /></label></details>
          <p><button className="verde" onClick={entregar} disabled={!f.receptorNombre || (f.metodo === 'codigo' && f.codigo.length < 6)}>Entregar</button></p></div></div>}
    </div>);
}
