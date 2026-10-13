// Deja la demo como nueva: borra TODO lo operativo (encomiendas, viajes, eventos, mensajes) y conserva usuarios, agencias, rutas y tarifas.
// Quita y vuelve a crear los triggers de inmutabilidad (necesita permiso TRIGGER).   Uso: npm run reset:demo
import mysql from 'mysql2/promise';

async function main() {
  const c = await mysql.createConnection({
    host: process.env.DATABASE_HOST || 'localhost', port: Number(process.env.DATABASE_PORT || 3306),
    user: process.env.DATABASE_USER, password: process.env.DATABASE_PASSWORD, database: process.env.DATABASE_NAME,
  });
  const tablas = ['evento', 'incidencia', 'redespacho', 'entrega_bulto', 'entrega', 'codigo_retiro', 'notificacion', 'cotizacion',
    'autorizacion_salida', 'manifiesto_item', 'manifiesto', 'bulto_tramo', 'bulto', 'encomienda', 'viaje', 'audit_log'];
  await c.query('SET FOREIGN_KEY_CHECKS=0');
  await c.query('DROP TRIGGER IF EXISTS trg_evento_no_update');
  await c.query('DROP TRIGGER IF EXISTS trg_evento_no_delete');
  for (const t of tablas) await c.query(`TRUNCATE TABLE \`${t}\``);
  await c.query("CREATE TRIGGER trg_evento_no_update BEFORE UPDATE ON evento FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'evento es inmutable'");
  await c.query("CREATE TRIGGER trg_evento_no_delete BEFORE DELETE ON evento FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'evento es inmutable'");
  await c.query('SET FOREIGN_KEY_CHECKS=1');
  console.log('Demo reiniciada: datos operativos borrados, triggers de inmutabilidad restaurados.');
  await c.end();
}
main().catch(e => { console.error("ERROR:", e.message); process.exit(1); });
