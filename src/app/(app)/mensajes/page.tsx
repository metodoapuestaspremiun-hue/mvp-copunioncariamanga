'use client';
import { useEffect, useState } from 'react';
import { llamar, fechaEC } from '@/lib/cliente';
import { Error_ } from '@/components/ui';

export default function Mensajes() {
  const [d, setD] = useState<any[]>([]); const [err, setErr] = useState<any>(null);
  const cargar = () => llamar('/api/mensajes').then(setD).catch(setErr);
  useEffect(() => { cargar(); const t = setInterval(cargar, 10000); return () => clearInterval(t); }, []);
  return (
    <div><h1>Mensajes enviados (cola de WhatsApp)</h1><Error_ e={err} />
      <p className="muted">Con el proveedor "simulado" no se envia nada real: aqui ves lo que se le habria enviado al destinatario. Si el envio falla, la operacion igual continua y se reintenta.</p>
      <div className="card"><table><thead><tr><th>Fecha</th><th>Encomienda</th><th>Tipo</th><th>Telefono</th><th>Mensaje</th><th>Estado</th></tr></thead><tbody>
        {d.map(m => <tr key={m.id}><td>{fechaEC(m.creado_at)}</td><td>{m.enc_codigo}</td><td>{m.plantilla}</td><td className="mono">{m.destinatario_tel}</td><td>{m.cuerpo}</td>
          <td><span className={'tag ' + (m.estado === 'enviada' ? 'verde' : m.estado === 'fallida' ? 'rojo' : 'amarillo')}>{m.estado}</span>{m.ultimo_error && <div className="muted">{m.ultimo_error}</div>}</td></tr>)}</tbody></table></div></div>);
}
