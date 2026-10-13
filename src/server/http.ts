import { z } from 'zod';
import { sesionActual } from './auth';
import { ErrorNegocio } from './comun';
import { puede, type SesionUsuario } from '@/shared/permisos';

interface Ctx<B> { user: SesionUsuario; body: B; req: Request; params: Record<string, string>; url: URL }

/**
 * Envoltorio de rutas: sesion, permiso, validacion Zod y errores uniformes.
 * permiso: null = basta con estar logueado. 'publico' = sin sesion.
 */
export function api<S extends z.ZodTypeAny = z.ZodUndefined>(
  opts: { permiso: string | null | 'publico'; schema?: S },
  fn: (c: Ctx<z.infer<S>>) => Promise<unknown>,
) {
  return async (req: Request, ctx: { params: Promise<any> }): Promise<Response> => {
    try {
      const url = new URL(req.url);
      let user = null as SesionUsuario | null;
      if (opts.permiso !== 'publico') {
        user = await sesionActual();
        if (!user) throw new ErrorNegocio('NO_AUTENTICADO', 'Inicia sesion', undefined, 401);
        if (opts.permiso && !puede(user, opts.permiso)) throw new ErrorNegocio('SIN_PERMISO', 'No tienes permiso para esto', undefined, 403);
      }
      let body: any = undefined;
      if (opts.schema) {
        const raw = req.method === 'GET' || req.method === 'DELETE' ? Object.fromEntries(url.searchParams) : await req.json().catch(() => ({}));
        body = opts.schema.parse(raw);
      }
      const params: Record<string, string> = ctx?.params ? await ctx.params : {};
      const out = await fn({ user: user as SesionUsuario, body, req, params, url });
      if (out instanceof Response) return out;
      return Response.json(out ?? { ok: true });
    } catch (e: any) {
      if (e instanceof z.ZodError) {
        return Response.json({ error: 'DATOS_INVALIDOS', mensaje: e.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ') }, { status: 400 });
      }
      if (e instanceof ErrorNegocio) {
        return Response.json({ error: e.codigo, mensaje: e.mensaje, detalle: e.detalle }, { status: e.status });
      }
      console.error('[api]', e);
      return Response.json({ error: 'ERROR_INTERNO', mensaje: 'Error interno del servidor' }, { status: 500 });
    }
  };
}
