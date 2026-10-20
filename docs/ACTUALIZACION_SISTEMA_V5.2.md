# Registro de Cambios, Arquitectura y Flujo del Sistema (v5.2)
### Cooperativa Unión Transportes Cariamanga — Sistema de Trazabilidad y Encomiendas MVP

---

## 📌 Resumen Ejecutivo de las Actualizaciones

En esta versión se perfeccionó la experiencia operativa de extremo a extremo, eliminando fricciones para ventanilla, choferes y control de garita. Se integraron reglas automáticas de carga, asignación de tripulación legal, trazabilidad visual por zonas de parada y entrega instantánea mediante código de retiro WhatsApp.

---

## 1. 👥 Roles Operativos y Navegación Dinámica

Se reorganizó la barra lateral y los accesos según la responsabilidad real de cada actor:

| Rol | Menú y Accesos Visibles | Responsabilidad Principal |
| :--- | :--- | :--- |
| **🏢 Operador Ventanilla** | Panel, Nueva Encomienda, Encomiendas, Recepción, **Entrega (Búsqueda por PIN/Código)** | Atención a clientes, registro de envíos, asignación de buses y entrega en agencia. |
| **🛡️ Conductor / Control Salida** | Panel, **Autorizar Salidas**, **Historial de Viajes y QR**, Incidencias | Inspección de manifiesto, verificación de bultos a bordo, control de garita y salida del bus. |
| **📊 Gerencia General** | Panel, Viajes, Encomiendas, Redespachos, Tarifas, Incidencias, Mensajes | Auditoría global, configuración de tarifas y trazabilidad ejecutiva. |

* **Mejora:** Se eliminó la pantalla obsoleta *"Mi Viaje Activo"* para consolidar el flujo en el **Historial de Viajes y QR** y la pantalla de **Autorizar Salidas**.

---

## 2. 🚌 Gestión de Manifiesto y Trazabilidad por Parada (`/viajes/[id]`)

La pantalla de detalle del viaje cuenta con dos vistas principales organizadas mediante pestañas superiores:

### Pestaña 1: 📦 Manifiesto de Carga
* **Visualización de Carga:** Lista de todos los paquetes asignados con origen, destino, paradas de subida/bajada y estado.
* **Cierre de Manifiesto con Tripulación Obligatoria:** 
  * Para cerrar el manifiesto (y pasar de Borrador a Oficial), es obligatorio seleccionar o registrar el **Chofer responsable** (y opcionalmente el **Ayudante**).
  * Ambos quedan jurídicamente asentados en la base de datos como los custodios de los paquetes transportados.
* **Incentivo de Seguridad (Regla de 1 Hora):**
  * Al registrar una encomienda, solo se muestran los buses que salgan con al menos 1 hora de margen respecto a la hora actual, garantizando tiempo adecuado para conciliar la carga.

### Pestaña 2: 🔍 Trazabilidad y Escaneos por Parada
* **Historial Separado por Zona/Estación:**
  * Cada parada de la ruta (ej. *1. Quito*, *2. Loja*, *3. Cariamanga*, *4. Zumba*) se despliega como una tarjeta independiente.
  * Muestra el resumen cuantitativo: `↑ X subidos` y `↓ Y bajados`.
* **Detalle de Escaneos QR:**
  * Muestra cada evento con su etiqueta visual: `↑ SUBIDO (Carga)` en verde o `↓ BAJADO (Descarga)` en amarillo.
  * Enlace directo al paquete, encomienda asociada, destinatario, hora exacta y estado de verificación (`✓ Verificado`).

---

## 3. 📲 Notificaciones WhatsApp y Entrega Ágil con PIN (`/entrega`)

### Notificaciones al Cliente (Evolution API)
* Al recibir los paquetes en la agencia de destino final, el sistema genera automáticamente un **Código de Retiro secreto de 6 dígitos** (resguardado con cifrado HMAC-SHA256).
* Se envía al WhatsApp del destinatario un mensaje que incluye:
  * Código de retiro en negrita destacada (ej. `947962`).
  * Código de encomienda (ej. `E-J696WYWD`).
  * Agencia de retiro y fecha límite de vigencia.

### Flujo de Entrega Simplificado en Ventanilla
* **Búsqueda Directa por PIN:** El operador de ventanilla ya no necesita solicitar el código de encomienda. El cliente solo dicta su código de WhatsApp (ej. `947962`) y el operador lo introduce en la barra de búsqueda de `/entrega`.
* **Auto-llenado Inteligente:**
  * El sistema localiza la encomienda y sus bultos.
  * Completa automáticamente el campo *"Código que dice el destinatario"* con los 6 dígitos.
  * Auto-completa el *"Nombre de quien recibe"* con el destinatario registrado.
* **Confirmación Inmediata:** Al presionar **"Entregar"**, los paquetes pasan a estado `entregado`, el código se marca como consumido y la pantalla muestra la confirmación exitosa en verde sin recargas erróneas.

---

## 4. 🗄️ Modificaciones en Base de Datos y Servicios

* **Tabla `viaje`:**
  * Se añadieron las columnas: `conductor_usuario_id`, `ayudante`, `ayudante_usuario_id`, `manifiesto_cerrado_at`, `manifiesto_cerrado_por`.
* **Tabla `codigo_retiro`:**
  * Optimización de consultas HMAC para permitir la búsqueda por código de 6 dígitos tanto en estado vigente como en histórico post-entrega.
* **Consultas SQL en `src/server/services/manifiesto.ts`:**
  * Corrección de alias y parametrización en los eventos de trazabilidad de paradas (`p.ruta_id = ?`).

---

## 5. 📂 Archivos Modificados en Esta Actualización

A continuación se detalla la lista de archivos que fueron intervenidos en el proyecto:

1. **`src/app/(app)/layout.tsx`**
   * Eliminación del enlace obsoleto `Mi Viaje Activo`.
   * Reorganización de accesos para el rol Conductor / Control de Salida (`Historial de Viajes y QR`, `Autorizar Salidas`).

2. **`src/app/(app)/viajes/[id]/page.tsx`**
   * Implementación de la interfaz con pestañas (`📦 Manifiesto de Carga` vs `🔍 Trazabilidad y Escaneos por Parada`).
   * Despliegue de tarjetas de escaneo clasificadas por parada con badges `↑ SUBIDO` y `↓ BAJADO`.
   * Corrección de orden en hooks de React para prevenir excepciones en renderizado cliente.

3. **`src/server/services/manifiesto.ts`**
   * Corrección de la consulta SQL de eventos de escaneo vinculados a paradas.
   * Inclusión de nombres de paradas y validación de tripulantes al cerrar manifiesto.

4. **`src/app/(app)/entrega/page.tsx`**
   * Soporte de búsqueda por PIN de 6 dígitos.
   * Auto-llenado de nombre de receptor y código ingresado.
   * Corrección del ciclo post-entrega para evitar búsquedas automáticas de códigos ya consumidos.

5. **`src/server/services/entrega.ts`**
   * Inclusión de búsqueda reversa por HMAC para códigos de 6 dígitos en `buscarEncomiendaParaEntrega`.
   * Manejo robusto de códigos consumidos e históricos.

6. **`src/server/mensajes/plantillas.ts` y `src/server/services/recepcion.ts`**
   * Incorporación del código de encomienda (`encCodigo`) en la plantilla de WhatsApp `disponible_retiro`.

7. **`docs/ACTUALIZACION_SISTEMA_V5.2.md`**
   * Documentación integral de arquitectura, flujos operativos y cambios realizados.

---

## 6. 📦 Vista de Encomiendas Agrupadas por Viajes / Rutas con Tabs (`/encomiendas`) — v5.3

Se transformó la pantalla principal de Encomiendas (`/encomiendas`) para Operadores y Administradores:

* **Pestañas (Tabs) Dinámicas por Viaje:**
  * Pestaña inicial **📦 Todos** con el total global de encomiendas y bultos.
  * Pestañas individuales para cada viaje/ruta activo (`🚌 [Ruta] - Bus #`), indicando el conteo de encomiendas y badges de bultos/paquetes.
  * Pestaña **🕐 Sin viaje** para paquetes aún pendientes de asignación a manifiesto.
* **Acceso Directo al Viaje:**
  * Cada pestaña de viaje despliega un banner superior con la información del bus, conductor y estado, más el botón **"Ver viaje completo →"** que navega directo a `/viajes/[id]`.
  * En la vista general "Todos", se agregó la columna **Viaje** con acceso rápido (`🚌 Ver viaje`) para cada fila.
* **Buscador Integrado y Enriquecimiento de Datos:**
  * Búsqueda por código, remitente, destinatario o cédula sincronizada con los tabs.
  * En la vista detallada de encomienda (`/encomiendas/[id]`), se incorporó un banner que identifica y vincula el viaje asociado de transporte.

---

## 7. 🚍 Unificación de Conductor y Ayudante de Bus + Alertas en Panel — v5.4

Se consolidaron los perfiles operativos de tripulación móvil para máxima eficiencia en ruta y andén:

* **Perfil Unificado "Conductor / Tripulación de Bus":**
  * Se unificaron los accesos de chofer y ayudante en una sola cuenta de tripulación con permisos completos:
    * `escaneo:operar` (Escanear bultos al subir/cargar o al bajar/descargar en paradas intermedias).
    * `conteo:continuan` (Conteo visual de bultos a bordo).
    * `salida:autorizar` y `salida:registrar_real` (Conciliar carga de la parada, autorizar partida del bus y asentar salida oficial).
  * En el login, se simplificó la selección con el perfil **🚍 Conductor / Tripulación de Bus** (compatible con claves de chofer y ayudante).
* **Alertas y Acciones Directas en el Panel (`/panel`):**
  * Sección destacada superior **"Turnos Listos para Carga y Salida — Manifiestos Oficiales"**:
    * Muestra cada unidad que tenga encomiendas asignadas o manifiesto cerrado.
    * Botón **"📷 Escanear Paquetes (Subir)"** que lleva directo a la parada activa (`/viajes/[id]/paradas/[parada]`).
    * Botón **"🚀 Autorizar Partida"** que permite validar la carga conciliada y partir sin pasos innecesarios.
* **Filtrado Inteligente de Viajes (`/viajes`):**
  * Filtro activo por defecto **"📦 Solo con Encomiendas"** para mostrar únicamente turnos con carga real y evitar saturar a la tripulación con viajes vacíos.
  * Selector para alternar rápidamente entre "Solo con Encomiendas" y "Todos los Turnos".
  * Acciones inmediatas `📷 Escanear` y `Trazabilidad ➔` en cada fila de viaje.


