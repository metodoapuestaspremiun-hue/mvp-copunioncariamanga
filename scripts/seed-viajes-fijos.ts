import mysql from 'mysql2/promise';

async function main() {
  const c = await mysql.createConnection({
    host: process.env.DATABASE_HOST || 'localhost',
    port: Number(process.env.DATABASE_PORT || 3306),
    user: process.env.DATABASE_USER,
    password: process.env.DATABASE_PASSWORD,
    database: process.env.DATABASE_NAME,
  });

  // Limpiar agencias para que no tengan "(DEMO)"
  await c.query("UPDATE agencia SET nombre = REPLACE(nombre, ' (DEMO)', '')");
  await c.query("UPDATE ruta SET nombre = REPLACE(nombre, ' (DEMO)', '')");

  const [agencias]: any = await c.query("SELECT id, nombre, ciudad FROM agencia");
  console.log("AGENCIAS:", agencias);

  const [rutas]: any = await c.query("SELECT id, nombre FROM ruta");
  console.log("RUTAS:", rutas);

  // Asegurar ruta de regreso si no existe: Zumba - Loja - Quito
  const rutaIda = rutas[0];
  let rutaVueltaId = '';

  const [rutasVuelta]: any = await c.query("SELECT id, nombre FROM ruta WHERE nombre LIKE '%Zumba%Quito%'");
  if (rutasVuelta.length > 0) {
    rutaVueltaId = rutasVuelta[0].id;
  } else {
    // Crear ruta de regreso
    const [resRuta]: any = await c.query("SELECT UUID() as id");
    rutaVueltaId = resRuta[0].id;
    await c.query("INSERT INTO ruta (id, nombre) VALUES (?, ?)", [rutaVueltaId, 'Zumba - Loja - Quito']);

    const zumba = agencias.find((a: any) => a.nombre.toLowerCase().includes('zumba'))?.id;
    const loja = agencias.find((a: any) => a.nombre.toLowerCase().includes('loja'))?.id;
    const quito = agencias.find((a: any) => a.nombre.toLowerCase().includes('quito'))?.id;

    if (zumba && loja && quito) {
      await c.query("INSERT INTO parada (id, ruta_id, orden, nombre, agencia_id, tiene_guardia) VALUES (UUID(), ?, 1, 'Zumba', ?, 0)", [rutaVueltaId, zumba]);
      await c.query("INSERT INTO parada (id, ruta_id, orden, nombre, agencia_id, tiene_guardia) VALUES (UUID(), ?, 2, 'Loja', ?, 0)", [rutaVueltaId, loja]);
      await c.query("INSERT INTO parada (id, ruta_id, orden, nombre, agencia_id, tiene_guardia) VALUES (UUID(), ?, 3, 'Quito', ?, 0)", [rutaVueltaId, quito]);
      console.log("Ruta de regreso creada.");
    }
  }

  // Comprobar viajes activos
  const [viajes]: any = await c.query("SELECT id, vehiculo, estado FROM viaje");
  console.log("VIAJES EXISTENTES:", viajes.length);

  // Si hay pocos viajes, crear los 6 viajes fijos
  if (viajes.length < 6) {
    const viajesDefinidos = [
      // Turnos Quito -> Loja -> Zumba
      { ruta: rutaIda.id, vehiculo: 'Disco 12 · 06:00', conductor: 'Carlos Andrade' },
      { ruta: rutaIda.id, vehiculo: 'Disco 25 · 14:00', conductor: 'Manuel Guamán' },
      { ruta: rutaIda.id, vehiculo: 'Disco 38 · 21:00 (Noche)', conductor: 'Segundo Poma' },
      // Turnos Zumba -> Loja -> Quito
      { ruta: rutaVueltaId, vehiculo: 'Disco 09 · 05:30', conductor: 'Ángel Vivanco' },
      { ruta: rutaVueltaId, vehiculo: 'Disco 17 · 13:30', conductor: 'Luis Cueva' },
      { ruta: rutaVueltaId, vehiculo: 'Disco 44 · 20:30 (Noche)', conductor: 'Patricio Torres' },
    ];

    const [usr]: any = await c.query("SELECT id FROM usuario LIMIT 1");
    const adminId = usr[0]?.id;

    for (const vd of viajesDefinidos) {
      const [u]: any = await c.query("SELECT UUID() as id, UUID() as mid");
      const vid = u[0].id;
      const mid = u[0].mid;
      const fechaHoy = new Date().toISOString().slice(0, 10);
      await c.query(
        "INSERT INTO viaje (id, ruta_id, fecha, vehiculo, conductor, estado, parada_actual, creado_por) VALUES (?, ?, ?, ?, ?, 'planificado', 1, ?)",
        [vid, vd.ruta, fechaHoy, vd.vehiculo, vd.conductor, adminId]
      );
      await c.query("INSERT INTO manifiesto (id, viaje_id, version) VALUES (?, ?, 1)", [mid, vid]);
      console.log(`Viaje creado: ${vd.vehiculo}`);
    }
  }

  console.log("Configuración de rutas y 6 viajes fijos completada con éxito.");
  await c.end();
}

main().catch(err => {
  console.error("Error:", err);
  process.exit(1);
});
