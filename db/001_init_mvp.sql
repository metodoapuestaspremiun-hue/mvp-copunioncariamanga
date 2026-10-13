-- 001_init_mvp.sql  ·  MySQL 8 / MariaDB 10.5+  ·  InnoDB, utf8mb4
-- Generado a partir del esquema v5 con las enmiendas E-01..E-11. Aplicar en una BD vacía.
SET NAMES utf8mb4;

-- Agencias de la cooperativa (Quito, Loja, Zumba en la demo)
CREATE TABLE agencia (
  id CHAR(36) NOT NULL,
  nombre VARCHAR(80) NOT NULL,
  ciudad VARCHAR(80) NULL,
  activa TINYINT(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Cuentas individuales. Se desactivan, no se borran
CREATE TABLE usuario (
  id CHAR(36) NOT NULL,
  nombre VARCHAR(100) NOT NULL,
  email VARCHAR(120) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  activo TINYINT(1) NOT NULL DEFAULT 1,
  creado_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_usuario_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Qué rol tiene cada usuario y en qué agencia (agencia NULL = todas)
CREATE TABLE usuario_rol (
  id CHAR(36) NOT NULL,
  usuario_id CHAR(36) NOT NULL,
  rol ENUM('operador','despachador','ayudante','guardia','responsable_agencia','evaluador','supervisor','gerente','admin') NOT NULL,
  agencia_id CHAR(36) NULL,
  agencia_key CHAR(36) NOT NULL DEFAULT 'todas',
  PRIMARY KEY (id),
  UNIQUE KEY uq_usuario_rol (usuario_id, rol, agencia_key),
  FOREIGN KEY (usuario_id) REFERENCES usuario(id),
  FOREIGN KEY (agencia_id) REFERENCES agencia(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Sesiones de login (NUEVA: la v5 no la definía). Se guarda el hash del token de la cookie
CREATE TABLE sesion (
  id CHAR(64) NOT NULL,
  usuario_id CHAR(36) NOT NULL,
  creado_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  expira_at DATETIME(3) NOT NULL,
  ultimo_uso_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  FOREIGN KEY (usuario_id) REFERENCES usuario(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Rutas
CREATE TABLE ruta (
  id CHAR(36) NOT NULL,
  nombre VARCHAR(100) NOT NULL,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Paradas de una ruta, en orden
CREATE TABLE parada (
  id CHAR(36) NOT NULL,
  ruta_id CHAR(36) NOT NULL,
  orden INT NOT NULL,
  nombre VARCHAR(80) NOT NULL,
  agencia_id CHAR(36) NULL,
  tiene_guardia TINYINT(1) NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  UNIQUE KEY uq_parada_orden (ruta_id, orden),
  FOREIGN KEY (ruta_id) REFERENCES ruta(id),
  FOREIGN KEY (agencia_id) REFERENCES agencia(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Un bus saliendo en una fecha por una ruta
CREATE TABLE viaje (
  id CHAR(36) NOT NULL,
  ruta_id CHAR(36) NOT NULL,
  fecha DATE NOT NULL,
  vehiculo VARCHAR(40) NOT NULL,
  conductor VARCHAR(80) NULL,
  estado ENUM('planificado','manifiesto_cerrado','en_ruta','cerrado') NOT NULL DEFAULT 'planificado',
  parada_actual INT NOT NULL DEFAULT 1,
  creado_por CHAR(36) NULL,
  PRIMARY KEY (id),
  FOREIGN KEY (ruta_id) REFERENCES ruta(id),
  FOREIGN KEY (creado_por) REFERENCES usuario(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Versión de la tabla de tarifas (la tarifa la decide una tabla, nunca un modelo)
CREATE TABLE tarifa_version (
  id CHAR(36) NOT NULL,
  vigente_desde DATE NOT NULL,
  factor_volumetrico INT NOT NULL,
  etiqueta VARCHAR(80) NULL,
  creada_por CHAR(36) NULL,
  creada_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  FOREIGN KEY (creada_por) REFERENCES usuario(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Rango de peso facturable → precio, por origen y destino
CREATE TABLE tarifa_regla (
  id CHAR(36) NOT NULL,
  tarifa_version_id CHAR(36) NOT NULL,
  origen_agencia_id CHAR(36) NOT NULL,
  destino_agencia_id CHAR(36) NOT NULL,
  peso_fact_desde_g INT NOT NULL,
  peso_fact_hasta_g INT NOT NULL,
  precio_cent INT NOT NULL,
  PRIMARY KEY (id),
  CHECK (precio_cent >= 0),
  CHECK (peso_fact_hasta_g > peso_fact_desde_g),
  FOREIGN KEY (tarifa_version_id) REFERENCES tarifa_version(id),
  FOREIGN KEY (origen_agencia_id) REFERENCES agencia(id),
  FOREIGN KEY (destino_agencia_id) REFERENCES agencia(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Lo que el cliente envía (puede tener varios bultos)
CREATE TABLE encomienda (
  id CHAR(36) NOT NULL,
  codigo VARCHAR(20) NOT NULL,
  origen_agencia_id CHAR(36) NOT NULL,
  destino_agencia_id CHAR(36) NOT NULL,
  remitente_nombre VARCHAR(100) NOT NULL,
  remitente_tel VARCHAR(20) NULL,
  dest_nombre VARCHAR(100) NOT NULL,
  dest_tel VARCHAR(20) NULL,
  contenido_declarado VARCHAR(255) NULL,
  valor_declarado_cent INT NULL,
  ref_externa VARCHAR(60) NULL,
  creado_por CHAR(36) NULL,
  creado_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_encomienda_codigo (codigo),
  FOREIGN KEY (origen_agencia_id) REFERENCES agencia(id),
  FOREIGN KEY (destino_agencia_id) REFERENCES agencia(id),
  FOREIGN KEY (creado_por) REFERENCES usuario(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Cada caja/paquete con su etiqueta. Es lo que se sigue
CREATE TABLE bulto (
  id CHAR(36) NOT NULL,
  encomienda_id CHAR(36) NOT NULL,
  numero INT NOT NULL,
  qr_token CHAR(26) NOT NULL,
  codigo_legible CHAR(8) NOT NULL,
  peso_g INT NOT NULL,
  largo_mm INT NULL,
  ancho_mm INT NULL,
  alto_mm INT NULL,
  estado ENUM('registrado','pendiente_despacho','cargado','en_transito','descargado','recibido_agencia','pendiente_redespacho','disponible_retiro','entregado','anulado','retenido','devuelto') NOT NULL DEFAULT 'registrado',
  estado_previo ENUM('registrado','pendiente_despacho','cargado','en_transito','descargado','recibido_agencia','pendiente_redespacho','disponible_retiro','entregado','anulado','retenido','devuelto') NULL,
  version INT NOT NULL DEFAULT 0,
  viaje_actual_id CHAR(36) NULL,
  agencia_custodia_id CHAR(36) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_bulto_qr (qr_token),
  UNIQUE KEY uq_bulto_legible (codigo_legible),
  UNIQUE KEY uq_bulto_num (encomienda_id, numero),
  KEY ix_bulto_estado (estado),
  FOREIGN KEY (encomienda_id) REFERENCES encomienda(id),
  FOREIGN KEY (viaje_actual_id) REFERENCES viaje(id),
  FOREIGN KEY (agencia_custodia_id) REFERENCES agencia(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tramos que debe recorrer un bulto (agencia desde → agencia hasta)
CREATE TABLE bulto_tramo (
  id CHAR(36) NOT NULL,
  bulto_id CHAR(36) NOT NULL,
  orden INT NOT NULL,
  desde_agencia_id CHAR(36) NOT NULL,
  hasta_agencia_id CHAR(36) NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_tramo (bulto_id, orden),
  FOREIGN KEY (bulto_id) REFERENCES bulto(id),
  FOREIGN KEY (desde_agencia_id) REFERENCES agencia(id),
  FOREIGN KEY (hasta_agencia_id) REFERENCES agencia(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Lista de bultos de un viaje, versionada. cerrado_at NULL = borrador
CREATE TABLE manifiesto (
  id CHAR(36) NOT NULL,
  viaje_id CHAR(36) NOT NULL,
  version INT NOT NULL,
  cerrado_at DATETIME(3) NULL,
  cerrado_por CHAR(36) NULL,
  motivo_cambio TEXT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_manifiesto_ver (viaje_id, version),
  FOREIGN KEY (viaje_id) REFERENCES viaje(id),
  FOREIGN KEY (cerrado_por) REFERENCES usuario(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Un bulto en un manifiesto: en qué parada sube y en cuál baja. 'Continúa' NO se guarda, se deduce (sube < p < baja)
CREATE TABLE manifiesto_item (
  manifiesto_id CHAR(36) NOT NULL,
  bulto_id CHAR(36) NOT NULL,
  bulto_tramo_id CHAR(36) NOT NULL,
  sube_orden INT NOT NULL,
  baja_orden INT NOT NULL,
  PRIMARY KEY (manifiesto_id, bulto_id, bulto_tramo_id),
  CHECK (sube_orden < baja_orden),
  KEY ix_item_bulto (bulto_id),
  FOREIGN KEY (manifiesto_id) REFERENCES manifiesto(id),
  FOREIGN KEY (bulto_id) REFERENCES bulto(id),
  FOREIGN KEY (bulto_tramo_id) REFERENCES bulto_tramo(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Permiso para que el bus salga de una parada. Distinto de la salida real
CREATE TABLE autorizacion_salida (
  id CHAR(36) NOT NULL,
  viaje_id CHAR(36) NOT NULL,
  parada_orden INT NOT NULL,
  manifiesto_version INT NOT NULL,
  tipo ENUM('normal','excepcion_a') NOT NULL,
  solicitado_por CHAR(36) NULL,
  autorizado_por CHAR(36) NOT NULL,
  autorizado_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  motivo TEXT NULL,
  conteo_continuan INT NULL,
  invalidada_at DATETIME(3) NULL,
  invalidada_motivo VARCHAR(255) NULL,
  salida_real_at DATETIME(3) NULL,
  salida_real_por CHAR(36) NULL,
  vigente_key VARCHAR(60) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_autorizacion_vigente (vigente_key),
  CHECK (tipo = 'normal' OR (motivo IS NOT NULL AND solicitado_por IS NOT NULL AND solicitado_por <> autorizado_por)),
  FOREIGN KEY (viaje_id) REFERENCES viaje(id),
  FOREIGN KEY (solicitado_por) REFERENCES usuario(id),
  FOREIGN KEY (autorizado_por) REFERENCES usuario(id),
  FOREIGN KEY (salida_real_por) REFERENCES usuario(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Registro INMUTABLE de todo lo que pasa. Triggers impiden UPDATE y DELETE
CREATE TABLE evento (
  id CHAR(36) NOT NULL,
  tipo VARCHAR(40) NOT NULL,
  resultado VARCHAR(40) NULL,
  bulto_id CHAR(36) NULL,
  viaje_id CHAR(36) NULL,
  parada_orden INT NULL,
  actor_id CHAR(36) NOT NULL,
  device_id VARCHAR(80) NULL,
  ocurrido_declarado DATETIME(3) NULL,
  recibido_servidor DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  payload JSON NULL,
  corrige_evento_id CHAR(36) NULL,
  PRIMARY KEY (id),
  KEY ix_evento_bulto (bulto_id, recibido_servidor),
  KEY ix_evento_viaje (viaje_id, recibido_servidor),
  FOREIGN KEY (bulto_id) REFERENCES bulto(id),
  FOREIGN KEY (viaje_id) REFERENCES viaje(id),
  FOREIGN KEY (actor_id) REFERENCES usuario(id),
  FOREIGN KEY (corrige_evento_id) REFERENCES evento(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Problemas detectados (sobrante, faltante, descarga incorrecta, pasado de parada...)
CREATE TABLE incidencia (
  id CHAR(36) NOT NULL,
  tipo ENUM('faltante','sobrante','descarga_incorrecta','dano','etiqueta_ilegible','redespacho_vencido','retiro_vencido','discrepancia_recepcion','pasado_de_parada') NOT NULL,
  bulto_id CHAR(36) NULL,
  viaje_id CHAR(36) NULL,
  abierta_por_evento CHAR(36) NULL,
  abierta_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  resuelta_por_evento CHAR(36) NULL,
  resuelta_at DATETIME(3) NULL,
  nota TEXT NULL,
  PRIMARY KEY (id),
  KEY ix_incidencia_abiertas (resuelta_at, tipo),
  FOREIGN KEY (bulto_id) REFERENCES bulto(id),
  FOREIGN KEY (viaje_id) REFERENCES viaje(id),
  FOREIGN KEY (abierta_por_evento) REFERENCES evento(id),
  FOREIGN KEY (resuelta_por_evento) REFERENCES evento(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tarea de reenviar un bulto que bajó en una agencia intermedia. Sin estado propio: se deriva del bulto y del manifiesto
CREATE TABLE redespacho (
  id CHAR(36) NOT NULL,
  bulto_id CHAR(36) NOT NULL,
  agencia_resp_id CHAR(36) NOT NULL,
  recibido_at DATETIME(3) NOT NULL,
  due_at DATETIME(3) NOT NULL,
  cerrado_at DATETIME(3) NULL,
  PRIMARY KEY (id),
  KEY ix_redespacho_due (cerrado_at, due_at),
  FOREIGN KEY (bulto_id) REFERENCES bulto(id),
  FOREIGN KEY (agencia_resp_id) REFERENCES agencia(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Precio calculado para una encomienda, con la versión de tarifa usada
CREATE TABLE cotizacion (
  id CHAR(36) NOT NULL,
  encomienda_id CHAR(36) NOT NULL,
  via ENUM('manual') NOT NULL DEFAULT 'manual',
  tarifa_version_id CHAR(36) NULL,
  peso_total_g INT NULL,
  peso_fact_g INT NULL,
  valor_cent INT NOT NULL,
  sin_regla TINYINT(1) NOT NULL DEFAULT 0,
  responsable_id CHAR(36) NOT NULL,
  motivo VARCHAR(255) NULL,
  detalle JSON NULL,
  PRIMARY KEY (id),
  CHECK (sin_regla = 0 OR motivo IS NOT NULL),
  FOREIGN KEY (encomienda_id) REFERENCES encomienda(id),
  FOREIGN KEY (tarifa_version_id) REFERENCES tarifa_version(id),
  FOREIGN KEY (responsable_id) REFERENCES usuario(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Código de 6 dígitos para retirar. Solo se guarda el HMAC
CREATE TABLE codigo_retiro (
  id CHAR(36) NOT NULL,
  encomienda_id CHAR(36) NOT NULL,
  hmac CHAR(64) NOT NULL,
  expira_at DATETIME(3) NOT NULL,
  intentos INT NOT NULL DEFAULT 0,
  consumido_at DATETIME(3) NULL,
  invalidado_at DATETIME(3) NULL,
  creado_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  vigente_key CHAR(36) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_codigo_vigente (vigente_key),
  FOREIGN KEY (encomienda_id) REFERENCES encomienda(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Entrega al receptor (completa o parcial)
CREATE TABLE entrega (
  id CHAR(36) NOT NULL,
  encomienda_id CHAR(36) NOT NULL,
  parcial TINYINT(1) NOT NULL DEFAULT 0,
  entregado_por CHAR(36) NOT NULL,
  metodo ENUM('codigo','documento','tercero') NOT NULL,
  receptor_nombre VARCHAR(100) NOT NULL,
  receptor_doc VARCHAR(30) NULL,
  autorizado_por CHAR(36) NULL,
  motivo VARCHAR(255) NULL,
  at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  CHECK (parcial = 0 OR (autorizado_por IS NOT NULL AND motivo IS NOT NULL)),
  FOREIGN KEY (encomienda_id) REFERENCES encomienda(id),
  FOREIGN KEY (entregado_por) REFERENCES usuario(id),
  FOREIGN KEY (autorizado_por) REFERENCES usuario(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Qué bultos salieron en cada entrega
CREATE TABLE entrega_bulto (
  entrega_id CHAR(36) NOT NULL,
  bulto_id CHAR(36) NOT NULL,
  PRIMARY KEY (entrega_id, bulto_id),
  FOREIGN KEY (entrega_id) REFERENCES entrega(id),
  FOREIGN KEY (bulto_id) REFERENCES bulto(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Cola de avisos por WhatsApp (outbox). Si el envío falla, la operación continúa
CREATE TABLE notificacion (
  id CHAR(36) NOT NULL,
  dedupe_key VARCHAR(120) NOT NULL,
  encomienda_id CHAR(36) NULL,
  destinatario_tel VARCHAR(20) NOT NULL,
  plantilla VARCHAR(40) NOT NULL,
  cuerpo TEXT NOT NULL,
  estado ENUM('pendiente','enviando','enviada','entregada','leida','fallida','descartada') NOT NULL DEFAULT 'pendiente',
  intentos INT NOT NULL DEFAULT 0,
  next_attempt_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  proveedor_msg_id VARCHAR(120) NULL,
  ultimo_error TEXT NULL,
  creado_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  enviada_at DATETIME(3) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_notif_dedupe (dedupe_key),
  KEY ix_notif_cola (estado, next_attempt_at),
  FOREIGN KEY (encomienda_id) REFERENCES encomienda(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Configuración (nada va 'quemado' en el código)
CREATE TABLE parametro (
  clave VARCHAR(80) NOT NULL,
  valor JSON NOT NULL,
  PRIMARY KEY (clave)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Bitácora de acciones administrativas y búsquedas fallidas
CREATE TABLE audit_log (
  id BIGINT NOT NULL AUTO_INCREMENT,
  actor_id CHAR(36) NULL,
  accion VARCHAR(60) NOT NULL,
  entidad VARCHAR(40) NULL,
  entidad_id VARCHAR(60) NULL,
  antes JSON NULL,
  despues JSON NULL,
  at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Triggers: eventos inmutables (invariante 3) - Desactivados para hosting compartido sin privilegio TRIGGER
-- CREATE TRIGGER trg_evento_no_update BEFORE UPDATE ON evento FOR EACH ROW
--   SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'evento es inmutable';
-- CREATE TRIGGER trg_evento_no_delete BEFORE DELETE ON evento FOR EACH ROW
--   SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'evento es inmutable';

-- Estado derivado de la encomienda (invariante 10). MIN()=1 equivale a bool_and, MAX()=1 a bool_or
CREATE VIEW v_encomienda_estado AS
SELECT e.id,
  CASE
    WHEN MIN(b.estado = 'entregado') = 1 THEN 'entregada'
    WHEN MIN(b.estado IN ('disponible_retiro','entregado')) = 1 THEN 'disponible_retiro'
    WHEN MAX(b.estado = 'disponible_retiro') = 1 THEN 'parcialmente_disponible'
    WHEN MAX(b.estado IN ('cargado','en_transito')) = 1 THEN 'en_transito'
    ELSE 'en_proceso' END AS estado,
  COUNT(*) AS bultos
FROM encomienda e JOIN bulto b ON b.encomienda_id = e.id
WHERE b.estado <> 'anulado'
GROUP BY e.id;
