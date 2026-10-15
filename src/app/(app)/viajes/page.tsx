'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { llamar } from '@/lib/cliente';
import { Error_ } from '@/components/ui';

export default function Viajes() {
  const [v, setV] = useState<any[]>([]);
  const [err, setErr] = useState<any>(null);
  const [reiniciando, setReiniciando] = useState(false);
  const [mensajeOk, setMensajeOk] = useState('');

  const cargar = () => {
    llamar('/api/viajes').then(setV).catch(setErr);
  };

  useEffect(() => {
    cargar();
  }, []);

  const reiniciarTodo = async () => {
    const confirmacion = window.confirm(
      '¿Deseas reiniciar la demostración?\n\n' +
      'Esto dejará el sistema limpio con 6 turnos fijos programados (Quito-Loja-Zumba) para poder hacer una prueba desde cero.'
    );
    if (!confirmacion) return;

    setReiniciando(true);
    setErr(null);
    setMensajeOk('');
    try {
      const res: any = await llamar('/api/viajes/reiniciar-demo', 'POST');
      setMensajeOk(res.mensaje || 'Demostración reiniciada con éxito.');
      await cargar();
    } catch (e: any) {
      setErr(e);
    } finally {
      setReiniciando(false);
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
        <div>
          <h1 style={{ margin: 0 }}>Viajes y Manifiestos de Carga</h1>
          <p className="muted" style={{ margin: '4px 0 0' }}>Turnos programados de la Cooperativa Unión Cariamanga entre Quito, Loja y Zumba</p>
        </div>

        {/* Botón de reinicio exclusivo para pruebas del MVP */}
        <button
          type="button"
          onClick={reiniciarTodo}
          disabled={reiniciando}
          style={{
            background: 'linear-gradient(135deg, #1e3a8a, #2563eb)',
            color: '#ffffff',
            border: 'none',
            borderRadius: '12px',
            padding: '10px 18px',
            fontWeight: 700,
            fontSize: '13.5px',
            cursor: 'pointer',
            boxShadow: '0 4px 12px rgba(37, 99, 235, 0.25)',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            transition: 'all 0.2s ease',
          }}
          title="Limpia encomiendas y deja los 6 buses de ruta listos para pruebas limpias"
        >
          <span>{reiniciando ? '⏳ Reiniciando...' : '🔄 Reiniciar Todo (Demo MVP)'}</span>
        </button>
      </div>

      <Error_ e={err} />

      {mensajeOk && (
        <div className="okmsg" style={{ marginBottom: 16 }}>
          ✓ {mensajeOk}
        </div>
      )}

      <div className="card">
        <h2>Listado de Turnos y Vehículos Asignados ({v.length})</h2>
        <div className="tabla-scroll">
          <table className="tabla-fija">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Vehículo / Turno</th>
                <th>Ruta</th>
                <th>Estado</th>
                <th>Parada actual</th>
                <th>Paquetes</th>
                <th>Acción</th>
              </tr>
            </thead>
            <tbody>
              {v.map(x => (
                <tr key={x.id}>
                  <td>{String(x.fecha).slice(0, 10)}</td>
                  <td style={{ fontWeight: 600 }}>
                    <Link href={'/viajes/' + x.id}>{x.vehiculo}</Link>
                  </td>
                  <td>{x.ruta}</td>
                  <td>
                    <span className={'tag ' + (x.estado === 'cerrado' ? '' : x.estado === 'en_ruta' ? 'verde' : 'amarillo')}>
                      {x.estado}
                    </span>
                  </td>
                  <td>Parada {x.parada_actual}</td>
                  <td><b>{x.items}</b> paquete(s)</td>
                  <td>
                    <Link className="btn sec" style={{ padding: '4px 10px', fontSize: '12.5px' }} href={'/viajes/' + x.id}>
                      Ver Manifiesto ➔
                    </Link>
                  </td>
                </tr>
              ))}
              {!v.length && (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: '28px', color: '#64748b' }}>
                    No hay viajes registrados. Presiona <b>🔄 Reiniciar Todo (Demo MVP)</b> para generar los turnos estándar.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
