import fs from 'fs';
import path from 'path';
import mysql from 'mysql2/promise';

function loadEnv() {
  const envPath = path.resolve(process.cwd(), '.env');
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf-8').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const idx = trimmed.indexOf('=');
      if (idx !== -1) {
        const key = trimmed.slice(0, idx).trim();
        const val = trimmed.slice(idx + 1).trim().replace(/^["']|["']$/g, '');
        process.env[key] = val;
      }
    }
  }
}

async function main() {
  loadEnv();
  const c = await mysql.createConnection({
    host: process.env.DATABASE_HOST || 'localhost',
    port: Number(process.env.DATABASE_PORT || 3306),
    user: process.env.DATABASE_USER,
    password: process.env.DATABASE_PASSWORD,
    database: process.env.DATABASE_NAME,
  });

  console.log("Limpiando viajes de prueba 'asdasd' y '112D'...");
  await c.query("SET FOREIGN_KEY_CHECKS=0");
  await c.query("DELETE FROM manifiesto_item WHERE manifiesto_id IN (SELECT id FROM manifiesto WHERE viaje_id IN (SELECT id FROM viaje WHERE vehiculo LIKE '%asdasd%' OR vehiculo LIKE '%112D%'))");
  await c.query("DELETE FROM manifiesto WHERE viaje_id IN (SELECT id FROM viaje WHERE vehiculo LIKE '%asdasd%' OR vehiculo LIKE '%112D%')");
  await c.query("DELETE FROM autorizacion_salida WHERE viaje_id IN (SELECT id FROM viaje WHERE vehiculo LIKE '%asdasd%' OR vehiculo LIKE '%112D%')");
  await c.query("DELETE FROM viaje WHERE vehiculo LIKE '%asdasd%' OR vehiculo LIKE '%112D%'");
  await c.query("SET FOREIGN_KEY_CHECKS=1");

  const [viajes]: any = await c.query("SELECT id, vehiculo, estado FROM viaje");
  console.log("Viajes limpios restantes:", viajes);

  await c.end();
}

main().catch(console.error);
