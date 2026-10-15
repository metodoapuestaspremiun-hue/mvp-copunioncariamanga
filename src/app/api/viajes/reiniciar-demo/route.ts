import { api } from '@/server/http';
import { pool } from '@/server/db';
import { q } from '@/server/db';

/**
 * POST /api/viajes/reiniciar-demo
 * Reinicia la base de datos operativa para demostraciones:
 * - Limpia tablas operativas (eventos, incidencias, entregas, encomiendas, paquetes, redespachos, etc.)
 * - Recrea los 6 viajes programados estándar (Quito - Loja - Zumba y vuelta)
 */
export const POST = api({ permiso: null }, async () => {
  const tablas = [
    'evento',
    'incidencia',
    'redespacho',
    'entrega_bulto',
    'entrega',
    'codigo_retiro',
    'notificacion',
    'cotizacion',
    'autorizacion_salida',
    'manifiesto_item',
    'manifiesto',
    'bulto_tramo',
    'bulto',
    'encomienda',
    'viaje',
    'audit_log',
  ];

  await pool.query('SET FOREIGN_KEY_CHECKS=0');

  for (const t of tablas) {
    await pool.query(`DELETE FROM \`${t}\``);
  }

  await pool.query('SET FOREIGN_KEY_CHECKS=1');

  // Limpiar sufijos (DEMO) si hubiesen
  await pool.query("UPDATE agencia SET nombre = REPLACE(nombre, ' (DEMO)', '')");
  await pool.query("UPDATE ruta SET nombre = REPLACE(nombre, ' (DEMO)', '')");

  const [agencias]: any = await pool.query('SELECT id, nombre, ciudad FROM agencia');
  const [rutas]: any = await pool.query('SELECT id, nombre FROM ruta');

  const rutaIda = rutas[0];
  let rutaVueltaId = '';

  const [rutasVuelta]: any = await pool.query("SELECT id, nombre FROM ruta WHERE nombre LIKE '%Zumba%Quito%'");
  if (rutasVuelta.length > 0) {
    rutaVueltaId = rutasVuelta[0].id;
  } else if (agencias.length >= 3) {
    const [resRuta]: any = await pool.query('SELECT UUID() as id');
    rutaVueltaId = resRuta[0].id;
    await pool.query('INSERT INTO ruta (id, nombre) VALUES (?, ?)', [rutaVueltaId, 'Zumba - Loja - Quito']);

    const zumba = agencias.find((a: any) => a.nombre.toLowerCase().includes('zumba'))?.id;
    const loja = agencias.find((a: any) => a.nombre.toLowerCase().includes('loja'))?.id;
    const quito = agencias.find((a: any) => a.nombre.toLowerCase().includes('quito'))?.id;

    if (zumba && loja && quito) {
      await pool.query('INSERT INTO parada (id, ruta_id, orden, nombre, agencia_id, tiene_guardia) VALUES (UUID(), ?, 1, "Zumba", ?, 0)', [rutaVueltaId, zumba]);
      await pool.query('INSERT INTO parada (id, ruta_id, orden, nombre, agencia_id, tiene_guardia) VALUES (UUID(), ?, 2, "Loja", ?, 0)', [rutaVueltaId, loja]);
      await pool.query('INSERT INTO parada (id, ruta_id, orden, nombre, agencia_id, tiene_guardia) VALUES (UUID(), ?, 3, "Quito", ?, 0)', [rutaVueltaId, quito]);
    }
  } else {
    rutaVueltaId = rutaIda.id;
  }

  const viajesDefinidos = [
    // Turnos Quito -> Loja -> Zumba
    { ruta: rutaIda.id, vehiculo: 'Bus 12 · 06:00', conductor: 'Carlos Andrade' },
    { ruta: rutaIda.id, vehiculo: 'Bus 25 · 14:00', conductor: 'Manuel Guamán' },
    { ruta: rutaIda.id, vehiculo: 'Bus 38 · 21:00 (Noche)', conductor: 'Segundo Poma' },
    // Turnos Zumba -> Loja -> Quito
    { ruta: rutaVueltaId, vehiculo: 'Bus 09 · 05:30', conductor: 'Ángel Vivanco' },
    { ruta: rutaVueltaId, vehiculo: 'Bus 17 · 13:30', conductor: 'Luis Cueva' },
    { ruta: rutaVueltaId, vehiculo: 'Bus 44 · 20:30 (Noche)', conductor: 'Patricio Torres' },
  ];

  const [usr]: any = await pool.query('SELECT id FROM usuario LIMIT 1');
  const adminId = usr[0]?.id || null;
  const fechaHoy = new Date().toISOString().slice(0, 10);

  for (const vd of viajesDefinidos) {
    const [u]: any = await pool.query('SELECT UUID() as id, UUID() as mid');
    const vid = u[0].id;
    const mid = u[0].mid;
    await pool.query(
      "INSERT INTO viaje (id, ruta_id, fecha, vehiculo, conductor, estado, parada_actual, creado_por) VALUES (?, ?, ?, ?, ?, 'planificado', 1, ?)",
      [vid, vd.ruta, fechaHoy, vd.vehiculo, vd.conductor, adminId]
    );
    await pool.query('INSERT INTO manifiesto (id, viaje_id, version) VALUES (?, ?, 1)', [mid, vid]);
  }

  return { ok: true, mensaje: 'Demostración reiniciada: 6 viajes limpios programados con éxito.' };
});
