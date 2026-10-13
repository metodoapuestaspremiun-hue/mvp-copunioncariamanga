import { randomUUID } from 'node:crypto';

export interface EnviadorMensajes { nombre: string; enviar(telefono: string, texto: string): Promise<{ id: string }>; }

export const simulado: EnviadorMensajes = {
  nombre: 'simulado',
  async enviar() { return { id: 'sim-' + randomUUID() }; },
};

/** Evolution API. VERIFICAR el formato del cuerpo contra la documentacion de TU version. */
export const evolution: EnviadorMensajes = {
  nombre: 'evolution',
  async enviar(telefono, texto) {
    const url = process.env.EVOLUTION_URL?.replace(/\/$/, '');
    const inst = process.env.EVOLUTION_INSTANCE;
    const key = process.env.EVOLUTION_API_KEY;
    if (!url || !inst || !key) throw new Error('Evolution no configurado (EVOLUTION_URL / INSTANCE / API_KEY)');
    const v1 = (process.env.EVOLUTION_API_VERSION || 'v2') === 'v1';
    const body = v1 ? { number: telefono, textMessage: { text: texto } } : { number: telefono, text: texto };
    const r = await fetch(`${url}/message/sendText/${encodeURIComponent(inst)}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', apikey: key }, body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });
    const txt = await r.text();
    if (!r.ok) throw new Error(`Evolution ${r.status}: ${txt.slice(0, 300)}`);
    let id = 'evo-' + randomUUID();
    try { const j = JSON.parse(txt); id = j?.key?.id ?? j?.id ?? id; } catch { /* ignorar */ }
    return { id };
  },
};
export function proveedorActual(): EnviadorMensajes {
  return (process.env.MENSAJES_PROVEEDOR || 'simulado') === 'evolution' ? evolution : simulado;
}
