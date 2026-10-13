// Pone la contrasena (argon2id) a los 4 usuarios de demo.  Uso: npm run seed:usuarios
import { hash } from '@node-rs/argon2';
import mysql from 'mysql2/promise';

async function main() {
  const pass = process.env.DEMO_PASSWORD || 'Demo2026!';
  const c = await mysql.createConnection({
    host: process.env.DATABASE_HOST || 'localhost', port: Number(process.env.DATABASE_PORT || 3306),
    user: process.env.DATABASE_USER, password: process.env.DATABASE_PASSWORD, database: process.env.DATABASE_NAME,
  });
  const h = await hash(pass);
  const [r]: any = await c.query("UPDATE usuario SET password_hash=? WHERE email LIKE '%@demo.local'", [h]);
  console.log(`Listo: ${r.affectedRows} usuarios. Contrasena: ${pass}`);
  console.log('Usuarios: operador@demo.local, ayudante@demo.local, supervisor@demo.local, gerente@demo.local');
  await c.end();
}
main().catch(e => { console.error("ERROR:", e.message); process.exit(1); });
