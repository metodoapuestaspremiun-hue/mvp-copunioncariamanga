'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { llamar } from '@/lib/cliente';
import { Error_ } from '@/components/ui';

export default function Viajes() {
  const [v, setV] = useState<any[]>([]);
  const [err, setErr] = useState<any>(null);
  useEffect(() => {
    llamar('/api/viajes').then(setV).catch(setErr);
  }, []);
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginBottom: 16 }}>
        <div>
          <h1 style={{ margin: 0 }}>Viajes y Manifiestos de Carga</h1>
          <p className="muted" style={{ margin: '4px 0 0' }}>Turnos programados de la Cooperativa Unión Cariamanga entre Quito, Loja y Zumba</p>
        </div>
      </div>
      <Error_ e={err} />
      <div className="card">
        <h2>Listado de Turnos y Vehículos Asignados ({v.length})</h2>
        <div className="tabla-scroll">
          <table className="tabla-fija"><thead><tr><th>Fecha</th><th>Vehículo / Turno</th><th>Ruta</th><th>Estado</th><th>Parada actual</th><th>Paquetes</th><th>Acción</th></tr></thead>
          <tbody>{v.map(x => <tr key={x.id}><td>{String(x.fecha).slice(0, 10)}</td><td style={{ fontWeight: 600 }}><Link href={'/viajes/' + x.id}>{x.vehiculo}</Link></td><td>{x.ruta}</td><td><span className={'tag ' + (x.estado === 'cerrado' ? '' : x.estado === 'en_ruta' ? 'verde' : 'amarillo')}>{x.estado}</span></td><td>Parada {x.parada_actual}</td><td><b>{x.items}</b> paquete(s)</td><td><Link className="btn sec" style={{ padding: '4px 10px', fontSize: '12.5px' }} href={'/viajes/' + x.id}>Ver Manifiesto ➔</Link></td></tr>)}</tbody>
          </table>
        </div>
      </div></div>
  );
}
