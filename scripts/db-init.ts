// Crea las tablas y carga los datos de demostracion.  Uso:  npm run db:init   (agrega -- --reset para borrar todo antes)
import mysql from 'mysql2/promise';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export async function inicializarBD(opts: { reset?: boolean; seed?: boolean } = {}) {
  const c = await mysql.createConnection({
    host: process.env.DATABASE_HOST || 'localhost', port: Number(process.env.DATABASE_PORT || 3306),
    user: process.env.DATABASE_USER, password: process.env.DATABASE_PASSWORD, database: process.env.DATABASE_NAME,
    multipleStatements: true, charset: 'utf8mb4', timezone: 'Z',
  });
  try {
    await c.query("SET time_zone='+00:00'");
    if (opts.reset) {
      await c.query('SET FOREIGN_KEY_CHECKS=0');
      const [vistas]: any = await c.query("SELECT table_name n FROM information_schema.views WHERE table_schema=DATABASE()");
      for (const v of vistas) await c.query(`DROP VIEW IF EXISTS \`${v.n}\``);
      const [tablas]: any = await c.query("SELECT table_name n FROM information_schema.tables WHERE table_schema=DATABASE() AND table_type='BASE TABLE'");
      for (const t of tablas) await c.query(`DROP TABLE IF EXISTS \`${t.n}\``);
      await c.query('SET FOREIGN_KEY_CHECKS=1');
    }
    await c.query(readFileSync(resolve(process.cwd(), 'db/001_init_mvp.sql'), 'utf8'));
    if (opts.seed !== false) await c.query(readFileSync(resolve(process.cwd(), 'db/seed.sql'), 'utf8'));
  } finally { await c.end(); }
}

if (process.argv[1]?.includes('db-init')) {
  if (process.argv.includes('--reset') && !process.argv.includes('--yes')) {
    console.error('--reset BORRA TODAS LAS TABLAS de la base ' + process.env.DATABASE_NAME + '. Si estas seguro: npm run db:init -- --reset --yes');
    process.exit(1);
  }
  inicializarBD({ reset: process.argv.includes('--reset') })
    .then(() => console.log('Base de datos lista. Ahora ejecuta: npm run seed:usuarios'))
    .catch(e => { console.error('ERROR:', e.message); process.exit(1); });
}
