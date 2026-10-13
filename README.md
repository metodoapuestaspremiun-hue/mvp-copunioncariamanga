# Trazabilidad de Encomiendas — MVP de demostración
Cooperativa Unión Transportes Cariamanga · **Uso interno** · Datos 100 % ficticios

Sigue cada **bulto** desde que se recibe hasta que se entrega, impide que el bus salga con la carga mal conciliada y no entrega una encomienda incompleta. Es una **demo** (no producción): sin modo offline, sin cobros, sin GPS.

**Stack:** Next.js 15 (App Router) + React 19 + TypeScript · MySQL / MariaDB · mysql2 (SQL directo) · Zod · argon2id · Vitest. Un solo proyecto (pantallas + API).

## Qué está probado y qué NO (léelo primero)
| Probado de verdad | NO probado todavía |
|---|---|
| 27 pruebas unitarias de las reglas del dominio | **Tu cPanel**: versión de MySQL, permiso para crear *triggers* |
| 23 pruebas de integración contra MariaDB 10.11 real (el guion completo de la demo + reglas de seguridad) | MySQL 8 (solo se probó MariaDB 10.11) |
| 21 chequeos HTTP contra la app compilada (login, cookies, permisos 401/403, flujo) | **Las pantallas en un navegador**: compilan y su API funciona, pero nadie las ha usado con el ratón |
| `next build` y `tsc` sin errores | **Evolution API real** (el adaptador está escrito; falta probarlo con tu instancia) |
| | Lectura de QR con la cámara de un celular |
Espera encontrar detalles de pantalla por pulir. Las reglas del negocio sí están verificadas.

## Puesta en marcha (en tu PC)
Requisitos: **Node 20+**, **MySQL 8 o MariaDB 10.5+** (local, o la de tu cPanel con acceso remoto), Git opcional.
```bash
npm install
cp .env.example .env          # completa DATABASE_* y los secretos
# crea una base VACÍA (utf8mb4) en tu MySQL, p. ej. "trazabilidad", y pon sus datos en .env
npm run db:init               # crea las 25 tablas, triggers, vista y datos de demo
npm run seed:usuarios         # pone la contraseña a los 4 usuarios (DEMO_PASSWORD del .env)
npm run dev                   # http://localhost:3000
```
Usuarios (todos `@demo.local`, contraseña = `DEMO_PASSWORD`): `operador` (también despacha) · `ayudante` · `supervisor` (también autoriza salidas) · `gerente` (solo lectura).
La cámara solo funciona en **HTTPS o localhost**. Siempre puedes escribir el código `XXXX-XXXX` en el campo.

### Pruebas
```bash
npm test                      # reglas del dominio (no necesita base de datos)
npm run typecheck
# Integracion: crea una base APARTE vacia (p. ej. trazabilidad_test), copia .env.test.example a .env.test y completa usuario/clave.
# ¡Estas pruebas BORRAN y recrean esa base! Se niegan a correr si DATABASE_NAME no contiene "test".
npm run test:integration
node tests/e2e/smoke-http.mjs http://localhost:3000   # con la app corriendo y los usuarios sembrados
```
Dejar la demo como nueva: `npm run reset:demo` (borra encomiendas, viajes, eventos y mensajes; conserva usuarios, agencias, rutas y tarifas).

## Tu cPanel (lo que hay que comprobar primero)
1. **Triggers** — los eventos inmutables dependen de ellos. En phpMyAdmin → SQL:
   `CREATE TABLE z(a INT); CREATE TRIGGER z_t BEFORE UPDATE ON z FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='no';`
   Si da error 1419 / "SUPER privilege", avísame antes de seguir (hay plan B en `docs/` → hoja Riesgos del Excel). Luego `DROP TABLE z;`
2. **Versión:** `SELECT VERSION();` (CHECK exige MySQL ≥ 8.0.16 o MariaDB ≥ 10.2).
3. **Si la app corre en tu PC y la BD en cPanel:** cPanel → *Remote MySQL* → agrega tu IP pública (nunca `%`).
4. **Si la app corre en cPanel:** *Setup Node.js App* (Node ≥ 20). `npm run build` y `npm start`. Esto no se ha probado.
5. **Cron de mensajes (cada minuto):** `curl -s -X POST -H "x-cron-secret: TU_CRON_SECRET" https://tu-dominio/api/cron/mensajes`

## Mensajes por WhatsApp (Evolution API)
En `.env`: `MENSAJES_PROVEEDOR=simulado` (por defecto: no envía nada; se ven en la pantalla *Mensajes*) o `evolution`:
`EVOLUTION_URL`, `EVOLUTION_INSTANCE`, `EVOLUTION_API_KEY`, `EVOLUTION_API_VERSION` (`v1` o `v2`: cambia el formato del cuerpo; **verifícalo con la documentación de tu versión**).
⚠️ Con `evolution` los mensajes son **REALES**. Por seguridad solo se envía a los números de `MENSAJES_NUMEROS_PERMITIDOS` (formato `5939XXXXXXXX`, separados por coma); el resto queda "descartada". Usa un número dedicado: Evolution no es la API oficial y pueden bloquear el número.

## Guion de la demo
1. **Operador**: Nueva encomienda Quito → Zumba con 3 bultos (destinatario con tu WhatsApp) → imprimir etiquetas.
2. **Operador**: Viajes → crear viaje → agregar los 3 bultos (A: sube Quito/baja **Loja**; B y C: sube Quito/baja **Zumba**) → *Cerrar manifiesto*.
3. **Ayudante**: parada 1 → escanear A, B (y un bulto ajeno → rojo + incidencia; repetir uno → "no suma").
4. **Supervisor**: parada 1 → *Autorizar* sale **bloqueado** (falta C, y hay una incidencia). Resolver la incidencia, cargar C, autorizar, *Registrar salida real*.
5. **Ayudante**: parada 2 (Loja) → *Descarga*: bajar A (ok); intentar bajar B → **"NO LO BAJE: CONTINÚA"**, sin cambio. Registrar conteo de "continúan" = 2.
6. **Supervisor**: resolver la incidencia de la alerta → autorizar → salida real.
7. **Operador (Loja)**: Recepción → recibir A → queda **pendiente de redespacho** con plazo; la encomienda **no** figura disponible.
8. **Ayudante/Operador** parada 3 (Zumba): descargar y recibir B y C. Para A: segundo viaje (sube en Loja, baja en Zumba), cargar, salir, descargar y recibir en Zumba.
9. Recién con los 3 en Zumba: **disponible**, se emite el código y aparece en *Mensajes*.
10. **Operador**: Entrega → 5 códigos incorrectos = bloqueado (se entrega con documento) · o el correcto = entregado. Abrir la **línea de tiempo** de un bulto desde el Panel.

## Estructura
```
src/domain/          reglas PURAS (estados, escaneo, salida, tarifa, códigos) — sin BD ni HTTP
src/server/          db, auth, http (wrapper de rutas), services/ (transacciones), mensajes/ (cola + Evolution/simulado)
src/app/api/…        31 endpoints          src/app/(app)/…   pantallas          src/app/q/[token]  QR público
db/                  001_init_mvp.sql (esquema) y seed.sql (datos de demo)
scripts/             db-init, seed-usuarios, reset-demo
tests/               unit/ · integration/ (BD real) · e2e/smoke-http.mjs
docs/                especificación v5, enmiendas v5.1 y el Excel de la base del proyecto
```

## Límites conocidos del MVP (decisiones, no olvidos)
- Sin offline (E-01), sin cobros, sin GPS, sin integración con el software actual. Solo excepción tipo A.
- Un bulto que **se pasa de parada** queda con incidencia, pero el viaje de retorno no se crea automáticamente.
- Al armar el manifiesto, un bulto solo puede dividirse en tramos si baja antes de su destino final y su último tramo está libre (cubre el caso Quito→Loja→Zumba).
- El servidor guarda todo en UTC; las pantallas muestran hora de Ecuador.
- Tarifas, plazos y umbrales son **de demostración** (marcados en pantalla), no de la cooperativa.
