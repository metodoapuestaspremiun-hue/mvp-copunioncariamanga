-- Migración 002: Tripulación en el manifiesto
-- Agrega chofer y ayudante vinculados al cierre del manifiesto.
-- Ejecutar con: mysql -u <user> -p <db> < db/002_chofer_ayudante.sql

ALTER TABLE viaje
  ADD COLUMN ayudante              VARCHAR(80)  NULL AFTER conductor,
  ADD COLUMN conductor_usuario_id  CHAR(36)     NULL AFTER ayudante,
  ADD COLUMN ayudante_usuario_id   CHAR(36)     NULL AFTER conductor_usuario_id,
  ADD COLUMN manifiesto_cerrado_at DATETIME(3)  NULL AFTER ayudante_usuario_id,
  ADD COLUMN manifiesto_cerrado_por CHAR(36)    NULL AFTER manifiesto_cerrado_at,
  ADD CONSTRAINT fk_viaje_conductor_usr FOREIGN KEY (conductor_usuario_id) REFERENCES usuario(id),
  ADD CONSTRAINT fk_viaje_ayudante_usr  FOREIGN KEY (ayudante_usuario_id)  REFERENCES usuario(id),
  ADD CONSTRAINT fk_viaje_cerrado_por   FOREIGN KEY (manifiesto_cerrado_por) REFERENCES usuario(id);

-- Agregar índice para búsqueda rápida "mis viajes" del chofer/ayudante
CREATE INDEX ix_viaje_conductor_usr ON viaje(conductor_usuario_id);
CREATE INDEX ix_viaje_ayudante_usr  ON viaje(ayudante_usuario_id);
