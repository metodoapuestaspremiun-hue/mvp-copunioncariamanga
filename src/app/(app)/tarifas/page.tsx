'use client';
import { useState } from 'react';

interface ReglaTarifa {
  id: string;
  origen: string;
  destino: string;
  pesoDesde: number;
  pesoHasta: number;
  precio: number;
  estado: 'Activa' | 'En revisión';
}

export default function TarifasPage() {
  const [factorVolumetrico, setFactorVolumetrico] = useState<number>(5000);
  const [notificacion, setNotificacion] = useState<string>('');
  const [modalAbierto, setModalAbierto] = useState<boolean>(false);

  const [reglas, setReglas] = useState<ReglaTarifa[]>([
    { id: '1', origen: 'Quito', destino: 'Loja', pesoDesde: 0, pesoHasta: 5, precio: 3.00, estado: 'Activa' },
    { id: '2', origen: 'Quito', destino: 'Loja', pesoDesde: 5, pesoHasta: 20, precio: 7.00, estado: 'Activa' },
    { id: '3', origen: 'Quito', destino: 'Loja', pesoDesde: 20, pesoHasta: 50, precio: 15.00, estado: 'Activa' },
    { id: '4', origen: 'Quito', destino: 'Loja', pesoDesde: 50, pesoHasta: 100, precio: 25.00, estado: 'Activa' },

    { id: '5', origen: 'Loja', destino: 'Zumba', pesoDesde: 0, pesoHasta: 5, precio: 3.00, estado: 'Activa' },
    { id: '6', origen: 'Loja', destino: 'Zumba', pesoDesde: 5, pesoHasta: 20, precio: 7.00, estado: 'Activa' },
    { id: '7', origen: 'Loja', destino: 'Zumba', pesoDesde: 20, pesoHasta: 50, precio: 15.00, estado: 'Activa' },

    { id: '8', origen: 'Quito', destino: 'Zumba (Tramo Largo)', pesoDesde: 0, pesoHasta: 5, precio: 5.40, estado: 'Activa' },
    { id: '9', origen: 'Quito', destino: 'Zumba (Tramo Largo)', pesoDesde: 5, pesoHasta: 20, precio: 12.60, estado: 'Activa' },
    { id: '10', origen: 'Quito', destino: 'Zumba (Tramo Largo)', pesoDesde: 20, pesoHasta: 50, precio: 27.00, estado: 'Activa' },
  ]);

  const [nuevaRegla, setNuevaRegla] = useState({
    origen: 'Quito',
    destino: 'Loja',
    pesoDesde: 0,
    pesoHasta: 10,
    precio: 4.50,
  });

  const agregarRegla = (e: React.FormEvent) => {
    e.preventDefault();
    const nueva: ReglaTarifa = {
      id: String(Date.now()),
      origen: nuevaRegla.origen,
      destino: nuevaRegla.destino,
      pesoDesde: Number(nuevaRegla.pesoDesde),
      pesoHasta: Number(nuevaRegla.pesoHasta),
      precio: Number(nuevaRegla.precio),
      estado: 'Activa',
    };
    setReglas([nueva, ...reglas]);
    setModalAbierto(false);
    setNotificacion('✅ Nueva regla tarifaria guardada exitosamente.');
    setTimeout(() => setNotificacion(''), 4000);
  };

  const eliminarRegla = (id: string) => {
    setReglas(reglas.filter(r => r.id !== id));
    setNotificacion('🗑️ Regla tarifaria desactivada.');
    setTimeout(() => setNotificacion(''), 3000);
  };

  const guardarFactor = () => {
    setNotificacion('✅ Factor volumétrico actualizado.');
    setTimeout(() => setNotificacion(''), 3000);
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1>Gestión de Tarifas y Precios Oficiales</h1>
          <p className="muted" style={{ margin: '-10px 0 16px' }}>
            Panel de control para definir los costos por kilo y reglas de flete entre agencias de la cooperativa.
          </p>
        </div>
        <button type="button" onClick={() => setModalAbierto(true)}>
          <span>➕ Crear Nueva Tarifa</span>
        </button>
      </div>

      {notificacion && <div className="okmsg">{notificacion}</div>}

      {/* Tarjeta de Parámetros Globales */}
      <div className="card">
        <h2>Parámetros de Cálculo Logístico</h2>
        <div className="row" style={{ alignItems: 'flex-end', gap: 16 }}>
          <label style={{ maxWidth: 280 }}>
            <span>Factor Volumétrico Estándar (cm³ / kg)</span>
            <input
              type="number"
              value={factorVolumetrico}
              onChange={e => setFactorVolumetrico(Number(e.target.value))}
            />
          </label>
          <button type="button" className="sec" onClick={guardarFactor}>
            Guardar Factor
          </button>
          <p className="muted" style={{ margin: '0 0 8px', fontSize: 13, flex: 2 }}>
            Fórmula: <i>(Largo × Ancho × Alto) / {factorVolumetrico}</i>. Se cobra el valor mayor entre peso real y peso volumétrico.
          </p>
        </div>
      </div>

      {/* Tabla de Tarifas */}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h2>Matriz de Precios Vigente (Versión 2026.1)</h2>
          <span className="tag verde">Oficial y Activa</span>
        </div>

        <table>
          <thead>
            <tr>
              <th>Ruta (Origen → Destino)</th>
              <th>Rango de Peso</th>
              <th>Tarifa Base</th>
              <th>Estado</th>
              <th style={{ textAlign: 'right' }}>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {reglas.map(r => (
              <tr key={r.id}>
                <td>
                  <b>{r.origen}</b> ➔ <b>{r.destino}</b>
                </td>
                <td>
                  <span className="num">{r.pesoDesde} kg</span> a <span className="num">{r.pesoHasta} kg</span>
                </td>
                <td>
                  <b style={{ color: 'var(--azul)', fontSize: 15 }}>${r.precio.toFixed(2)}</b>
                </td>
                <td>
                  <span className="tag verde">{r.estado}</span>
                </td>
                <td style={{ textAlign: 'right' }}>
                  <button
                    type="button"
                    className="sec"
                    style={{ padding: '4px 10px', fontSize: 12, marginRight: 6 }}
                    onClick={() => {
                      const nuevoPrecio = prompt(`Editar precio para ${r.origen} ➔ ${r.destino}:`, String(r.precio));
                      if (nuevoPrecio) {
                        setReglas(reglas.map(x => x.id === r.id ? { ...x, precio: parseFloat(nuevoPrecio) } : x));
                        setNotificacion('✅ Precio actualizado.');
                        setTimeout(() => setNotificacion(''), 3000);
                      }
                    }}
                  >
                    Editar
                  </button>
                  <button
                    type="button"
                    className="rojo"
                    style={{ padding: '4px 10px', fontSize: 12 }}
                    onClick={() => eliminarRegla(r.id)}
                  >
                    Eliminar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Modal para Crear Nueva Tarifa */}
      {modalAbierto && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.5)', zIndex: 1000,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16
        }}>
          <div className="card" style={{ maxWidth: 480, width: '100%', boxShadow: 'var(--sombra-lg)' }}>
            <h2>Crear Nueva Regla de Tarifa</h2>
            <form onSubmit={agregarRegla}>
              <div className="row" style={{ marginTop: 12 }}>
                <label>
                  <span>Agencia Origen</span>
                  <select
                    value={nuevaRegla.origen}
                    onChange={e => setNuevaRegla({ ...nuevaRegla, origen: e.target.value })}
                  >
                    <option value="Quito">Agencia Quito</option>
                    <option value="Loja">Agencia Loja</option>
                    <option value="Zumba">Agencia Zumba</option>
                  </select>
                </label>
                <label>
                  <span>Agencia Destino</span>
                  <select
                    value={nuevaRegla.destino}
                    onChange={e => setNuevaRegla({ ...nuevaRegla, destino: e.target.value })}
                  >
                    <option value="Loja">Agencia Loja</option>
                    <option value="Quito">Agencia Quito</option>
                    <option value="Zumba">Agencia Zumba</option>
                  </select>
                </label>
              </div>

              <div className="row" style={{ marginTop: 12 }}>
                <label>
                  <span>Peso Desde (kg)</span>
                  <input
                    type="number"
                    value={nuevaRegla.pesoDesde}
                    onChange={e => setNuevaRegla({ ...nuevaRegla, pesoDesde: Number(e.target.value) })}
                  />
                </label>
                <label>
                  <span>Peso Hasta (kg)</span>
                  <input
                    type="number"
                    value={nuevaRegla.pesoHasta}
                    onChange={e => setNuevaRegla({ ...nuevaRegla, pesoHasta: Number(e.target.value) })}
                  />
                </label>
                <label>
                  <span>Precio ($)</span>
                  <input
                    type="number"
                    step="0.01"
                    value={nuevaRegla.precio}
                    onChange={e => setNuevaRegla({ ...nuevaRegla, precio: Number(e.target.value) })}
                  />
                </label>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
                <button type="button" className="sec" onClick={() => setModalAbierto(false)}>
                  Cancelar
                </button>
                <button type="submit">
                  Guardar Tarifa
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
