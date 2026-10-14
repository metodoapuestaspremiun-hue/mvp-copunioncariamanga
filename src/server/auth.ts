import { cookies } from 'next/headers';
import { createHash, randomBytes } from 'node:crypto';
import { hash, verify } from '@node-rs/argon2';
import { pool, q, q1, ex } from './db';
import { ErrorNegocio, param } from './comun';
import type { SesionUsuario, Rol } from '@/shared/permisos';

const COOKIE = 'sid';
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
export const hashPassword = (p: string) => hash(p);

async function cargarRoles(usuarioId: string) {
  const r = await q<{ rol: Rol; agencia_id: string | null }>(pool, 'SELECT rol, agencia_id FROM usuario_rol WHERE usuario_id=?', [usuarioId]);
  return r.map(x => ({ rol: x.rol, agenciaId: x.agencia_id }));
}

export async function verificarCredenciales(email: string, password: string): Promise<SesionUsuario | null> {
  const u = await q1<any>(pool, 'SELECT * FROM usuario WHERE email=? AND activo=1', [email.trim().toLowerCase()]);
  if (!u || u.password_hash === 'PENDIENTE') return null;
  let ok = false;
  try { ok = await verify(u.password_hash, password); } catch { ok = false; }
  if (!ok) return null;
  return { id: u.id, nombre: u.nombre, email: u.email, roles: await cargarRoles(u.id) };
}

export async function iniciarSesion(email: string, password: string): Promise<SesionUsuario> {
  const u = await verificarCredenciales(email, password);
  if (!u) throw new ErrorNegocio('CREDENCIALES_INVALIDAS', 'Correo o contrasena incorrectos', undefined, 401);
  const token = randomBytes(32).toString('hex');
  await ex(pool, 'INSERT INTO sesion(id,usuario_id,expira_at) VALUES (?,?,NOW(3) + INTERVAL 12 HOUR)', [sha(token), u.id]);
  (await cookies()).set(COOKIE, token, {
    httpOnly: true, sameSite: 'lax', path: '/', maxAge: 60 * 60 * 12,
    secure: process.env.COOKIE_SECURE === 'true',
  });
  return u;
}

export async function cerrarSesion() {
  const c = await cookies(); const t = c.get(COOKIE)?.value;
  if (t) await ex(pool, 'DELETE FROM sesion WHERE id=?', [sha(t)]);
  c.delete(COOKIE);
}

// Modo MVP: mapeo de roles individuales y todos juntos
const ROL_CONFIG: Record<string, { nombre: string; email: string; roles: { rol: Rol; agenciaId: string | null }[] }> = {
  todos: {
    nombre: 'Modo Completo (Todos los roles)',
    email: 'admin@demo.local',
    roles: [
      { rol: 'operador', agenciaId: null },
      { rol: 'despachador', agenciaId: null },
      { rol: 'ayudante', agenciaId: null },
      { rol: 'guardia', agenciaId: null },
      { rol: 'responsable_agencia', agenciaId: null },
      { rol: 'supervisor', agenciaId: null },
      { rol: 'gerente', agenciaId: null },
      { rol: 'admin', agenciaId: null },
    ],
  },
  operador: {
    nombre: 'Operador de Ventanilla',
    email: 'operador@demo.local',
    roles: [{ rol: 'operador', agenciaId: null }],
  },
  despachador: {
    nombre: 'Despachador de Andén',
    email: 'despachador@demo.local',
    roles: [{ rol: 'despachador', agenciaId: null }],
  },
  ayudante: {
    nombre: 'Ayudante de Bus',
    email: 'ayudante@demo.local',
    roles: [{ rol: 'ayudante', agenciaId: null }],
  },
  guardia: {
    nombre: 'Guardia / Control Salida',
    email: 'guardia@demo.local',
    roles: [{ rol: 'guardia', agenciaId: null }, { rol: 'responsable_agencia', agenciaId: null }],
  },
  supervisor: {
    nombre: 'Supervisor Operativo',
    email: 'supervisor@demo.local',
    roles: [{ rol: 'supervisor', agenciaId: null }],
  },
  gerente: {
    nombre: 'Gerencia General',
    email: 'gerente@demo.local',
    roles: [{ rol: 'gerente', agenciaId: null }],
  },
};

export async function sesionActual(): Promise<SesionUsuario | null> {
  const reqCookies = await cookies();
  const demoRol = reqCookies.get('demo_rol')?.value || 'operador';
  const cfg = ROL_CONFIG[demoRol] || ROL_CONFIG.operador || ROL_CONFIG.todos;

  // Buscar el id real del usuario en la base de datos para no violar FK de creado_por / actor_id
  let realId = 'd4b0b565-c724-11f1-9234-78ac4432fe0b'; // id real de operador en MySQL
  try {
    const userRow = await q1<any>(pool, 'SELECT id FROM usuario WHERE email=? LIMIT 1', [cfg.email]);
    if (userRow?.id) {
      realId = userRow.id;
    } else {
      const primerUser = await q1<any>(pool, 'SELECT id FROM usuario LIMIT 1');
      if (primerUser?.id) realId = primerUser.id;
    }
  } catch {
    // Si la BD no responde, mantener fallback
  }

  return {
    id: realId,
    nombre: cfg.nombre,
    email: cfg.email,
    roles: cfg.roles,
  };
}
