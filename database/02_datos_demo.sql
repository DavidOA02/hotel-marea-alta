-- =====================================================================
--  HOTEL MAREA ALTA — Datos de demostración (opcional)
--  ~15 meses de actividad ficticia (12 atrás, 3 adelante) para el panel
--  y Power BI. Ejecutar DESPUÉS de 01_esquema.sql. NO usar en producción.
-- =====================================================================
DO $$
DECLARE
  nombres   text[] := ARRAY['Lucia','Mateo','Valeria','Diego','Camila','Andres','Sofia','Jorge','Daniela','Carlos','Fernanda','Renato','Ximena','Gonzalo','Mariana','Rodrigo','Alessandra','Piero','Claudia','Sebastian'];
  apellidos text[] := ARRAY['Quispe','Flores','Rojas','Garcia','Huaman','Torres','Mendoza','Vargas','Castillo','Ramos','Chavez','Salazar','Paredes','Gutierrez','Smith','Muller','Rossi','Silva','Fernandez','Lopez'];
  k int; ext boolean; nom text; ape text;
  hab record; d date; entrada date; salida date; noches int; gap int; mes int; r int;
  cli int; resid text; exon boolean; bruto numeric; sub numeric; v_igv numeric; v_total numeric;
  v_estado text; v_canal text; fres timestamptz; rid int; hoy date := (now() AT TIME ZONE 'America/Lima')::date;
BEGIN
  IF EXISTS (SELECT 1 FROM reservas) THEN
    RAISE EXCEPTION 'La tabla reservas ya tiene datos. Ejecuta primero 01_esquema.sql para empezar limpio.';
  END IF;

  FOR k IN 1..150 LOOP
    nom := nombres[1 + floor(random() * 20)::int];
    ape := apellidos[1 + floor(random() * 20)::int];
    ext := random() < 0.22;
    INSERT INTO clientes (nombres, apellidos, tipo_documento, numero_documento, email, codigo_pais, telefono, residencia, acepta_publicidad, fecha_registro)
    VALUES (nom, ape, CASE WHEN ext THEN 'PAS' ELSE 'DNI' END,
            CASE WHEN ext THEN 'PA' || lpad(k::text, 7, '0') ELSE (40000000 + k * 37)::text END,
            lower(nom || '.' || ape || k || '@correo.com'),
            CASE WHEN ext THEN (ARRAY['1','56','54','34','49'])[1 + floor(random() * 5)::int] ELSE '51' END,
            CASE WHEN ext THEN '555' || lpad((k * 911)::text, 7, '0') ELSE '9' || lpad((10000000 + k * 4513)::text, 8, '0') END,
            CASE WHEN ext THEN 'EXT' ELSE 'PE' END, random() < 0.4, now() - (floor(random() * 400) || ' days')::interval);
  END LOOP;

  FOR hab IN SELECT h.id, t.precio_noche, t.capacidad FROM habitaciones h JOIN tipos_habitacion t ON t.id = h.tipo_habitacion_id LOOP
    d := hoy - interval '12 months' + (floor(random() * 5) || ' days')::interval;
    WHILE d < hoy + interval '3 months' LOOP
      mes := extract(month FROM d);
      gap := CASE WHEN mes IN (1,2,3,12) OR (mes = 7 AND extract(day FROM d) >= 20) THEN floor(random() * 2)
                  WHEN extract(isodow FROM d) >= 5 THEN floor(random() * 3) ELSE floor(random() * 6) END;
      entrada := d + gap;
      EXIT WHEN entrada >= hoy + interval '3 months';
      noches := 1 + floor(random() * 4);
      salida := entrada + noches;
      SELECT id, residencia INTO cli, resid FROM clientes ORDER BY random() LIMIT 1;
      exon := resid = 'EXT';
      bruto := hab.precio_noche * noches;
      sub := round(bruto / 1.18, 2);
      v_igv := CASE WHEN exon THEN 0 ELSE bruto - sub END;
      v_total := sub + v_igv;
      fres := (entrada - (1 + floor(random() * 45))::int)::timestamptz + (floor(random() * 1440) || ' minutes')::interval;
      IF fres > now() THEN fres := now() - (1 + floor(random() * 72) || ' hours')::interval; END IF;
      r := floor(random() * 100);
      v_estado := CASE WHEN salida <= hoy THEN CASE WHEN r < 6 THEN 'Cancelada' WHEN r < 9 THEN 'NoShow' ELSE 'CheckOut' END
                       WHEN entrada <= hoy THEN 'CheckIn'
                       ELSE CASE WHEN r < 8 THEN 'Cancelada' ELSE 'Confirmada' END END;
      v_canal := (ARRAY['Web','Web','Web','Web','Web','Web','WhatsApp','WhatsApp','WhatsApp','Telefono'])[1 + floor(random() * 10)::int];
      INSERT INTO reservas (codigo, cliente_id, habitacion_id, fecha_entrada, fecha_salida, huespedes, exonerado_igv, subtotal, igv, total,
                            estado, canal, fecha_reserva, fecha_cancelacion, fecha_check_in, fecha_check_out, registrado_por)
      VALUES ('TMP' || substr(md5(random()::text), 1, 14), cli, hab.id, entrada, salida, 1 + floor(random() * hab.capacidad),
              exon, sub, v_igv, v_total, v_estado, v_canal, fres,
              CASE WHEN v_estado = 'Cancelada' THEN fres + interval '1 day' END,
              CASE WHEN v_estado IN ('CheckIn','CheckOut') THEN entrada + interval '15 hours' END,
              CASE WHEN v_estado = 'CheckOut' THEN salida + interval '11 hours' END,
              CASE WHEN v_canal = 'Web' THEN NULL ELSE 'Recepción' END)
      RETURNING id INTO rid;
      IF v_estado IN ('CheckOut','CheckIn') THEN
        INSERT INTO pagos (reserva_id, monto, moneda, monto_soles, metodo, estado, fecha_pago, registrado_por)
        VALUES (rid, CASE WHEN v_estado = 'CheckIn' THEN round(v_total / 2, 2) ELSE v_total END, 'PEN',
                CASE WHEN v_estado = 'CheckIn' THEN round(v_total / 2, 2) ELSE v_total END,
                (ARRAY['Tarjeta','Tarjeta','Yape','Plin','Transferencia','Efectivo'])[1 + floor(random() * 6)::int],
                'Aprobado', entrada + interval '15 hours', 'Recepción');
      END IF;
      d := salida;
    END LOOP;
  END LOOP;

  UPDATE reservas SET codigo = 'MA' || to_char(fecha_reserva, 'YY') || lpad(id::text, 5, '0') WHERE codigo LIKE 'TMP%';
  UPDATE habitaciones h SET estado_limpieza = 'Sucia'
  WHERE EXISTS (SELECT 1 FROM reservas r WHERE r.habitacion_id = h.id AND r.estado = 'CheckOut' AND r.fecha_salida = hoy);

  INSERT INTO reclamaciones (numero, anio, correlativo, fecha, tipo, nombre_completo, tipo_documento, numero_documento, domicilio, telefono, email,
                             bien_tipo, monto_reclamado, descripcion_bien, detalle, pedido, estado, fecha_limite_respuesta, respuesta, fecha_respuesta)
  VALUES ('00001-' || extract(year FROM hoy), extract(year FROM hoy), 1, now() - interval '40 days', 'Reclamo', 'Carlos Ramos', 'DNI', '40000111',
          'Av. Arequipa 1200, Lima', '987111222', 'carlos.ramos@correo.com', 'Servicio', 180, 'Hospedaje en Habitación Duna',
          'El aire acondicionado no funcionó la primera noche.', 'Devolución de una noche.', 'Respondido', hoy - 19,
          'Lamentamos lo ocurrido. Se devolvió el importe de una noche a su tarjeta.', now() - interval '35 days'),
         ('00002-' || extract(year FROM hoy), extract(year FROM hoy), 2, now() - interval '6 days', 'Queja', 'Mariana Torres', 'DNI', '40000222',
          'Calle Los Pinos 45, Ica', '986333444', 'mariana.torres@correo.com', 'Servicio', NULL, 'Atención en recepción',
          'Demora de 40 minutos en el check-in.', 'Mejorar los tiempos de atención.', 'Pendiente', hoy + 15, NULL, NULL);

  INSERT INTO suscriptores (email) SELECT email FROM clientes WHERE acepta_publicidad ORDER BY id LIMIT 40;
END $$;

SELECT estado_reserva, count(*) AS reservas, sum(total) AS total FROM vw_reservas_powerbi GROUP BY estado_reserva ORDER BY reservas DESC;
