# Trazabilidad de Encomiendas — Especificación de construcción (v5)
**Cooperativa Unión Transportes Cariamanga**
**Para:** Abel (ejecución técnica) · **De:** Cheche · **Uso interno**
**Base:** v4 (la última iteración). Esta v5 no cambia el alcance de la v4: la convierte en algo construible, cierra 11 huecos técnicos que la v4 dejaba abiertos (sección 2) y añade esquema, código de referencia, pruebas y plan de entrega.

> **Cómo leerlo.** `[DEFECTO]` = decisión técnica por defecto que Cheche puede revertir; vive en configuración o es barata de cambiar. `[BLOQUEANTE]` = depende de la cooperativa; no inventes el valor, deja el parámetro configurable. El código es de **referencia**: TypeScript + PostgreSQL. Si usas otro lenguaje, porta las funciones puras tal cual; lo que importa es la lógica de las secciones 5 a 8.

---

## 1. Qué se construye (y qué no)

**Se construye:** control del recorrido de cada **bulto** (no de la encomienda) desde su recepción hasta su entrega, incluyendo paradas intermedias, cambios de vehículo (redespacho) y de agencia, con evidencia inmutable de quién hizo qué y cuándo. Funciona en paralelo al software actual de la cooperativa, sin integrarse.

**MVP (compromiso):** usuarios, roles y agencias · rutas, paradas y viajes · encomiendas y bultos con QR · tarifas deterministas con entrada manual · manifiesto cerrado y versionado **por parada** · carga, descarga y recepción · redespacho como tarea con plazo · incidencias y excepciones · entrega con verificación del receptor · avisos por WhatsApp · panel por rol · auditoría y CSV · cola de reintento y contingencia sin conexión.

**Fuera (no lo construyas ni lo insinúes en pantallas):** cobros (el sistema **no** registra, señala ni verifica lo cobrado; solo el valor cotizado), facturación, integración con el software actual, GPS o ubicación en vivo, venta de boletos, CRM, video, IA. La cotización por foto es un **experimento opcional en sombra** (sección 9), fuera del plazo base.

## 1.1 Invariantes (si una prueba automática las viola, el build falla)
1. **La tarifa la decide una tabla versionada**, nunca un modelo. Cada cotización guarda la versión usada.
2. **Contar N escaneos no autoriza la salida.** Se concilian bultos únicos y correctos contra el manifiesto vigente.
3. **Eventos inmutables.** Una corrección es un evento nuevo que apunta al anterior. Triggers en BD impiden `UPDATE` y `DELETE`.
4. **Toda transición de estado se valida en el servidor**, con bloqueo por fila y versión optimista. El cliente nunca decide el estado.
5. **Escaneos idempotentes** por `event_id` (UUID v4 generado en el cliente). Reintentar no duplica eventos ni mensajes.
6. **El QR no autoriza nada.** Sin sesión, `/q/:token` responde igual para un token válido y uno inválido (sin estado, sin datos).
7. **Sin conexión no hay autorización normal.** Solo salida tipo B, con supervisor, pendiente de conciliación.
8. **Autorización y salida real son eventos distintos.** Cambiar el manifiesto **invalida** la autorización vigente.
9. **Los bultos que continúan a bordo no cambian de estado** en paradas intermedias.
10. **Una encomienda figura como disponible solo si todos sus bultos lo están.**
11. **Si WhatsApp falla, la operación continúa.** Los avisos salen por una cola (outbox) desacoplada.
12. **Sin datos personales en el QR ni en el código legible.** El código legible no es secuencial.

---

## 2. Huecos de la v4 que esta versión cierra

| # | Hueco en la v4 | Decisión |
|---|---|---|
| G1 | El guardia "no puede modificar el manifiesto", pero **nadie** tiene permiso para armarlo y cerrarlo | Nuevo rol `despachador` (de la agencia origen del viaje). Cambios **después del cierre**: despachador + motivo obligatorio; invalida la autorización y notifica al supervisor. `[DEFECTO]` |
| G2 | "Continúan a bordo" se verifica solo por conteo del ayudante: es el control más débil del diseño | Conteo exacto obligatorio. Parámetro `exigir_reescaneo_continuan` (default `false`) para exigir re-escaneo si el conteo falla. `[DEFECTO]` |
| G3 | Paradas sin agencia: ¿quién recibe un bulto que baja ahí? | `parada.agencia_id` puede ser nulo. Un bulto **no puede bajar ni redespacharse** en una parada sin agencia; se valida al armar el manifiesto. `[BLOQUEANTE]` (bloqueantes 4 y 10 de la v4) |
| G4 | Dolor #1 "se pasan de parada": no se define qué pasa si se escanea una descarga **después** de su parada | Se permite la descarga (manda la realidad física), se abre incidencia `pasado_de_parada` y se crea una tarea de redespacho de retorno. `[DEFECTO]` |
| G5 | El código de retiro "de un solo uso" choca con encomiendas de varios bultos y con la entrega parcial | Un código **por encomienda**, emitido cuando todos los bultos están disponibles. Se consume al completar la entrega. En entrega parcial se invalida y se emite otro para el resto. `[DEFECTO]` |
| G6 | El código se guarda con hash, pero hay que **enviarlo** por WhatsApp | Se genera al encolar el aviso; el outbox guarda los parámetros **cifrados** (AES-GCM) y los **borra** al confirmar el envío. En BD queda solo el HMAC. |
| G7 | La salida tipo B exige supervisor, pero sin conexión no se puede autenticar | PIN de supervisor verificado en el dispositivo contra un hash precargado de los supervisores de esa agencia. El evento queda `verificada_offline=true` y el supervisor lo **confirma** al volver la conexión; si no, aparece en su panel. `[DEFECTO]` |
| G8 | Los estados de la tarea de redespacho (v4 §6.6) no se relacionan con los del bulto | La tarea **no guarda estado propio**: se deriva del bulto y del manifiesto (sección 5.4). Solo guarda `due_at` y `escalado_at`. |
| G9 | Falta un chequeo: bultos que **debían bajar** en la parada y siguen a bordo | La autorización se bloquea si hay bultos con `baja = parada` sin descargar y sin incidencia `faltante` abierta. Con faltante abierto → salida tipo A. `[DEFECTO]` |
| G10 | Orden de eventos con relojes de celulares poco fiables | Se ordena por `recibido_servidor` y, dentro de un lote offline, por `seq_cliente`. La hora declarada es informativa. |
| G11 | El estado de encomienda y tramo es "derivado", pero no se dice cómo | Vistas SQL (sección 4.2), no columnas. |

---

## 3. Stack y estructura

**Stack `[DEFECTO]`** (la v4 pide solo "sencillo y mantenible"; cámbialo si tienes razones):
- **PostgreSQL 15+** como única dependencia de estado. Cola de tareas = tabla outbox + `FOR UPDATE SKIP LOCKED`. **Sin Redis ni microservicios.**
- **Node 20 + TypeScript**, Fastify, validación con Zod, SQL con `pg` o Kysely.
- **PWA** React + Vite; Workbox (shell offline) e IndexedDB (Dexie) para la cola de eventos y el manifiesto precargado. Lectura de QR con `BarcodeDetector` y respaldo `zxing-wasm`; modo continuo; soporte de lector Bluetooth (entra como teclado: input siempre enfocado).
- Archivos (fotos de daños) en almacenamiento tipo S3 separado. Respaldos diarios con **restauración probada** en CI semanal.
- Logs estructurados y alertas de errores y de fallos de notificación.

```
/apps/api
  src/domain/        # funciones PURAS, sin BD (estados, salida, tarifa, codigo)
  src/services/      # transacciones: escaneo, manifiesto, entrega, redespacho
  src/http/          # rutas, auth, permisos
  src/jobs/          # outbox WhatsApp, vencimientos de redespacho
  db/migrations/     # 001_init.sql ...
/apps/web            # PWA
/packages/shared     # tipos, esquemas Zod, roles y permisos
/tests/acceptance    # un test por criterio de aceptación (sección 12)
```
**Regla de oro:** `domain/` no importa nada de BD ni de HTTP. Todo lo crítico (estados, conciliación de salida, tarifa, código de retiro) se prueba sin levantar nada.

## 3.1 Parámetros (tabla `parametro`; nada va "quemado")
| Clave | Defecto | Estado |
|---|---|---|
| `redespacho.plazo_horas` | 12 | `[BLOQUEANTE]` confirmar |
| `retiro.recordatorio_dias` | 3 | por confirmar |
| `codigo_retiro.caducidad_dias` | 7 | por confirmar |
| `codigo_retiro.max_intentos` | 5 | defecto |
| `busqueda_manual.max_por_minuto` | 10 por usuario | defecto |
| `offline.ventana_conciliacion_horas` | 24 | por confirmar |
| `descuento.umbral_supervisor_pct` | 5 | por confirmar |
| `exigir_reescaneo_continuan` | false | defecto |
| `exigir_escaneo_recepcion` | true | lo decide el piloto |
| `whatsapp.max_mensajes_por_encomienda` | 3 | decidido |
| `escaneo.sla_ms_p95` | 1500 | por confirmar |

Los valores numéricos marcados como "defecto" son mi punto de partida para poder construir; **no son datos de la cooperativa**. El factor volumétrico y las tarifas viven en `tarifa_version` y son `[BLOQUEANTE]`.

---

## 4. Base de datos

### 4.1 Esquema (`001_init.sql`)
```sql
create extension if not exists pgcrypto;

create type rol_usuario as enum ('operador','despachador','ayudante','guardia',
  'responsable_agencia','evaluador','supervisor','gerente','admin');
create type bulto_estado as enum ('registrado','pendiente_despacho','cargado','en_transito',
  'descargado','recibido_agencia','pendiente_redespacho','disponible_retiro','entregado',
  'anulado','retenido','devuelto');

create table agencia (id uuid primary key default gen_random_uuid(), nombre text not null,
  ciudad text, activa boolean not null default true);

create table usuario (id uuid primary key default gen_random_uuid(), nombre text not null,
  email text unique not null, password_hash text not null,
  pin_hash text,                       -- solo supervisores (G7)
  activo boolean not null default true);
create table usuario_rol (usuario_id uuid not null references usuario,
  rol rol_usuario not null,
  agencia_id uuid references agencia,  -- null = todas (gerente/admin)
  sustituto_de uuid references usuario);
create unique index on usuario_rol (usuario_id, rol, coalesce(agencia_id,'00000000-0000-0000-0000-000000000000'));

create table ruta (id uuid primary key default gen_random_uuid(), nombre text not null);
create table parada (id uuid primary key default gen_random_uuid(),
  ruta_id uuid not null references ruta, orden int not null, nombre text not null,
  agencia_id uuid references agencia,            -- null = parada sin agencia (G3)
  tiene_guardia boolean not null default false,
  unique (ruta_id, orden));

create table viaje (id uuid primary key default gen_random_uuid(),
  ruta_id uuid not null references ruta, fecha date not null,
  vehiculo text not null, conductor text,
  estado text not null default 'planificado'
    check (estado in ('planificado','manifiesto_cerrado','en_ruta','cerrado')),
  parada_actual int not null default 1);

-- Tarifas
create table tarifa_version (id uuid primary key default gen_random_uuid(),
  vigente_desde date not null, factor_volumetrico int not null,   -- cm3 por kg
  creada_por uuid references usuario, creada_at timestamptz default now());
create table tarifa_regla (id uuid primary key default gen_random_uuid(),
  tarifa_version_id uuid not null references tarifa_version,
  origen_agencia_id uuid not null references agencia,
  destino_agencia_id uuid not null references agencia,
  peso_fact_desde_g int not null, peso_fact_hasta_g int not null,
  precio_cent int not null check (precio_cent >= 0),
  check (peso_fact_hasta_g > peso_fact_desde_g));

-- Encomienda y bultos
create table encomienda (id uuid primary key default gen_random_uuid(),
  codigo text unique not null,
  origen_agencia_id uuid not null references agencia,
  destino_agencia_id uuid not null references agencia,
  remitente_nombre text not null, remitente_tel text,
  dest_nombre text not null, dest_tel text,
  contenido_declarado text, valor_declarado_cent int,
  ref_externa text,                    -- n.º de guía/factura del sistema actual
  creado_por uuid references usuario, creado_at timestamptz default now());

create table bulto (id uuid primary key default gen_random_uuid(),
  encomienda_id uuid not null references encomienda, numero int not null,
  qr_token text unique not null,       -- 16 bytes aleatorios, base32
  codigo_legible text unique not null, -- 8 car. Crockford; NO secuencial
  peso_g int not null, largo_mm int, ancho_mm int, alto_mm int,
  estado bulto_estado not null default 'registrado',
  estado_previo bulto_estado,          -- para liberar un 'retenido'
  version int not null default 0,      -- bloqueo optimista
  viaje_actual_id uuid references viaje,
  agencia_custodia_id uuid references agencia,
  unique (encomienda_id, numero));

create table bulto_tramo (id uuid primary key default gen_random_uuid(),
  bulto_id uuid not null references bulto, orden int not null,
  desde_agencia_id uuid not null references agencia,
  hasta_agencia_id uuid not null references agencia,
  unique (bulto_id, orden));

-- Manifiesto por versión. "Continúa" NO se guarda: se deriva (sube < p < baja)
create table manifiesto (id uuid primary key default gen_random_uuid(),
  viaje_id uuid not null references viaje, version int not null,
  cerrado_at timestamptz, cerrado_por uuid references usuario, motivo_cambio text,
  unique (viaje_id, version));
create table manifiesto_item (manifiesto_id uuid not null references manifiesto,
  bulto_id uuid not null references bulto,
  bulto_tramo_id uuid not null references bulto_tramo,
  sube_orden int not null, baja_orden int not null,
  primary key (manifiesto_id, bulto_id, bulto_tramo_id),
  check (sube_orden < baja_orden));

create table autorizacion_salida (id uuid primary key default gen_random_uuid(),
  viaje_id uuid not null references viaje, parada_orden int not null,
  manifiesto_version int not null,
  tipo text not null check (tipo in ('normal','excepcion_a','excepcion_b')),
  solicitado_por uuid references usuario,   -- quien pide la excepción; debe ser distinto de autorizado_por
  autorizado_por uuid not null references usuario,
  autorizado_at timestamptz not null default now(),
  motivo text, conteo_continuan int,
  verificada_offline boolean not null default false,
  confirmada_por uuid references usuario, confirmada_at timestamptz,
  invalidada_at timestamptz, invalidada_motivo text,
  salida_real_at timestamptz, salida_real_por uuid references usuario,
  conciliada_at timestamptz, conciliada_por uuid references usuario,
  check (tipo = 'normal' or (motivo is not null and solicitado_por is not null and solicitado_por <> autorizado_por)));
create unique index uq_autorizacion_vigente on autorizacion_salida (viaje_id, parada_orden)
  where invalidada_at is null;

-- Eventos: inmutables
create table evento (id uuid primary key,             -- lo genera el cliente
  tipo text not null, resultado text,
  bulto_id uuid references bulto, viaje_id uuid references viaje, parada_orden int,
  actor_id uuid not null references usuario, device_id text,
  ocurrido_declarado timestamptz, seq_cliente bigint,
  recibido_servidor timestamptz not null default now(),
  payload jsonb not null default '{}',
  corrige_evento_id uuid references evento);
create function evento_inmutable() returns trigger language plpgsql as
$$ begin raise exception 'evento es inmutable'; end $$;
create trigger t_evento_inmutable before update or delete on evento
  for each row execute function evento_inmutable();
create index on evento (bulto_id, recibido_servidor);

create table incidencia (id uuid primary key default gen_random_uuid(),
  tipo text not null check (tipo in ('faltante','sobrante','descarga_incorrecta','dano',
    'etiqueta_ilegible','redespacho_vencido','retiro_vencido','discrepancia_recepcion',
    'pasado_de_parada')),
  bulto_id uuid references bulto, viaje_id uuid references viaje,
  abierta_por_evento uuid references evento, abierta_at timestamptz default now(),
  resuelta_por_evento uuid references evento, resuelta_at timestamptz, nota text);

create table redespacho (id uuid primary key default gen_random_uuid(),
  bulto_id uuid not null references bulto,
  agencia_resp_id uuid not null references agencia,
  recibido_at timestamptz not null, due_at timestamptz not null,
  escalado_at timestamptz, cerrado_at timestamptz);

create table cotizacion (id uuid primary key default gen_random_uuid(),
  encomienda_id uuid not null references encomienda,
  via text not null check (via in ('manual','foto')),
  tarifa_version_id uuid references tarifa_version, regla_id uuid references tarifa_regla,
  peso_total_g int, peso_fact_g int, valor_cent int not null,
  sin_regla boolean not null default false,
  responsable_id uuid not null references usuario, motivo text, foto jsonb,
  check (not sin_regla or motivo is not null));
create table ajuste_cotizacion (id uuid primary key default gen_random_uuid(),
  cotizacion_id uuid not null references cotizacion,
  propuesto_por uuid not null references usuario,
  monto_cent int, porcentaje numeric(5,2), motivo text not null,
  aprobado_por uuid references usuario, aprobado_at timestamptz,
  creado_at timestamptz default now());

create table codigo_retiro (id uuid primary key default gen_random_uuid(),
  encomienda_id uuid not null references encomienda, hmac text not null,
  expira_at timestamptz not null, intentos int not null default 0,
  consumido_at timestamptz, invalidado_at timestamptz);
create unique index uq_codigo_vigente on codigo_retiro (encomienda_id)
  where consumido_at is null and invalidado_at is null;

create table entrega (id uuid primary key default gen_random_uuid(),
  encomienda_id uuid not null references encomienda,
  parcial boolean not null default false,
  entregado_por uuid not null references usuario,
  metodo text not null check (metodo in ('codigo','documento','tercero')),
  receptor_nombre text not null, receptor_doc text,
  autorizado_por uuid references usuario, motivo text, at timestamptz default now(),
  check (not parcial or (autorizado_por is not null and motivo is not null)));
create table entrega_bulto (entrega_id uuid not null references entrega,
  bulto_id uuid not null references bulto, primary key (entrega_id, bulto_id));

create table notificacion (id uuid primary key default gen_random_uuid(),
  dedupe_key text unique not null,        -- 'enc:{id}:disponible:{tel}'
  encomienda_id uuid references encomienda, destinatario_tel text not null,
  plantilla text not null, params_cifrados bytea,
  estado text not null default 'pendiente'
    check (estado in ('pendiente','enviando','enviada','entregada','leida','fallida','descartada')),
  intentos int not null default 0, next_attempt_at timestamptz not null default now(),
  proveedor_msg_id text, ultimo_error text, creado_at timestamptz default now());

create table parametro (clave text primary key, valor jsonb not null);
create table audit_log (id bigserial primary key, actor_id uuid, accion text not null,
  entidad text, entidad_id text, antes jsonb, despues jsonb, at timestamptz default now());
```

### 4.2 Vistas derivadas (G11)
```sql
-- Disponible solo si TODOS los bultos no anulados están disponibles o ya entregados (entrega parcial)
create view v_encomienda_estado as
select e.id,
  case
    when bool_and(b.estado = 'entregado') then 'entregada'
    when bool_and(b.estado in ('disponible_retiro','entregado')) then 'disponible_retiro'
    when bool_or(b.estado = 'disponible_retiro') then 'parcialmente_disponible'
    when bool_or(b.estado in ('cargado','en_transito')) then 'en_transito'
    else 'en_proceso' end as estado,
  count(*) as bultos
from encomienda e join bulto b on b.encomienda_id = e.id
where b.estado <> 'anulado'
group by e.id;
```

### 4.3 Consulta del manifiesto por parada `p` (la pieza central de la v4)
Para el bulto en el tramo con `sube_orden = s` y `baja_orden = d`:
- **Suben** en p: `s = p` · **Bajan** en p: `d = p` · **Continúan** en p: `s < p < d`
- **Esperado a bordo al salir de p** = suben ∪ continúan ⇔ `s <= p and d > p`

```sql
-- $1 viaje, $2 parada (orden)
select mi.bulto_id,
  case when mi.baja_orden  = $2 then 'baja'
       when mi.sube_orden  = $2 then 'sube'
       else 'continua' end as rol_en_parada
from manifiesto_item mi
join manifiesto m on m.id = mi.manifiesto_id
where m.viaje_id = $1
  and m.version = (select max(version) from manifiesto
                   where viaje_id = $1 and cerrado_at is not null)
  and mi.sube_orden <= $2 and mi.baja_orden >= $2;
```

---

## 5. Dominio puro (`apps/api/src/domain/`)

Todo este módulo es determinista y sin E/S. Es lo primero que se escribe y lo primero que se prueba.

### 5.1 `estados.ts` — máquina de estados del bulto
```ts
export type Estado =
  | 'registrado' | 'pendiente_despacho' | 'cargado' | 'en_transito' | 'descargado'
  | 'recibido_agencia' | 'pendiente_redespacho' | 'disponible_retiro' | 'entregado'
  | 'anulado' | 'retenido' | 'devuelto';

export type Accion =
  | 'cerrar_manifiesto' | 'cargar' | 'salida_real' | 'descargar' | 'recibir' | 'entregar';

// Única fuente de verdad de las transiciones normales.
const T: Record<Accion, Partial<Record<Estado, Estado>>> = {
  cerrar_manifiesto: { registrado: 'pendiente_despacho', pendiente_redespacho: 'pendiente_despacho' },
  cargar:            { pendiente_despacho: 'cargado' },
  salida_real:       { cargado: 'en_transito' },   // en_transito + salida_real = sin cambio (continúa a bordo)
  descargar:         { en_transito: 'descargado' },
  recibir:           { descargado: 'recibido_agencia' },
  entregar:          { disponible_retiro: 'entregado' },
};

export class TransicionInvalida extends Error {
  constructor(public estado: Estado, public accion: Accion | string) {
    super(`No se puede '${accion}' desde '${estado}'`);
  }
}

export function transitar(e: Estado, a: Accion): Estado {
  const n = T[a][e];
  if (!n) throw new TransicionInvalida(e, a);
  return n;
}

/** Tras 'recibido_agencia' el sistema decide el siguiente estado automáticamente. */
export function tras_recepcion(agenciaRecepcionId: string, destinoFinalId: string):
  'disponible_retiro' | 'pendiente_redespacho' {
  return agenciaRecepcionId === destinoFinalId ? 'disponible_retiro' : 'pendiente_redespacho';
}

// Estados especiales (siempre con permiso, motivo y evento vinculado)
const ANULABLES: Estado[] = ['registrado', 'pendiente_despacho', 'pendiente_redespacho'];
const RETENIBLES: Estado[] = ['registrado', 'pendiente_despacho', 'cargado', 'en_transito',
  'descargado', 'recibido_agencia', 'pendiente_redespacho', 'disponible_retiro'];

export function anular(e: Estado): Estado {
  if (!ANULABLES.includes(e)) throw new TransicionInvalida(e, 'anular');
  return 'anulado';
}
export function retener(e: Estado): { nuevo: Estado; previo: Estado } {
  if (!RETENIBLES.includes(e)) throw new TransicionInvalida(e, 'retener');
  return { nuevo: 'retenido', previo: e };
}
export function liberar(e: Estado, previo: Estado | null): Estado {
  if (e !== 'retenido' || !previo) throw new TransicionInvalida(e, 'liberar');
  return previo;
}
export const BLOQUEADOS_PARA_CARGA: Estado[] = ['anulado', 'retenido', 'devuelto', 'entregado'];
```

### 5.2 `escaneo.ts` — decisión de un escaneo (carga o descarga)
```ts
import { Estado, BLOQUEADOS_PARA_CARGA } from './estados';

export type TipoEscaneo = 'carga' | 'descarga';
export type ResultadoEscaneo =
  | 'ok' | 'repetido' | 'ya_a_bordo' | 'no_esperado' | 'conflicto_asignacion'
  | 'bloqueado' | 'descarga_incorrecta' | 'debia_continuar' | 'desconocido';

export interface EntradaEscaneo {
  tipo: TipoEscaneo;
  parada: number;                        // orden de la parada donde se escanea
  viajeCmd: string;                      // viaje desde el que se escanea
  estado: Estado;
  viajeBulto: string | null;             // viaje_actual_id del bulto
  item: { sube: number; baja: number } | null; // ítem en el manifiesto VIGENTE de viajeCmd
}
export interface DecisionEscaneo {
  resultado: ResultadoEscaneo;
  nuevoEstado?: Estado;
  incidencia?: 'sobrante' | 'descarga_incorrecta' | 'pasado_de_parada';
  alerta?: string;                       // texto para la pantalla
}

export function decidirEscaneo(i: EntradaEscaneo): DecisionEscaneo {
  if (BLOQUEADOS_PARA_CARGA.includes(i.estado)) {
    return { resultado: 'bloqueado', alerta: `Bulto ${i.estado}: no se puede operar` };
  }
  return i.tipo === 'carga' ? decidirCarga(i) : decidirDescarga(i);
}

function decidirCarga(i: EntradaEscaneo): DecisionEscaneo {
  if (i.estado === 'cargado' && i.viajeBulto === i.viajeCmd) return { resultado: 'repetido' };
  if ((i.estado === 'cargado' || i.estado === 'en_transito') && i.viajeBulto && i.viajeBulto !== i.viajeCmd) {
    return { resultado: 'conflicto_asignacion', alerta: 'Cargado en otro viaje activo' };
  }
  if (!i.item) {
    return { resultado: 'no_esperado', incidencia: 'sobrante', alerta: 'No pertenece a este viaje' };
  }
  // Continúa a bordo: informativo, sin cambio de estado (invariante 9)
  if (i.estado === 'en_transito' && i.item.sube < i.parada && i.item.baja > i.parada) {
    return { resultado: 'ya_a_bordo' };
  }
  if (i.item.sube !== i.parada) {
    return { resultado: 'no_esperado', alerta: 'No se carga en esta parada' };
  }
  if (i.estado !== 'pendiente_despacho') {
    return { resultado: 'conflicto_asignacion', alerta: `Estado actual: ${i.estado}` };
  }
  return { resultado: 'ok', nuevoEstado: 'cargado' };
}

function decidirDescarga(i: EntradaEscaneo): DecisionEscaneo {
  if (i.estado === 'descargado' || i.estado === 'recibido_agencia') return { resultado: 'repetido' };
  if (!i.item || i.viajeBulto !== i.viajeCmd) {
    // v4 criterio 6: no cambia nada en silencio
    return { resultado: 'descarga_incorrecta', incidencia: 'descarga_incorrecta',
             alerta: 'Este bulto no viene en este viaje' };
  }
  if (i.estado !== 'en_transito') {
    return { resultado: 'conflicto_asignacion', alerta: `Estado actual: ${i.estado}` };
  }
  if (i.item.sube < i.parada && i.item.baja > i.parada) {
    // v4 §6.5 / criterio 21: debía continuar
    return { resultado: 'debia_continuar', incidencia: 'descarga_incorrecta',
             alerta: 'Este bulto CONTINÚA a bordo. No lo baje.' };
  }
  if (i.item.baja === i.parada) return { resultado: 'ok', nuevoEstado: 'descargado' };
  if (i.item.baja < i.parada) {
    // G4: se pasó de parada. La realidad física manda; queda incidencia y retorno.
    return { resultado: 'ok', nuevoEstado: 'descargado', incidencia: 'pasado_de_parada',
             alerta: 'Se pasó de su parada: queda incidencia y tarea de retorno' };
  }
  return { resultado: 'conflicto_asignacion' };
}
```

### 5.3 `salida.ts` — conciliación para autorizar la salida de una parada
Es la regla más importante del sistema. **No cuenta escaneos: concilia conjuntos.**
```ts
export type RolEnParada = 'sube' | 'continua' | 'baja';
export interface ItemParada { bultoId: string; rol: RolEnParada }

export interface EntradaSalida {
  online: boolean;
  items: ItemParada[];                  // manifiesto vigente, filtrado a esta parada
  cargadosValidos: Set<string>;         // bultos 'sube' con carga válida (conjunto => únicos)
  descargados: Set<string>;             // bultos 'baja' ya descargados
  faltantesAbiertos: Set<string>;       // incidencias 'faltante' abiertas
  conteoContinuan: number | null;       // conteo del ayudante
  reescaneados: Set<string>;            // solo se usa si exigirReescaneo
  exigirReescaneo: boolean;
  conflictosCriticos: number;           // incidencias sobrante/descarga_incorrecta sin resolver
  pendientesSync: number;               // eventos locales aún no confirmados por el servidor
}

export type CodigoBloqueo =
  | 'sin_conexion' | 'conflicto_critico' | 'pendiente_sync'
  | 'carga_incompleta' | 'baja_pendiente' | 'faltante_abierto'
  | 'conteo_continuan_faltante' | 'conteo_continuan_no_coincide';
export interface Bloqueo { codigo: CodigoBloqueo; bultos?: string[]; esperado?: number; recibido?: number }

export interface ResultadoSalida {
  normalPermitida: boolean;
  excepcionPermitida: 'A' | 'B' | null;
  bloqueos: Bloqueo[];
  esperadoABordo: number;               // continúan + suben
}

// Bloqueos que un supervisor puede autorizar como excepción tipo A.
// 'conflicto_critico' y 'pendiente_sync' NO: primero se resuelven.
const EXCEPCIONABLES = new Set<CodigoBloqueo>([
  'carga_incompleta', 'baja_pendiente', 'faltante_abierto',
  'conteo_continuan_faltante', 'conteo_continuan_no_coincide',
]);

export function evaluarSalida(e: EntradaSalida): ResultadoSalida {
  const sube = e.items.filter(i => i.rol === 'sube').map(i => i.bultoId);
  const continua = e.items.filter(i => i.rol === 'continua').map(i => i.bultoId);
  const baja = e.items.filter(i => i.rol === 'baja').map(i => i.bultoId);
  const bloqueos: Bloqueo[] = [];

  // 1) Suben: cada uno debe estar cargado (por identidad, no por conteo)
  const sinCarga = sube.filter(id => !e.cargadosValidos.has(id));
  const sinCargaConFaltante = sinCarga.filter(id => e.faltantesAbiertos.has(id));
  const sinCargaSolo = sinCarga.filter(id => !e.faltantesAbiertos.has(id));
  if (sinCargaSolo.length) bloqueos.push({ codigo: 'carga_incompleta', bultos: sinCargaSolo });
  if (sinCargaConFaltante.length) bloqueos.push({ codigo: 'faltante_abierto', bultos: sinCargaConFaltante });

  // 2) Bajan: deben estar descargados (G9)
  const sinBajar = baja.filter(id => !e.descargados.has(id));
  const sinBajarConFaltante = sinBajar.filter(id => e.faltantesAbiertos.has(id));
  const sinBajarSolo = sinBajar.filter(id => !e.faltantesAbiertos.has(id));
  if (sinBajarSolo.length) bloqueos.push({ codigo: 'baja_pendiente', bultos: sinBajarSolo });
  if (sinBajarConFaltante.length) bloqueos.push({ codigo: 'faltante_abierto', bultos: sinBajarConFaltante });

  // 3) Continúan: conteo exacto (G2) o, si el parámetro lo exige, re-escaneo por identidad
  if (continua.length > 0) {
    if (e.exigirReescaneo) {
      const falta = continua.filter(id => !e.reescaneados.has(id));
      if (falta.length) bloqueos.push({ codigo: 'conteo_continuan_no_coincide', bultos: falta });
    } else if (e.conteoContinuan === null) {
      bloqueos.push({ codigo: 'conteo_continuan_faltante', esperado: continua.length });
    } else if (e.conteoContinuan !== continua.length) {
      bloqueos.push({ codigo: 'conteo_continuan_no_coincide',
                      esperado: continua.length, recibido: e.conteoContinuan });
    }
  }

  // 4) Conflictos y sincronización
  if (e.conflictosCriticos > 0) bloqueos.push({ codigo: 'conflicto_critico', recibido: e.conflictosCriticos });
  if (e.pendientesSync > 0) bloqueos.push({ codigo: 'pendiente_sync', recibido: e.pendientesSync });

  const esperadoABordo = continua.length + sube.length;

  // 5) Sin conexión: nunca autorización normal (invariante 7); solo tipo B
  if (!e.online) {
    return { normalPermitida: false, excepcionPermitida: 'B',
             bloqueos: [{ codigo: 'sin_conexion' }, ...bloqueos], esperadoABordo };
  }
  if (bloqueos.length === 0) {
    return { normalPermitida: true, excepcionPermitida: null, bloqueos, esperadoABordo };
  }
  const todosExcepcionables = bloqueos.every(b => EXCEPCIONABLES.has(b.codigo));
  return { normalPermitida: false, excepcionPermitida: todosExcepcionables ? 'A' : null,
           bloqueos, esperadoABordo };
}
```

### 5.4 Redespacho: estado derivado (G8)
La tarea de redespacho no tiene columna de estado. Se deriva así:

| Estado de la tarea (v4 §6.6) | Condición |
|---|---|
| Pendiente de asignación | `bulto.estado = 'pendiente_redespacho'` y no está en ningún manifiesto abierto (borrador) |
| Asignado | el bulto figura en un manifiesto **abierto** (sin `cerrado_at`) |
| Pendiente de carga | `bulto.estado = 'pendiente_despacho'` (manifiesto cerrado, sin cargar) |
| Despachado | `bulto.estado in ('cargado','en_transito')` o posterior → la tarea se cierra (`cerrado_at`) |

> **Nota de consistencia con la v4.** La v4 decía que el bulto pasa a *Pendiente de despacho* "por asignación a un manifiesto" y, en otra fila, "en manifiesto cerrado". Aquí se fija: **pasa a *Pendiente de despacho* al CERRAR el manifiesto**. Mientras el manifiesto es borrador, el bulto conserva su estado y la asignación es solo un ítem del borrador.

### 5.5 `tarifa.ts` — motor determinista
```ts
export interface BultoMedidas { pesoG: number; largoMm?: number; anchoMm?: number; altoMm?: number }
export interface Regla { id: string; desdeG: number; hastaG: number; precioCent: number } // desde <= p < hasta
export interface ResultadoCotizacion {
  valorCent: number; reglaIds: string[]; sinRegla: boolean;
  detalle: { numero: number; pesoFactG: number; reglaId: string | null; precioCent: number }[];
}

/** Peso volumétrico en gramos, con enteros: mm³ / (cm³ por kg)  ==  gramos. */
export function pesoVolumetricoG(largoMm: number, anchoMm: number, altoMm: number, factorCm3PorKg: number): number {
  const vol = largoMm * anchoMm * altoMm;                       // mm³
  return Math.floor((vol + factorCm3PorKg - 1) / factorCm3PorKg); // ceil entero
}
export function pesoFacturableG(b: BultoMedidas, factor: number): number {
  const { largoMm: l, anchoMm: a, altoMm: h } = b;
  if (l && a && h) return Math.max(b.pesoG, pesoVolumetricoG(l, a, h, factor));
  return b.pesoG;
}

/** Modo por defecto: precio por bulto, sumado. [BLOQUEANTE] confirmar si la tarifa real es por bulto o por encomienda. */
export function cotizar(bultos: BultoMedidas[], reglas: Regla[], factor: number): ResultadoCotizacion {
  let total = 0, sinRegla = false;
  const detalle: ResultadoCotizacion['detalle'] = [];
  bultos.forEach((b, idx) => {
    const pf = pesoFacturableG(b, factor);
    const r = reglas.find(x => pf >= x.desdeG && pf < x.hastaG) ?? null;
    if (!r) sinRegla = true;               // NO se inventa tarifa: exige cotización manual con responsable y motivo
    total += r?.precioCent ?? 0;
    detalle.push({ numero: idx + 1, pesoFactG: pf, reglaId: r?.id ?? null, precioCent: r?.precioCent ?? 0 });
  });
  return { valorCent: sinRegla ? 0 : total, reglaIds: detalle.flatMap(d => d.reglaId ? [d.reglaId] : []),
           sinRegla, detalle };
}

/** ¿Un ajuste requiere aprobación de supervisor? (umbral configurable) */
export function ajusteRequiereSupervisor(valorCent: number, ajuste: { montoCent?: number; porcentaje?: number },
                                          umbralPct: number): boolean {
  const pct = ajuste.porcentaje ?? (valorCent > 0 ? (100 * (ajuste.montoCent ?? 0)) / valorCent : 100);
  return pct > umbralPct;
}
```
Si `sinRegla`, la UI obliga a un **evaluador** (o a registrar una cotización manual con responsable y motivo: `cotizacion.sin_regla = true`). **No hay precio por defecto.**

### 5.6 `codigos.ts` — QR, código legible y código de retiro
```ts
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

/** Token del QR: 128 bits aleatorios -> 26 caracteres. Mayúsculas => QR más compacto (modo alfanumérico). */
export const nuevoQrToken = () => base32(randomBytes(16));

/** Código legible: 8 caracteres aleatorios (40 bits), NO secuencial. Se muestra como XXXX-XXXX. */
export function nuevoCodigoLegible(): string {
  let s = ''; for (let i = 0; i < 8; i++) s += A[randomInt(32)];
  return s;
}
export const formatearLegible = (s: string) => `${s.slice(0, 4)}-${s.slice(4)}`;
export const normalizarEntrada = (s: string) =>
  s.toUpperCase().replace(/[\s-]/g, '').replace(/O/g, '0').replace(/[IL]/g, '1');

/** Código de retiro: 6 dígitos, aleatorio. Seguridad = HMAC con secreto + caducidad + límite de intentos. */
export const nuevoCodigoRetiro = () => String(randomInt(1_000_000)).padStart(6, '0');
export const hmacCodigo = (secreto: string, encomiendaId: string, codigo: string) =>
  createHmac('sha256', secreto).update(`${encomiendaId}:${codigo}`).digest('hex');
export function codigoCoincide(hmacGuardado: string, secreto: string, encomiendaId: string, ingresado: string) {
  const a = Buffer.from(hmacGuardado, 'hex');
  const b = Buffer.from(hmacCodigo(secreto, encomiendaId, ingresado.trim()), 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}
```
> **Por qué 6 dígitos bastan:** 1.000.000 combinaciones, con secreto del servidor, caducidad y 5 intentos máximos. Lo que protege es el límite de intentos aplicado de forma atómica (sección 6.4), no el tamaño del código. Si el límite no es atómico, no protege nada.

---

## 6. Servicios transaccionales (`apps/api/src/services/`)

Aquí se une el dominio puro con la BD. Reglas comunes: **una transacción por operación**, `SELECT … FOR UPDATE` sobre la fila que cambia, y **todo evento lleva el `id` generado por el cliente**.

> **Importante para `decidirEscaneo`.** Para decidir hay que buscar el ítem del bulto en el manifiesto vigente **sin filtrar por parada** (si no, no se detecta "se pasó de parada" ni "debía continuar"). La consulta de 4.3 es solo para pintar la lista de una parada.

### 6.1 `escanear.ts` — carga y descarga, idempotente
```ts
import { PoolClient } from 'pg';
import { decidirEscaneo, TipoEscaneo } from '../domain/escaneo';

export interface CmdEscaneo {
  eventId: string;            // UUID v4 del cliente
  tipo: TipoEscaneo;
  viajeId: string; parada: number;
  qrToken?: string; codigoLegible?: string;
  actorId: string; deviceId: string;
  declaradoAt?: string; seq?: number;
}

export async function escanear(db: PoolClient, c: CmdEscaneo) {
  await db.query('begin');
  try {
    // Idempotencia primero: si el evento ya existe, devolver lo que se respondió entonces
    const { rows: [prev] } = await db.query('select resultado, payload from evento where id=$1', [c.eventId]);
    if (prev) { await db.query('commit'); return { resultado: prev.resultado, ...prev.payload, repetidoPorReintento: true }; }

    // Bulto por QR o por código legible (este último con límite de intentos, ver 7.3)
    const { rows: [b] } = await db.query(
      `select * from bulto where ${c.qrToken ? 'qr_token' : 'codigo_legible'} = $1 for update`,
      [c.qrToken ?? c.codigoLegible]);

    if (!b) { // QR desconocido: se registra sin bulto
      await db.query(`insert into evento(id,tipo,resultado,viaje_id,parada_orden,actor_id,device_id,ocurrido_declarado,seq_cliente)
                      values($1,$2,'desconocido',$3,$4,$5,$6,$7,$8)`,
        [c.eventId, `escaneo_${c.tipo}`, c.viajeId, c.parada, c.actorId, c.deviceId, c.declaradoAt, c.seq]);
      await db.query('commit'); return { resultado: 'desconocido' as const };
    }

    const { rows: [item] } = await db.query(
      `select mi.sube_orden as sube, mi.baja_orden as baja
         from manifiesto_item mi join manifiesto m on m.id = mi.manifiesto_id
        where m.viaje_id=$1 and mi.bulto_id=$2
          and m.version = (select max(version) from manifiesto where viaje_id=$1 and cerrado_at is not null)
        order by mi.sube_orden limit 1`, [c.viajeId, b.id]);

    const d = decidirEscaneo({ tipo: c.tipo, parada: c.parada, viajeCmd: c.viajeId,
      estado: b.estado, viajeBulto: b.viaje_actual_id, item: item ?? null });

    await db.query(
      `insert into evento(id,tipo,resultado,bulto_id,viaje_id,parada_orden,actor_id,device_id,ocurrido_declarado,seq_cliente,payload)
       values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [c.eventId, `escaneo_${c.tipo}`, d.resultado, b.id, c.viajeId, c.parada, c.actorId, c.deviceId,
       c.declaradoAt, c.seq, JSON.stringify({ alerta: d.alerta, nuevoEstado: d.nuevoEstado })]);

    if (d.nuevoEstado) {
      const r = await db.query(
        `update bulto set estado=$1, version=version+1,
                viaje_actual_id = case when $1='descargado' then null else viaje_actual_id end
          where id=$2 and version=$3`, [d.nuevoEstado, b.id, b.version]);
      if (r.rowCount !== 1) throw new Error('CONFLICTO_CONCURRENCIA');
    }
    if (d.incidencia) {
      await db.query(`insert into incidencia(tipo,bulto_id,viaje_id,abierta_por_evento) values($1,$2,$3,$4)`,
        [d.incidencia, b.id, c.viajeId, c.eventId]);
      if (d.incidencia === 'pasado_de_parada') await crearRedespachoRetorno(db, b.id, c);
    }
    await db.query('commit');
    return { resultado: d.resultado, alerta: d.alerta, bultoId: b.id, codigo: b.codigo_legible };
  } catch (e) { await db.query('rollback'); throw e; }
}
```
> `viaje_actual_id` se fija **al cerrar el manifiesto** (junto con el paso a `pendiente_despacho`) y se limpia al descargar. Es lo que permite detectar "cargado en otro viaje activo".

### 6.2 `manifiesto.ts` — armar, cerrar y modificar
- **Borrador:** el `despachador` agrega bultos (`manifiesto` con `cerrado_at null`). Validaciones al agregar: el bulto está en `registrado` o `pendiente_redespacho`; no está en otro manifiesto de un viaje no cerrado; **su tramo `desde → hasta` coincide con dos paradas del viaje, en orden** (`sube < baja`); ni `sube` ni `baja` caen en una parada sin agencia si la acción exige recepción (G3).
- **Cerrar:** en una transacción: `cerrado_at = now()`, cada bulto `→ pendiente_despacho`, `viaje_actual_id = viaje`, `viaje.estado = 'manifiesto_cerrado'`.
- **Modificar después del cierre (invariante 8):** crear **versión nueva** con `motivo_cambio` obligatorio; `update autorizacion_salida set invalidada_at=now(), invalidada_motivo='manifiesto v{n}' where viaje_id=$1 and invalidada_at is null and salida_real_at is null`; notificar al supervisor. **Prohibido** modificar ítems de paradas cuya salida real ya se registró; para eso se usa redespacho o incidencia.
- Un bulto retirado del manifiesto vuelve a su estado previo y deja evento `retirado_de_manifiesto`.

### 6.3 `salida.ts` — autorizar y registrar la salida real
```ts
export async function autorizarSalida(db: PoolClient, c: {
  viajeId: string; parada: number; actorId: string;
  tipo: 'normal' | 'excepcion_a';
  conteoContinuan: number | null; reescaneados?: string[];
  motivo?: string; solicitadoPor?: string;
}) {
  await db.query('begin');
  try {
    await db.query('select 1 from viaje where id=$1 for update', [c.viajeId]);       // serializa por viaje
    const ctx = await cargarContextoSalida(db, c.viajeId, c.parada);                  // consultas de 4.3 + incidencias + sync
    const r = evaluarSalida({ ...ctx, online: true, conteoContinuan: c.conteoContinuan,
      reescaneados: new Set(c.reescaneados ?? []),
      exigirReescaneo: await param(db, 'exigir_reescaneo_continuan') });

    // ¿Quién puede autorizar? Guardia si la parada tiene guardia; si no, responsable de agencia (v4 §6.4)
    const rolReq = ctx.parada.tiene_guardia ? 'guardia' : 'responsable_agencia';

    if (c.tipo === 'normal') {
      if (!r.normalPermitida) throw new ErrorNegocio('SALIDA_BLOQUEADA', r.bloqueos);
      await exigirRol(db, c.actorId, rolReq, ctx.parada.agencia_id);
    } else {
      if (r.excepcionPermitida !== 'A') throw new ErrorNegocio('NO_EXCEPCIONABLE', r.bloqueos);
      if (!c.motivo?.trim()) throw new ErrorNegocio('MOTIVO_OBLIGATORIO');
      await exigirRol(db, c.actorId, 'supervisor', ctx.parada.agencia_id);
      if (!c.solicitadoPor || c.solicitadoPor === c.actorId) throw new ErrorNegocio('AUTORIZADOR_DISTINTO_DEL_SOLICITANTE');
    }
    const { rows: [a] } = await db.query(
      `insert into autorizacion_salida(viaje_id,parada_orden,manifiesto_version,tipo,solicitado_por,autorizado_por,motivo,conteo_continuan)
       values($1,$2,$3,$4,$5,$6,$7,$8) returning id`,
      [c.viajeId, c.parada, ctx.version, c.tipo, c.solicitadoPor ?? null, c.actorId, c.motivo ?? null, c.conteoContinuan]);
    // una autorización vigente por parada (índice parcial): si ya había, falla con 23505 => 409
    await db.query('commit');
    return { autorizacionId: a.id, esperadoABordo: r.esperadoABordo };
  } catch (e) { await db.query('rollback'); throw e; }
}

export async function registrarSalidaReal(db: PoolClient, c: { viajeId: string; parada: number; actorId: string }) {
  await db.query('begin');
  try {
    await db.query('select 1 from viaje where id=$1 for update', [c.viajeId]);
    const { rows: [a] } = await db.query(
      `select * from autorizacion_salida where viaje_id=$1 and parada_orden=$2 and invalidada_at is null`, [c.viajeId, c.parada]);
    if (!a) throw new ErrorNegocio('SIN_AUTORIZACION_VIGENTE');
    if (a.salida_real_at) throw new ErrorNegocio('SALIDA_YA_REGISTRADA');
    if (a.manifiesto_version !== await versionVigente(db, c.viajeId)) throw new ErrorNegocio('MANIFIESTO_CAMBIO');
    // Solo pasan a en_transito los 'cargado' que SUBEN en esta parada; los que continúan ya están en_transito
    await db.query(
      `update bulto b set estado='en_transito', version=b.version+1
         from manifiesto_item mi join manifiesto m on m.id=mi.manifiesto_id
        where m.viaje_id=$1 and m.version=$2 and mi.bulto_id=b.id and mi.sube_orden=$3 and b.estado='cargado'`,
      [c.viajeId, a.manifiesto_version, c.parada]);
    await db.query(`update autorizacion_salida set salida_real_at=now(), salida_real_por=$2 where id=$1`, [a.id, c.actorId]);
    await db.query(`update viaje set parada_actual=$2, estado='en_ruta' where id=$1`, [c.viajeId, c.parada + 1]);
    await insertarEventoSistema(db, 'salida_real', c);
    await db.query('commit');
  } catch (e) { await db.query('rollback'); throw e; }
}
```
**Salida tipo B (sin conexión).** No pasa por `autorizarSalida`: se registra en el dispositivo y se envía en el siguiente sync como `excepcion_b` con `verificada_offline=true` y `conteo_continuan`. Al llegar, el servidor la crea con `conciliada_at = null`. Se concilia (`conciliada_at`) cuando todos los eventos offline de ese viaje se han procesado y el resultado coincide con el manifiesto; si no coincide, se abren incidencias y el supervisor debe resolverlas **antes de cerrar el viaje**. Cerrar un viaje se rechaza si hay una salida tipo B sin conciliar o sin `confirmada_at`.

### 6.4 `entrega.ts` — código de retiro y entrega
Dos reglas que se rompen fácilmente:
1. **El contador de intentos debe confirmarse aunque la verificación falle.** Si lo incrementas dentro de una transacción que luego hace `rollback`, el atacante tiene intentos infinitos. Se hace en una sentencia atómica **fuera** de la transacción de entrega.
2. La comparación usa `timingSafeEqual` sobre HMAC.

```ts
export async function verificarCodigo(pool: Pool, encomiendaId: string, ingresado: string, secreto: string) {
  // Paso 1 (autocommit): consume un intento de forma atómica.
  // Si no devuelve fila: vencido, usado o sin intentos => verificación alternativa (documento).
  const { rows: [c] } = await pool.query(
    `update codigo_retiro set intentos = intentos + 1
      where encomienda_id=$1 and consumido_at is null and invalidado_at is null
        and expira_at > now() and intentos < $2
      returning id, hmac, intentos`, [encomiendaId, await param(pool, 'codigo_retiro.max_intentos')]);
  if (!c) return { ok: false as const, motivo: 'NO_VIGENTE_O_AGOTADO' };
  return codigoCoincide(c.hmac, secreto, encomiendaId, ingresado)
    ? { ok: true as const, codigoId: c.id }
    : { ok: false as const, motivo: 'INCORRECTO', intentosUsados: c.intentos };
}

export async function entregar(db: PoolClient, c: {
  encomiendaId: string; actorId: string; metodo: 'codigo' | 'documento' | 'tercero';
  codigoId?: string; receptorNombre: string; receptorDoc?: string;
  supervisorId?: string; motivo?: string;
}) {
  await db.query('begin');
  try {
    const { rows: bultos } = await db.query(
      `select id, estado from bulto where encomienda_id=$1 and estado<>'anulado' for update`, [c.encomiendaId]);
    const disp = bultos.filter(b => b.estado === 'disponible_retiro');
    const pendientes = bultos.filter(b => !['disponible_retiro', 'entregado'].includes(b.estado));
    if (disp.length === 0) throw new ErrorNegocio('NADA_DISPONIBLE');

    const parcial = pendientes.length > 0;
    if (parcial) {
      // Solo con faltante ABIERTO, permiso de supervisor y motivo (criterio 19)
      if (!(await hayFaltanteAbierto(db, pendientes.map(b => b.id)))) throw new ErrorNegocio('PARCIAL_SIN_FALTANTE_ABIERTO');
      if (!c.supervisorId || !c.motivo?.trim()) throw new ErrorNegocio('PARCIAL_REQUIERE_SUPERVISOR_Y_MOTIVO');
      await exigirRol(db, c.supervisorId, 'supervisor');
    }
    if (c.metodo === 'codigo' && !c.codigoId) throw new ErrorNegocio('CODIGO_NO_VERIFICADO');
    if (c.metodo !== 'codigo' && !c.receptorDoc) throw new ErrorNegocio('DOCUMENTO_OBLIGATORIO');

    const { rows: [e] } = await db.query(
      `insert into entrega(encomienda_id,parcial,entregado_por,metodo,receptor_nombre,receptor_doc,autorizado_por,motivo)
       values($1,$2,$3,$4,$5,$6,$7,$8) returning id`,
      [c.encomiendaId, parcial, c.actorId, c.metodo, c.receptorNombre, c.receptorDoc ?? null, c.supervisorId ?? null, c.motivo ?? null]);
    for (const b of disp) {
      await db.query(`insert into entrega_bulto values($1,$2)`, [e.id, b.id]);
      await db.query(`update bulto set estado='entregado', version=version+1 where id=$1`, [b.id]);
    }
    if (c.codigoId) await db.query(`update codigo_retiro set consumido_at=now() where id=$1`, [c.codigoId]);
    // Parcial: el código queda consumido; se emite uno nuevo cuando el resto esté disponible (G5)
    await db.query('commit');
  } catch (e) { await db.query('rollback'); throw e; }
}
```
> Una entrega parcial **no** cierra la encomienda: `v_encomienda_estado` la sigue mostrando como pendiente mientras haya bultos sin entregar (v4 §6.7).

### 6.5 `recepcion.ts` — recibir en agencia
```ts
// Tras confirmar la descarga, la agencia confirma bulto por bulto: transitar(estado,'recibir')
const sig = tras_recepcion(agenciaQueRecibe, encomienda.destino_agencia_id);
if (sig === 'pendiente_redespacho') {
  await db.query(`insert into redespacho(bulto_id,agencia_resp_id,recibido_at,due_at)
                  values($1,$2,now(), now() + ($3 || ' hours')::interval)`, [bultoId, agenciaQueRecibe, plazoHoras]);
  // bulto -> 'pendiente_redespacho'
} else {
  // bulto -> 'disponible_retiro'. Si TODOS los bultos no anulados están disponibles (o ya entregados):
  //   1) invalidar cualquier código anterior (invalidado_at)
  //   2) generar nuevoCodigoRetiro(); guardar hmacCodigo(secreto, encId, codigo) + expira_at
  //   3) encolar notificación 'disponible' con el código CIFRADO en params_cifrados (G6)
}
```
- `exigir_escaneo_recepcion = true`: la recepción exige escanear el bulto. **No existe "recibir todo el lote"** sin verificar cada bulto (v4 §6.5).
- Si el bulto se recibe en una agencia distinta de su destino y sin otro tramo planificado, crear `incidencia: descarga_incorrecta` y una tarea de redespacho; **nunca cambiar el destino en silencio** (criterio 6).

### 6.6 Trabajos en segundo plano (`jobs/`)
```ts
// Outbox WhatsApp: varios workers concurrentes sin duplicar envíos
const { rows } = await db.query(
  `update notificacion set estado='enviando', intentos=intentos+1
    where id in (select id from notificacion
                  where estado in ('pendiente','fallida') and next_attempt_at <= now() and intentos < 8
                  order by next_attempt_at for update skip locked limit 20)
  returning *`);
// éxito  -> estado='enviada', proveedor_msg_id, params_cifrados = null   (se borra el código)
// fallo  -> estado='fallida', ultimo_error, next_attempt_at = now() + backoff exponencial con jitter
// webhook del proveedor -> entregada | leida | fallida (por proveedor_msg_id; idempotente)
// Un worker caído deja filas en 'enviando': un barrido las devuelve a 'pendiente' tras 10 min.
```
- **Deduplicación:** `dedupe_key` único (`enc:{id}:{tipo}:{tel}`); `insert … on conflict do nothing`.
- **Tope por encomienda y destinatario:** 3 mensajes (registro, disponible+código, un recordatorio). Las paradas intermedias **no** generan "ya puedes retirar".
- **Plantillas:** categoría *utility*. Probar en el entorno de Meta que la plantilla con código no sea reclasificada como *authentication*; si lo es, cambian el costo y las reglas.
- **Vencimientos de redespacho** (cada 5 min): `redespacho` con `due_at < now()` y `cerrado_at is null` → incidencia `redespacho_vencido` (una sola vez), mensaje agrupado al responsable por agencia, y al doble del plazo (`escalado_at`) al supervisor. Avisos agrupados por agencia en ventanas de 30 min.
- **Retiro vencido:** igual, con `retiro.recordatorio_dias`.
- **Retención:** job nocturno que aplica la política de retención por tipo de dato `[BLOQUEANTE]`.

---

## 7. API, permisos y seguridad

### 7.1 Endpoints (REST + JSON; todos validan con Zod)
| Método y ruta | Rol | Notas |
|---|---|---|
| `POST /auth/login` · `POST /auth/logout` | todos | Cookie `HttpOnly; Secure; SameSite=Lax` |
| `POST /encomiendas` | operador | Crea encomienda, bultos, cotización y etiquetas en **una** transacción |
| `GET /encomiendas/:id` · `GET /encomiendas?q=` | según agencia | Filtro por agencia obligatorio en servidor |
| `POST /cotizaciones/calcular` | operador | Puro; devuelve detalle o `sinRegla` |
| `POST /cotizaciones/:id/ajustes` · `POST /ajustes/:id/aprobar` | operador / supervisor | El supervisor no aprueba el suyo |
| `POST /viajes` · `POST /viajes/:id/manifiesto/items` · `…/cerrar` · `…/modificar` | despachador | `modificar` exige `motivo` |
| `GET /viajes/:id/paradas/:p` | ayudante, guardia, responsable | Listas bajan/suben/continúan + estado de conciliación |
| `POST /escaneos` | ayudante, operador | Cuerpo = `CmdEscaneo`; idempotente |
| `POST /viajes/:id/paradas/:p/autorizar` · `…/salida-real` | guardia / responsable / supervisor | 6.3 |
| `POST /recepciones` | operador | 6.5 |
| `GET /redespachos` · `POST /redespachos/:id/asignar` | operador / supervisor | |
| `POST /entregas/verificar-codigo` · `POST /entregas` | operador | 6.4 |
| `POST /incidencias` · `POST /incidencias/:id/resolver` | según tipo | Resolver = evento vinculado |
| `POST /eventos/:id/corregir` | supervisor | Crea evento con `corrige_evento_id` |
| `POST /sync` | todos | Lote offline (7.4) |
| `GET /q/:token` | **público** | Siempre responde igual; sin sesión no revela nada (criterio 18) |
| `GET /export/*.csv` | gerente, admin | Auditado |
| `POST /webhooks/whatsapp` | proveedor | Firma verificada; idempotente |

### 7.2 Permisos (`packages/shared/permisos.ts`, desde la matriz de la v4 §8)
```ts
export const PUEDE = {
  operador:            ['encomienda:crear', 'cotizar', 'etiqueta:imprimir', 'recepcion:confirmar', 'entrega:crear', 'ajuste:proponer'],
  despachador:         ['manifiesto:armar', 'manifiesto:cerrar', 'manifiesto:modificar'],
  ayudante:            ['escaneo:carga', 'escaneo:descarga', 'conteo:continuan'],
  guardia:             ['salida:autorizar', 'salida:registrar_real'],
  responsable_agencia: ['salida:autorizar_sin_guardia', 'salida:registrar_real'],
  evaluador:           ['cotizacion:fijar_rango'],
  supervisor:          ['ajuste:aprobar', 'excepcion:autorizar', 'entrega_parcial:autorizar', 'evento:corregir', 'incidencia:resolver'],
  gerente:             ['ver:todo', 'export:csv'],
  admin:               ['usuario:gestionar', 'tarifa:gestionar', 'ver:datos_personales_con_registro'],
} as const;
// Reglas que el código impone ADEMÁS de la tabla:
//  - Nadie aprueba su propia excepción ni su propio ajuste.
//  - Todo permiso se evalúa contra usuario_rol.agencia_id (agencia de la parada o del bulto).
//  - Un sustituto hereda permisos de supervisor solo mientras esté activa su designación.
//  - Gerente: sin escritura sobre eventos operativos.
```
Opcional `[DEFECTO]`: **row-level security** de PostgreSQL por `agencia_id` en `bulto`, `encomienda` y `evento` como segunda barrera.

### 7.3 Seguridad
- **Contraseñas:** argon2id. Sesiones con expiración corta y cierre por inactividad. Cuentas individuales; desactivar, no borrar.
- **`/q/:token`:** respuesta idéntica en forma, tiempo y código HTTP para token válido o inválido; limitar por IP. Un usuario autorizado usa `POST /escaneos`, no esa ruta.
- **Búsqueda manual por código legible:** límite `busqueda_manual.max_por_minuto` por usuario y bloqueo temporal; cada fallo queda en `audit_log` (evita enumeración, v4 §4).
- **Cifrado:** TLS en tránsito; cifrado en reposo del disco/BD; `params_cifrados` con AES-256-GCM y la clave fuera de la BD.
- **Secretos:** `RETIRO_HMAC_SECRET`, `WA_TOKEN`, `PARAMS_KEY` solo en entorno o gestor de secretos, nunca en el repositorio.
- **Soporte:** Abel y Cheche no tienen acceso irrestricto a datos personales; el acceso de soporte es rol `admin` con registro de cada lectura y su motivo en `audit_log`.
- **Concurrencia:** `FOR UPDATE` + `version`. Dos escaneos contradictorios del mismo bulto: gana el primero; el segundo recibe `conflicto_asignacion` y queda registrado.
- **LOPDP:** mínimo de datos (nombre y teléfono; cédula solo si la exige la cooperativa). Retención configurable por tipo de dato. Registro de subencargados (Meta, hosting) para el contrato.

### 7.4 PWA y modo sin conexión
```ts
// IndexedDB (Dexie)
db.version(1).stores({
  manifiestos: 'viajeId',            // precargado al abrir el día: versión + ítems por parada
  supervisores: 'id',                // id, nombre, agenciaId, pinHash (PBKDF2), salt
  cola: '++seq, eventId, estado',    // eventos pendientes; seq da el orden local
  salidasB: 'id, viajeId, parada',   // autorizaciones tipo B pendientes
});
```
Reglas del cliente:
1. Cada acción genera `eventId = crypto.randomUUID()` y se guarda en `cola` **antes** de mostrar éxito.
2. **Sin conexión**, el escaneo se muestra como **"pendiente de validar"**, nunca como "cargado correctamente". El conteo local sobre el manifiesto precargado es solo informativo.
3. **No hay botón "autorizar salida" sin conexión.** Hay "Salida sin conexión (tipo B)": conteo físico contra el manifiesto precargado, motivo y **PIN del supervisor** (G7).
4. Al reconectar: `POST /sync` con el lote **ordenado por `seq`**, en bloques de ≤100. El servidor procesa cada evento con la lógica de 6.1 y responde un resultado por `eventId`. La cola se limpia **solo** con confirmación.
5. Se muestran siempre los **pendientes de sincronizar** y el último sync correcto. `pendientesSync > 0` bloquea la autorización normal (5.3).
6. Se guarda `ocurrido_declarado` (hora del dispositivo); el servidor añade `recibido_servidor`. **No se confía en el reloj del dispositivo** para ordenar (G10).
7. Service Worker: *cache-first* para la app y *network-only* para datos sensibles; nada de datos personales en `localStorage`. Cerrar sesión borra IndexedDB.
8. Escaneo: modo continuo; sonido y vibración distintos para ok, repetido y error; botón grande "siguiente"; entrada de lector Bluetooth por input enfocado.

---

## 8. Panel, etiquetas y WhatsApp

### 8.1 Panel (un solo panel, vistas por rol; consultas, no tablas nuevas)
- **Agencia:** por recibir (`en_transito` con `baja` en su parada), por cargar, sin viaje (`registrado`), redespachos pendientes, disponibles para retiro, incidencias abiertas.
- **Supervisor:** viajes con discrepancias, excepciones del día, redespachos vencidos, conflictos de escaneo, fallos de sincronización, **salidas tipo B sin conciliar o sin confirmar**, modificaciones de manifiesto post-cierre.
- **Gerente:** volumen por ruta y agencia, tiempos de despacho/redespacho/disponibilidad, incidencias por tipo y antigüedad, uso de excepciones y descuentos por usuario.
- **CSV diario** de eventos, incidencias, excepciones y descuentos. Los indicadores por empleado se muestran con contexto; no se usan automáticamente para sancionar.
- Nunca mostrar posición en vivo: la custodia se presenta como **"última información registrada"** (último custodio, última ubicación operativa, último evento, próxima acción). En tránsito, el custodio es el vehículo/conductor del viaje.

### 8.2 Etiquetas
- Una por bulto: QR de 26 caracteres en mayúsculas (modo alfanumérico) + código legible `XXXX-XXXX` + nombre de la agencia destino en grande (ayuda a detectar destino incorrecto a simple vista). **Sin datos personales.**
- Impresión térmica (58/80 mm) desde el navegador: CSS `@page` + `window.print()`, o ESC/POS si la impresora lo exige. Corrección de error del QR nivel **M o Q** (etiquetas que se rayan). Probar en campo con el material real.
- Reimpresión: genera evento `etiqueta_reimpresa` con motivo; el `qr_token` **no cambia**. Si una etiqueta se pierde del todo, el supervisor emite una nueva y se registra el evento vinculado.
- Comprobante al cliente: de registro y seguimiento, **no es una factura**; no muestra importes cobrados (el sistema no los conoce).

### 8.3 Plantillas de WhatsApp (se envían a aprobación en la semana 1)
| Plantilla | Cuándo | Variables |
|---|---|---|
| `registro_confirmado` | al registrar | nombre, n.º de bultos, destino |
| `disponible_retiro` | cuando **todos** los bultos están disponibles en destino final | nombre, agencia, **código de retiro**, vigencia |
| `recordatorio_retiro` | si no retira en `retiro.recordatorio_dias` | nombre, agencia |

Costo: el sistema cuenta mensajes por categoría en `notificacion` para que el mes se pueda cotejar con la factura del proveedor. Fórmula de la v4 §9: `encomiendas/mes × mensajes × destinatarios × tarifa vigente + cargo del proveedor`. **No hardcodear tarifas**; la tarifa de Ecuador se verifica en la lista oficial de Meta.

---

## 9. Experimento opcional: cotización asistida por foto
**Fuera del compromiso y del plazo base.** Solo si queda capacidad, en sombra: calcula y guarda su resultado en `cotizacion.foto` (jsonb), pero el operador sigue cotizando a mano y **el precio nunca sale del modelo** (invariante 1).

```ts
// Contrato para el módulo de foto. El motor de tarifas es el mismo (5.5).
export interface ResultadoFoto {
  pesoG: number | null;                 // OCR de la pantalla de la balanza
  dimsMm: { l: number; a: number; h: number } | null;  // visión por computador con marcador de referencia
  filtros: { nitida: boolean; referenciaVisible: boolean; dentroDelArea: boolean;
             unSoloBulto: boolean; balanzaCoherente: boolean; margenAlBorde: boolean };
  veredicto: 'aprobable' | 'requiere_evaluador';
}
// 'aprobable' solo si TODOS los filtros pasan. Ante cualquier duda: 'requiere_evaluador'.
```
**Protocolo de prueba** (v4 §5.4, propuesta): verdad de referencia = peso verificado + medidas con cinta + tarifa aprobada (no el precio del empleado). ≥200 cajas regulares. Se miden error por dimensión, rango correcto, sub/sobrecotizaciones, % a evaluador y tiempo. Umbrales fijados **antes** de empezar. Condición mínima: **cero subcotizaciones aprobadas automáticamente por encima de un rango.** Sin foto en producción hasta cumplirlo.

---

## 10. Pruebas

### 10.1 Pruebas unitarias del dominio (Vitest) — escríbelas primero
```ts
import { describe, it, expect } from 'vitest';
import { evaluarSalida } from '../src/domain/salida';
import { decidirEscaneo } from '../src/domain/escaneo';
import { transitar } from '../src/domain/estados';
import { cotizar, pesoVolumetricoG } from '../src/domain/tarifa';
import { nuevoQrToken, nuevoCodigoLegible } from '../src/domain/codigos';

const base = {
  online: true, cargadosValidos: new Set<string>(), descargados: new Set<string>(),
  faltantesAbiertos: new Set<string>(), conteoContinuan: null as number | null,
  reescaneados: new Set<string>(), exigirReescaneo: false, conflictosCriticos: 0, pendientesSync: 0,
};

describe('salida por parada (criterios 3, 14, 22)', () => {
  const items = [
    { bultoId: 'a', rol: 'sube' as const }, { bultoId: 'b', rol: 'sube' as const },
    { bultoId: 'c', rol: 'continua' as const }, { bultoId: 'd', rol: 'baja' as const },
  ];
  const ok = { ...base, items, cargadosValidos: new Set(['a', 'b']), descargados: new Set(['d']), conteoContinuan: 1 };

  it('autoriza cuando todo concilia', () => {
    const r = evaluarSalida(ok);
    expect(r.normalPermitida).toBe(true);
    expect(r.esperadoABordo).toBe(3);
  });
  it('N escaneos no bastan: se concilia por identidad', () => {
    // 2 escaneos pero uno es un bulto ajeno (no está en cargadosValidos)
    const r = evaluarSalida({ ...ok, cargadosValidos: new Set(['a', 'x']) });
    expect(r.normalPermitida).toBe(false);
    expect(r.bloqueos[0]).toMatchObject({ codigo: 'carga_incompleta', bultos: ['b'] });
  });
  it('un faltante abierto bloquea lo normal y permite excepción A', () => {
    const r = evaluarSalida({ ...ok, cargadosValidos: new Set(['a']), faltantesAbiertos: new Set(['b']) });
    expect(r.normalPermitida).toBe(false);
    expect(r.excepcionPermitida).toBe('A');
  });
  it('los que continúan exigen conteo exacto', () => {
    expect(evaluarSalida({ ...ok, conteoContinuan: null }).bloqueos.map(b => b.codigo)).toContain('conteo_continuan_faltante');
    expect(evaluarSalida({ ...ok, conteoContinuan: 2 }).bloqueos.map(b => b.codigo)).toContain('conteo_continuan_no_coincide');
  });
  it('bulto que debía bajar y no bajó bloquea (G9)', () => {
    const r = evaluarSalida({ ...ok, descargados: new Set() });
    expect(r.bloqueos.map(b => b.codigo)).toContain('baja_pendiente');
  });
  it('sin conexión nunca hay autorización normal; solo tipo B', () => {
    const r = evaluarSalida({ ...ok, online: false });
    expect(r.normalPermitida).toBe(false);
    expect(r.excepcionPermitida).toBe('B');
  });
  it('conflictos críticos y pendientes de sync NO son excepcionables', () => {
    expect(evaluarSalida({ ...ok, conflictosCriticos: 1 }).excepcionPermitida).toBeNull();
    expect(evaluarSalida({ ...ok, pendientesSync: 2 }).excepcionPermitida).toBeNull();
  });
});

describe('escaneo (criterios 1, 2, 6, 13, 21)', () => {
  const e = { parada: 2, viajeCmd: 'V1', viajeBulto: 'V1' as string | null };
  it('paquete ajeno al viaje => sobrante', () => {
    const d = decidirEscaneo({ ...e, tipo: 'carga', estado: 'pendiente_despacho', item: null });
    expect(d.resultado).toBe('no_esperado'); expect(d.incidencia).toBe('sobrante');
  });
  it('carga repetida no cambia nada', () => {
    const d = decidirEscaneo({ ...e, tipo: 'carga', estado: 'cargado', item: { sube: 2, baja: 4 } });
    expect(d.resultado).toBe('repetido'); expect(d.nuevoEstado).toBeUndefined();
  });
  it('anulado o retenido no se carga', () => {
    for (const estado of ['anulado', 'retenido'] as const)
      expect(decidirEscaneo({ ...e, tipo: 'carga', estado, item: { sube: 2, baja: 4 } }).resultado).toBe('bloqueado');
  });
  it('descarga de un bulto que continúa => alerta y sin cambio de estado', () => {
    const d = decidirEscaneo({ ...e, tipo: 'descarga', estado: 'en_transito', item: { sube: 1, baja: 4 } });
    expect(d.resultado).toBe('debia_continuar'); expect(d.nuevoEstado).toBeUndefined();
  });
  it('descarga de otro viaje no cambia en silencio', () => {
    const d = decidirEscaneo({ ...e, viajeBulto: 'V9', tipo: 'descarga', estado: 'en_transito', item: null });
    expect(d.resultado).toBe('descarga_incorrecta'); expect(d.nuevoEstado).toBeUndefined();
  });
  it('se pasó de parada (G4): baja con incidencia', () => {
    const d = decidirEscaneo({ ...e, tipo: 'descarga', estado: 'en_transito', item: { sube: 0, baja: 1 } });
    expect(d.nuevoEstado).toBe('descargado'); expect(d.incidencia).toBe('pasado_de_parada');
  });
});

describe('estados, tarifa y códigos', () => {
  it('ciclo completo de un tramo', () => {
    let s = transitar('registrado', 'cerrar_manifiesto');
    s = transitar(s, 'cargar'); s = transitar(s, 'salida_real');
    s = transitar(s, 'descargar'); s = transitar(s, 'recibir');
    expect(s).toBe('recibido_agencia');
  });
  it('transiciones inválidas lanzan', () => {
    expect(() => transitar('registrado', 'cargar')).toThrow();
    expect(() => transitar('en_transito', 'entregar')).toThrow();
  });
  it('tarifa: peso volumétrico y rangos', () => {
    expect(pesoVolumetricoG(500, 400, 300, 5000)).toBe(12000); // 60.000.000 mm³ / 5000 = 12.000 g
    const reglas = [{ id: 'r1', desdeG: 0, hastaG: 5000, precioCent: 300 }, { id: 'r2', desdeG: 5000, hastaG: 20000, precioCent: 700 }];
    expect(cotizar([{ pesoG: 4999 }], reglas, 5000).valorCent).toBe(300);
    expect(cotizar([{ pesoG: 5000 }], reglas, 5000).valorCent).toBe(700);
    expect(cotizar([{ pesoG: 90000 }], reglas, 5000).sinRegla).toBe(true); // no se inventa tarifa
  });
  it('códigos: formato y no secuenciales', () => {
    expect(nuevoQrToken()).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
    const s = new Set(Array.from({ length: 1000 }, nuevoCodigoLegible));
    expect(s.size).toBe(1000);
  });
});
```
> Los valores de `reglas` y del factor 5000 son **de ejemplo para la prueba**, no tarifas de la cooperativa.

### 10.2 Pruebas de integración (BD real en contenedor, no mocks)
1. **Concurrencia:** dos `escanear` simultáneos del mismo bulto → uno `ok`, otro `conflicto_asignacion`/`repetido`; un solo evento de cambio.
2. **Idempotencia:** el mismo `eventId` 3 veces → 1 fila en `evento`, respuesta igual.
3. **Inmutabilidad:** `update evento …` y `delete from evento` fallan (trigger).
4. **Intentos del código:** 5 fallos con transacciones abortadas → el sexto se rechaza y el intento 5 sigue contado (prueba de la regla 1 de 6.4).
5. **Autorización invalidada:** autorizar, modificar manifiesto → la autorización queda `invalidada_at`; `registrarSalidaReal` falla con `SIN_AUTORIZACION_VIGENTE`.
6. **Dos autorizaciones vigentes** en la misma parada → viola el índice único.
7. **Outbox:** 3 workers sobre 100 notificaciones → cada una enviada una sola vez (`skip locked`).
8. **Sync:** lote desordenado y con duplicados → resultado igual al online.
9. **Restauración:** restaurar el respaldo en una BD vacía y ejecutar un recorrido completo.
10. **Escenario completo (3 bultos, Quito → Loja → Zumba):** un bulto baja en Loja y espera, dos continúan; verificar que los dos no cambian de estado en Loja, que el tercero genera redespacho y que la encomienda no figura disponible hasta tener los tres en Zumba.

### 10.3 Prueba de carga mínima
Escaneo válido p95 ≤ `escaneo.sla_ms_p95` con 20 escaneos/segundo contra la BD de producción de tamaño equivalente. Si no se cumple, el índice o la transacción de 6.1 es el sospechoso.

---

## 11. Criterios de aceptación → prueba que los verifica
Todos deben pasar (v4 §19). Un archivo `tests/acceptance/NN-*.test.ts` por criterio.

| # | Criterio | Prueba |
|---|---|---|
| 1 | Paquete ajeno genera rechazo o incidencia | 10.1 escaneo |
| 2 | Escaneo repetido no suma | 10.1 + 10.2-2 |
| 3 | Faltante bloquea autorización normal | 10.1 salida |
| 4 | Excepción exige permisos y motivo | endpoint `autorizar`: sin motivo / sin supervisor / mismo usuario → 4xx |
| 5 | Cambio de manifiesto obliga a reevaluar | 10.2-5 |
| 6 | Descarga incorrecta no cambia destino | 10.1 escaneo |
| 7 | Redespacho pendiente permanece visible | vista del panel + job de vencimiento |
| 8 | Encomienda incompleta no figura disponible | `v_encomienda_estado` con 2 de 3 bultos |
| 9 | Entrega exige verificación acordada | `entregar` sin `codigoId`/documento → error |
| 10 | Reintento no duplica eventos ni mensajes | 10.2-2 y `dedupe_key` |
| 11 | Sin acceso fuera de permisos | usuario de otra agencia → 403/404 |
| 12 | Respaldo restaurable | 10.2-9 |
| 13 | Anulado o retenido no se carga | 10.1 escaneo |
| 14 | Sin conexión no hay autorización normal | 10.1 salida + prueba E2E offline |
| 15 | WhatsApp caído: la operación sigue | proveedor simulado en fallo; recorrido completo |
| 16 | Código incorrecto, vencido o usado rechaza; intentos limitados | 10.2-4 |
| 17 | Corrección crea evento vinculado | `POST /eventos/:id/corregir` |
| 18 | QR sin sesión no revela datos | `/q/:token` válido vs inválido: respuesta idéntica |
| 19 | Entrega parcial exige supervisor y motivo | `entregar` parcial sin ambos → error |
| 20 | Escaneo válido responde en el tiempo acordado | 10.3 |
| 21 | Bulto que continúa no pasa a Descargado | 10.1 escaneo + 10.2-10 |
| 22 | Salida intermedia exige conciliar o excepción | 10.1 salida |

**Métricas del piloto** (v4 §19): % de bultos con recorrido completo, % de recepciones con custodio identificado, redespachos en plazo, tiempo añadido por escaneo y por registro, excepciones por viaje y motivo, incidencias abiertas/resueltas, mensajes entregados según el proveedor, uso de salidas por excepción. Se instrumentan **desde el primer día** (los eventos ya traen todo lo necesario).

---

## 12. Plan de entrega

| Etapa | Entregable verificable | Semanas |
|---|---|---|
| 0. Preparación | Iniciar verificación de Meta y plantillas. Observar la operación. Reglas, rutas, paradas, usuarios cargados. `domain/` completo con las pruebas de 10.1 en verde. | ~1 |
| 1. Base | Migración 001, auth y permisos, agencias, encomiendas, bultos, QR, etiquetas, cotización manual | 1–1,5 |
| 2. Control | Manifiesto por parada, escaneo, `autorizarSalida`, descarga, recepción, custodia | ~1,5 |
| 3. Continuidad | Redespacho, incidencias, entrega con código, excepciones A y B, sync offline | ~1 |
| 4. Comunicación | Outbox WhatsApp, panel, CSV, retención | 0,5–1 |
| **Construcción** | **Listo para sombra** | **5–7** |
| Piloto en sombra | Registro en paralelo; se fijan por escrito los umbrales de éxito | 1–2 |
| Piloto controlado | Una ruta con supervisor | 1–2 |

**Total orientativo con piloto: 7–11 semanas.** No se comprometen fechas sin los bloqueantes (sección 13).

**Versión recortada de 4 semanas** (v4 §17.2): una ruta, tarifa manual, bultos con QR, manifiesto por parada, carga/descarga/recepción, entrega con código, incidencias básicas, redespacho como lista simple, panel mínimo. Sin foto.

**Orden de recorte:** 1) foto, 2) panel del gerente (queda el CSV), 3) recordatorio de WhatsApp, 4) piloto en más de una ruta. **Nunca recortar:** manifiesto versionado, validación de carga, recepción por agencia, verificación de entrega, auditoría.

**Definición de hecho para cada etapa:** pruebas de la etapa en verde, migraciones reversibles, sin secretos en el repositorio, y el criterio de aceptación correspondiente demostrado en un entorno de pruebas.

---

## 13. Lo que falta de la cooperativa (el código no debe inventarlo)

**Bloqueantes** (sin ellos no hay precio ni fechas): (1) reglas de tarifa: factor volumétrico, tarifa por ruta/destino, mínimos, **y si se cobra por bulto o por encomienda**; (2) volumen mensual y proporción de encomiendas con varios bultos; (3) qué cubre el tope de $12.000 (cifra no verificada) y qué órgano aprueba; (4) rutas, paradas y agencias, quién recibe en cada transferencia, **qué bultos continúan a bordo y cuáles hacen transbordo**; (5) cómo exporta datos el software actual; (6) dueño de la cuenta de WhatsApp y documentos para verificar el negocio; (7) avisar solo al destinatario o también al remitente; (8) un responsable operativo durante el piloto.

**Antes del piloto:** dónde hay guardia y dónde no, y la conectividad por parada; qué pasa si cambia el vehículo o la ruta; daños, devoluciones y valor declarado; retiro por terceros y cédula; quién autoriza excepciones y su sustituto, y el umbral de descuentos; equipos disponibles (teléfonos, impresoras, etiquetas); línea base de pérdidas; plazos (redespacho, retiro, recordatorio, caducidad del código, ventana sin conexión); ruta del piloto; alojamiento y retención de datos; artículos prohibidos y forma de confirmación del cliente.

**Mientras tanto:** todo lo anterior se carga en `parametro`, `tarifa_version` o `parada`. Los valores de la sección 3.1 son temporales para poder construir y probar.

## 14. Qué no hacer
- No añadir cobros, ni siquiera una bandera "cobro a destino" (decisión de Cheche; si cambia, es cambio presupuestado).
- No mostrar ubicación del vehículo.
- No integrar con el software actual en el MVP; solo el campo `ref_externa`.
- No usar IA para fijar precios.
- No recortar los puntos de "nunca recortar".
- No enviar este documento a la cooperativa: contiene estrategia comercial. La propuesta formal (3–4 páginas) se deriva aparte.
