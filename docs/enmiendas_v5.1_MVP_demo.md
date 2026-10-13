# Enmiendas v5.1 — MVP de demostración
**Proyecto:** Trazabilidad de Encomiendas · Cooperativa Unión Transportes Cariamanga
**Aplica sobre:** `trazabilidad_encomiendas_v5_para_Abel.md` · **Uso interno**

> **Regla de precedencia:** donde esta enmienda y la v5 se contradicen, **manda esta enmienda**. Lo que aquí no se menciona, sigue como en la v5.
> **Documento vivo:** cada avance se registra en la sección 9 (Bitácora) y, si cambia una decisión, se añade una enmienda numerada (E-nn). Nada se edita en silencio.

---

## 1. Objetivo del MVP
**Demostración**, no producción. Debe mostrar en vivo, de punta a punta, que se puede **seguir cada bulto, impedir que el bus salga con la carga mal conciliada y no entregar una encomienda incompleta**. Se corre en un solo entorno (laptop o un servidor pequeño), con **datos ficticios**, y con conexión.

**Criterio de éxito:** se ejecuta el guion de la sección 6 sin tocar la base de datos a mano.

## 2. Recortes (E-01 a E-10)

| Enmienda | Qué cambia | Sección v5 afectada |
|---|---|---|
| **E-01 Sin modo offline** | Fuera: IndexedDB/Dexie, cola local, `/sync`, salida tipo B, PIN de supervisor en dispositivo, `seq_cliente`, `verificada_offline`, `conciliada_at`. Sin conexión la app muestra "sin conexión, no se puede operar". | 2 (G7, G10), 5.3 (rama `!online`), 6.3 (tipo B), 7.4, 10.2-8, criterio 14 |
| **E-02 PWA → web responsive** | React + Vite normal, sin Service Worker. Escaneo con cámara (`BarcodeDetector`) **y** campo para escribir el código legible `XXXX-XXXX` (salvavidas de la demo). | 3, 7.4 |
| **E-03 Roles sembrados, no eliminados** | Se mantiene el enum y la matriz de permisos. Para la demo se siembran 4 usuarios: `operador` (también arma/cierra manifiesto), `ayudante`, `supervisor` (también autoriza la salida, hace de guardia/responsable) y `gerente` (solo lectura). | 7.2 |
| **E-04 WhatsApp simulado** | Se mantiene la tabla `notificacion` y el outbox, pero el proveedor es un **adaptador falso** que guarda el mensaje y lo muestra en una pantalla "Mensajes enviados". Sin Meta, sin plantillas, sin webhook. Interfaz `EnviadorMensajes` para cambiarlo luego. | 6.6, 8.3 |
| **E-05 Código de retiro visible** | En la demo el código de 6 dígitos se muestra en la pantalla del mensaje simulado. Se guarda solo el HMAC. **Sin** `params_cifrados` ni AES-GCM por ahora. | 2 (G6), 4.1 |
| **E-06 Una sola excepción (tipo A)** | Se conserva: supervisor + motivo + solicitante distinto del autorizador. | 5.3, 6.3 |
| **E-07 Sin trabajos de fondo complejos** | Fuera: escalado al doble del plazo, avisos agrupados, retiro vencido, retención nocturna. Queda: el **plazo de redespacho** visible en el panel (rojo si `due_at < now()`), calculado en la consulta, sin job. | 6.6 |
| **E-08 Seguridad proporcional** | Se mantiene: argon2id, cookies HttpOnly, validación de permisos y agencia en servidor, `/q/:token` indistinguible, límite de intentos atómico del código. Fuera: row-level security, registro de lecturas de soporte, LOPDP formal. | 7.3 |
| **E-09 Panel y exportes mínimos** | Un panel por rol con 4–5 tarjetas (ver 5). Un solo CSV de eventos. Sin panel de gerente avanzado ni métricas de piloto. | 8.1 |
| **E-10 Fuera del MVP demo** | Foto (sección 9 v5), prueba de carga, respaldo/restauración en CI, ajustes de cotización con aprobación, reimpresión con motivo, correcciones de eventos (`/eventos/:id/corregir`), etiquetas térmicas (basta imprimir desde el navegador). | 8.2, 9, 10.2-9, 10.3 |

### Lo que NO se recorta (es lo que hace valiosa la demo)
Eventos inmutables con trigger · idempotencia por `event_id` · máquina de estados en servidor · manifiesto cerrado y versionado por parada · "continúan a bordo" sin cambio de estado · conciliación de salida por identidad (no por conteo) · autorización vs salida real · redespacho con plazo · encomienda disponible solo si **todos** sus bultos lo están · entrega con código e intentos limitados · entrega parcial con supervisor y motivo · incidencias.

## 3. Invariantes que cambian
- **Invariante 7** → *"Sin conexión no se opera."* La app bloquea escaneos y autorizaciones; no existe ruta alternativa.
- **Invariantes 11 y 12** siguen; el 11 se cumple con el adaptador simulado (si falla, la operación continúa).
- Los demás (1–6, 8–10) **no cambian** y siguen siendo pruebas que rompen el build.

## 4. Base de datos: migración `001_init_mvp.sql`
Partir del SQL de la v5 §4.1 **quitando**:
- `usuario.pin_hash`
- `evento.seq_cliente`
- `autorizacion_salida`: `verificada_offline`, `confirmada_por`, `confirmada_at`, `conciliada_at`, `conciliada_por`; el tipo `'excepcion_b'` del `check`
- `notificacion.params_cifrados`
- `ajuste_cotizacion` (tabla completa) y `cotizacion.foto`
- `usuario_rol.sustituto_de`

Se mantienen sin cambio: triggers de inmutabilidad, índices únicos parciales (`uq_autorizacion_vigente`, `uq_codigo_vigente`), `v_encomienda_estado`, la consulta 4.3.

**Datos de demostración (`seed.sql`)** — todo ficticio y rotulado:
- 3 agencias: Quito, Loja, Zumba · 1 ruta: Quito → Loja → Zumba (paradas 1, 2, 3, todas con agencia).
- 4 usuarios (uno por rol de E-03).
- `tarifa_version` de ejemplo (factor 5000) con 2–3 rangos de peso. **Marcar en pantalla: "TARIFAS DE DEMOSTRACIÓN"**. No son de la cooperativa.
- `parametro` con los valores de la v5 §3.1 (plazo de redespacho corto, p. ej. 1 hora, para poder mostrar el vencimiento).

## 5. Pantallas mínimas (sin más)
1. **Login**
2. **Nueva encomienda** → bultos, cotización, etiquetas (QR + código legible)
3. **Viaje y manifiesto** (armar, cerrar; vista por parada: bajan / suben / continúan)
4. **Escaneo** (carga/descarga, resultado grande de color, alerta de texto) + conteo de "continúan"
5. **Salida**: botón *Autorizar* (muestra bloqueos si no concilia) · *Excepción A* · *Registrar salida real*
6. **Recepción** en agencia (escaneo bulto por bulto)
7. **Redespachos** (lista con plazo)
8. **Entrega** (código o documento; parcial con supervisor)
9. **Panel** por rol + **Mensajes enviados** (simulado) + **línea de tiempo de un bulto**

## 6. Guion de la demo (es también la prueba E2E principal)
Escenario v5 §10.2-10: 3 bultos Quito → Zumba pasando por Loja.
1. Operador registra la encomienda (3 bultos) → etiquetas → mensaje "registro" simulado.
2. Operador arma y cierra el manifiesto: bulto A baja en Loja; B y C continúan a Zumba.
3. Ayudante escanea carga en Quito. Se escanea un bulto ajeno → **rechazo + incidencia**. Se repite un escaneo → **no suma**.
4. Se intenta autorizar con un bulto sin cargar → **bloqueado**. Se carga → autoriza → salida real.
5. En Loja: ayudante descarga A. Se intenta bajar B → **alerta "continúa a bordo", sin cambio**. Conteo de "continúan" = 2 → autoriza → salida.
6. Loja recibe A → pasa a **pendiente de redespacho** (con plazo). La encomienda **no figura disponible**.
7. En Zumba: se descargan y reciben B y C; A se redespacha y llega. Solo entonces: **disponible**, se genera el código y aparece en "Mensajes enviados".
8. Entrega: código incorrecto 5 veces → bloqueado; el correcto → entregado. Línea de tiempo completa del bulto.

## 7. Criterios de aceptación del MVP demo
**Se mantienen:** 1, 2, 3, 4, 5, 6, 8, 9, 10, 13, 16, 19, 21, 22.
**Simplificados:** 7 (redespacho visible en panel, sin job) · 11 (acceso por agencia en servidor, sin RLS) · 18 (`/q/:token` idéntico).
**Fuera del MVP demo:** 12 (respaldo), 14 (offline), 15 (WhatsApp real caído; se prueba con adaptador que falla), 17 (correcciones), 20 (SLA de 1,5 s).

## 8. Plan por etapas (orientativo, una persona)
| Etapa | Entregable verificable |
|---|---|
| **E0** | Monorepo + `domain/` completo + pruebas 10.1 en verde |
| **E1** | PostgreSQL (Docker), migración MVP, seed, trigger de inmutabilidad probado |
| **E2** | Login/permisos, encomienda + bultos + QR + cotización, manifiesto, escaneo idempotente |
| **E3** | Autorizar/registrar salida, descarga, recepción, redespacho |
| **E4** | Entrega con código, parcial, incidencias, panel, mensajes simulados, prueba E2E del guion |

Estimación aproximada: **2–3 semanas** de trabajo enfocado. Es una estimación mía, no un compromiso.

## 9. Notas sobre el código de referencia de la v5
- **Nadie lo ha ejecutado.** Primera tarea: correr las pruebas 10.1 y corregir lo que falle.
- **Funciones auxiliares no definidas** en los servicios (son seudocódigo): `param`, `exigirRol`, `ErrorNegocio`, `cargarContextoSalida`, `versionVigente`, `insertarEventoSistema`, `hayFaltanteAbierto`, `crearRedespachoRetorno`. Hay que escribirlas.
- **Idempotencia concurrente (mejora a 6.1):** si dos peticiones con el mismo `eventId` llegan a la vez, ambas pasan el `select` y la segunda falla con violación de clave primaria (`23505`). Capturar ese error, hacer rollback y devolver el resultado del evento ya guardado.
- **Aclaración:** el regex de `nuevoQrToken` (`/^[0-9A-HJKMNP-TV-Z]{26}$/`) es correcto para el alfabeto Crockford de 128 bits; no requiere ajuste.
- `decidirEscaneo` debe recibir el ítem del manifiesto **sin filtrar por parada** (ya indicado en v5 §6).

## 10. Bitácora de avances
| Fecha | Enmienda / avance | Quién |
|---|---|---|
| 2026-10-06 | Se crea v5.1: MVP demo, sin offline (E-01 a E-10) | Abel + Claude |
| | | |

*Cada vez que avancemos, aquí se anota qué se terminó y qué enmienda nueva (E-11, E-12…) cambia algo.*
