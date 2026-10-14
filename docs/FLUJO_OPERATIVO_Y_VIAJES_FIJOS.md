# Flujo Operativo y Configuración de Viajes Fijos
### Cooperativa Unión Transportes Cariamanga (MVP Trazabilidad)

---

## 1. Perfiles de Usuario Activos

Se simplificaron los roles a los 4 actores reales del día a día:

| Rol | Ícono | Responsabilidad Principal |
| :--- | :---: | :--- |
| **Operador Ventanilla** | 🏢 | Registra encomiendas, **asigna el viaje/turno**, recibe en destino y entrega al cliente. |
| **Ayudante / Conductor de Bus** | 🚌 | Revisa el manifiesto automático del bus, escanea la carga en cada parada y realiza conteo a bordo. |
| **Guardia / Control Salida** | 🛡️ | Verifica que la carga cuadre con el manifiesto en garita y autoriza la salida legal del bus. |
| **Gerencia General** | 📊 | Supervisión ejecutiva, creación y monitoreo de los turnos fijos, métricas y tarifas. |

*(Nota: Los roles de "Supervisor" y "Despachador Andén" se integraron y ocultaron de la vista para evitar pasos redundantes).*

---

## 2. Turnos y Viajes Fijos Programados

La cooperativa cuenta con **6 turnos diarios preconfigurados** cubriendo el corredor Quito ⇄ Loja ⇄ Zumba:

### Sentido Norte ➔ Sur: Quito ➔ Loja ➔ Zumba
1. **Disco 12 · 06:00** *(Conductor: Carlos Andrade)* — Turno Mañana
2. **Disco 25 · 14:00** *(Conductor: Manuel Guamán)* — Turno Tarde
3. **Disco 38 · 21:00 (Noche)** *(Conductor: Segundo Poma)* — Turno Nocturno

### Sentido Sur ➔ Norte: Zumba ➔ Loja ➔ Quito
4. **Disco 09 · 05:30** *(Conductor: Ángel Vivanco)* — Turno Mañana
5. **Disco 17 · 13:30** *(Conductor: Luis Cueva)* — Turno Tarde
6. **Disco 44 · 20:30 (Noche)** *(Conductor: Patricio Torres)* — Turno Nocturno

---

## 3. Generación y Llenado Automático de Manifiestos

El operador ya **no necesita armar el manifiesto a mano**:

```
[Operador en Ventanilla]
       │
       ├─ Registra la encomienda en /encomiendas/nueva
       ├─ Escoge: Origen (ej. Quito) ➔ Destino (ej. Zumba)
       └─ Selecciona el Turno/Viaje (ej. "Disco 25 · 14:00")
       │
       ▼
[Sistema en Segundo Plano]
       │
       ├─ Calcula automáticamente parada de subida (Quito: orden 1) y bajada (Zumba: orden 3).
       ├─ Inserta automáticamente cada paquete en el manifiesto oficial del bus.
       └─ Envía confirmación por WhatsApp al destinatario.
       │
       ▼
[Ayudante / Conductor en Parada]
       │
       └─ Al abrir /viajes/[id] o su parada, los paquetes ya están en lista listos para cargar/escanear.
```

---

## 4. Notificaciones de WhatsApp (Evolution API)

- **Instancia conectada:** `agenda-cultural` en servidor `178.238.238.158:8080`.
- **Plantillas amigables:**
  - Se eliminaron las etiquetas de prueba como `(DEMO)`.
  - Se utiliza la palabra **"paquete"** en lugar del término técnico "bulto".
  - Incluye formato enriquecido con emojis y salto de línea claro.
  - Al recibir en destino, entrega al cliente su **Código de Retiro secreto** con fecha de validez.
