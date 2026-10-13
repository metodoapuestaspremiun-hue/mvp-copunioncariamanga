-- seed.sql · DATOS DE DEMOSTRACIÓN (todo ficticio). Ejecutar después de 001_init_mvp.sql
-- Los usuarios se crean con password_hash vacío: el script `npm run seed:usuarios` pone el hash argon2id.
SET NAMES utf8mb4;
SET @quito=UUID(), @loja=UUID(), @zumba=UUID();
INSERT INTO agencia(id,nombre,ciudad) VALUES
 (@quito,'Agencia Quito (DEMO)','Quito'),(@loja,'Agencia Loja (DEMO)','Loja'),(@zumba,'Agencia Zumba (DEMO)','Zumba');

SET @ruta=UUID();
INSERT INTO ruta(id,nombre) VALUES (@ruta,'Quito - Loja - Zumba (DEMO)');
INSERT INTO parada(id,ruta_id,orden,nombre,agencia_id,tiene_guardia) VALUES
 (UUID(),@ruta,1,'Quito',@quito,0),(UUID(),@ruta,2,'Loja',@loja,0),(UUID(),@ruta,3,'Zumba',@zumba,0);

-- Usuarios (1 por rol de la demo, E-03). Contraseña inicial la define el script de seed.
SET @u_op=UUID(), @u_ay=UUID(), @u_su=UUID(), @u_ge=UUID();
INSERT INTO usuario(id,nombre,email,password_hash) VALUES
 (@u_op,'Operador Demo','operador@demo.local','PENDIENTE'),
 (@u_ay,'Ayudante Demo','ayudante@demo.local','PENDIENTE'),
 (@u_su,'Supervisor Demo','supervisor@demo.local','PENDIENTE'),
 (@u_ge,'Gerente Demo','gerente@demo.local','PENDIENTE');
-- Operador: también despacha. Supervisor: también hace de guardia/responsable. En las 3 agencias.
INSERT INTO usuario_rol(id,usuario_id,rol,agencia_id,agencia_key) VALUES
 (UUID(),@u_op,'operador',@quito,@quito),(UUID(),@u_op,'operador',@loja,@loja),(UUID(),@u_op,'operador',@zumba,@zumba),
 (UUID(),@u_op,'despachador',@quito,@quito),(UUID(),@u_op,'despachador',@loja,@loja),(UUID(),@u_op,'despachador',@zumba,@zumba),
 (UUID(),@u_ay,'ayudante',NULL,'todas'),
 (UUID(),@u_su,'supervisor',NULL,'todas'),(UUID(),@u_su,'guardia',NULL,'todas'),(UUID(),@u_su,'responsable_agencia',NULL,'todas'),
 (UUID(),@u_ge,'gerente',NULL,'todas');

-- TARIFAS DE DEMOSTRACIÓN (no son de la cooperativa)
SET @tv=UUID();
INSERT INTO tarifa_version(id,vigente_desde,factor_volumetrico,etiqueta,creada_por)
 VALUES (@tv,CURDATE(),5000,'TARIFAS DE DEMOSTRACIÓN',@u_su);
INSERT INTO tarifa_regla(id,tarifa_version_id,origen_agencia_id,destino_agencia_id,peso_fact_desde_g,peso_fact_hasta_g,precio_cent)
SELECT UUID(),@tv,p.o,p.d,r.desde,r.hasta,ROUND(r.base*p.factor)
FROM (SELECT @quito o,@loja d,1.0 factor UNION ALL SELECT @loja,@zumba,1.0 UNION ALL SELECT @quito,@zumba,1.8) p
JOIN (SELECT 0 desde,5000 hasta,300 base UNION ALL SELECT 5000,20000,700 UNION ALL SELECT 20000,50000,1500) r;

-- Parámetros (v5 §3.1, con plazo de redespacho corto para mostrar el vencimiento)
INSERT INTO parametro(clave,valor) VALUES
 ('redespacho.plazo_horas','1'),
 ('codigo_retiro.caducidad_dias','7'),
 ('codigo_retiro.max_intentos','5'),
 ('busqueda_manual.max_por_minuto','10'),
 ('descuento.umbral_supervisor_pct','5'),
 ('exigir_reescaneo_continuan','false'),
 ('exigir_escaneo_recepcion','true'),
 ('mensajes.max_por_encomienda','5'),
 ('mensajes.proveedor','"simulado"');
