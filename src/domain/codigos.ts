// QR, codigo legible y codigo de retiro. Solo usa node:crypto (sin BD ni HTTP).
import { randomBytes, randomInt, createHmac, timingSafeEqual } from 'node:crypto';

const A = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'; // Crockford base32 (sin I, L, O, U)

export function base32(bytes: Uint8Array): string {
  let bits = 0, val = 0, out = '';
  for (const b of bytes) {
    val = (val << 8) | b; bits += 8;
    while (bits >= 5) { out += A[(val >>> (bits - 5)) & 31]; bits -= 5; }
    val &= (1 << bits) - 1;
  }
  if (bits > 0) out += A[(val << (5 - bits)) & 31];
  return out;
}

/** 128 bits aleatorios -> 26 caracteres en mayusculas. */
export const nuevoQrToken = () => base32(randomBytes(16));

/** 8 caracteres aleatorios (40 bits), NO secuencial. Se muestra XXXX-XXXX. */
export function nuevoCodigoLegible(): string {
  let s = ''; for (let i = 0; i < 8; i++) s += A[randomInt(32)];
  return s;
}
export const formatearLegible = (s: string) => `${s.slice(0, 4)}-${s.slice(4)}`;
export const normalizarEntrada = (s: string) =>
  s.toUpperCase().replace(/[\s-]/g, '').replace(/O/g, '0').replace(/[IL]/g, '1');

export const QR_REGEX = /^[0-9A-HJKMNP-TV-Z]{26}$/;

/** Dado lo que lee el escaner o escribe la persona, decide si es QR o codigo legible. */
export function clasificarCodigo(raw: string): { qrToken?: string; codigoLegible?: string } | null {
  const n = normalizarEntrada(raw);
  if (n.length === 26 && QR_REGEX.test(n)) return { qrToken: n };
  if (n.length === 8) return { codigoLegible: n };
  return null;
}

/** Codigo de retiro: 6 digitos. La seguridad es HMAC + caducidad + limite de intentos ATOMICO. */
export const nuevoCodigoRetiro = () => String(randomInt(1_000_000)).padStart(6, '0');
export const hmacCodigo = (secreto: string, encomiendaId: string, codigo: string) =>
  createHmac('sha256', secreto).update(`${encomiendaId}:${codigo}`).digest('hex');
export function codigoCoincide(hmacGuardado: string, secreto: string, encomiendaId: string, ingresado: string) {
  const a = Buffer.from(hmacGuardado, 'hex');
  const b = Buffer.from(hmacCodigo(secreto, encomiendaId, ingresado.trim()), 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}
