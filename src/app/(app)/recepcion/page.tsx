'use client';
import { useEffect, useState } from 'react';
import { llamar } from '@/lib/cliente';
import { Error_, ResultadoGrande, Scanner } from '@/components/ui';
import { useUsuario } from '@/components/Sesion';

export default function Recepcion() {
  const u = useUsuario(); const [cat, setCat] = useState<any>(null); const [ag, setAg] = useState('');
  const [res, setRes] = useState<any>(null); const [err, setErr] = useState<any>(null); const [hist, setHist] = useState<any[]>([]);
  useEffect(() => { llamar('/api/catalogos').then((c: any) => { setCat(c); setAg(u.roles.find(r => r.agenciaId)?.agenciaId ?? c.agencias[0]?.id ?? ''); }); }, []);
  const recibir = async (codigo: string) => {
    setErr(null);
    try { const r: any = await llamar('/api/recepciones', 'POST', { codigo, agenciaId: ag });
      const texto = r.resultado === 'repetido' ? { resultado: 'repetido', codigo: r.codigo, alerta: 'Ya habia sido recibido' }
        : { resultado: 'ok', codigo: r.codigo, encomienda: r.encomienda, alerta: r.estado === 'pendiente_redespacho' ? 'No es su destino final: queda PENDIENTE DE REDESPACHO con plazo' : 'Es su destino final: DISPONIBLE PARA RETIRO (si están todos los paquetes, se emite el código)' };
      setRes(texto); setHist(h => [texto, ...h].slice(0, 10)); }
    catch (e: any) { setErr(e); setRes(null); }
  };
  if (!cat) return <div>Cargando...</div>;
  return (
    <div><h1>Recepcion en agencia</h1><Error_ e={err} />
      <div className="card"><div className="row"><label>Agencia que recibe<select value={ag} onChange={e => setAg(e.target.value)}>{cat.agencias.map((a: any) => <option key={a.id} value={a.id}>{a.nombre}</option>)}</select></label></div>
        <p className="muted">Se recibe paquete por paquete escaneando la etiqueta. No existe "recibir todo el lote" sin verificar cada paquete.</p>
        <Scanner onCode={recibir} /><ResultadoGrande r={res} /></div></div>);
}
