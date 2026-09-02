-- Expand the default clinical guides. Most routine data is captured through
-- options so the professional can keep the conversation moving.

update public.consultation_template_sections s
set display_order = display_order + 20
from public.consultation_templates t
where t.id = s.template_id and t.template_key = 'system_initial_v1';

insert into public.consultation_template_sections (template_id, section_key, title, description, display_order)
select t.id, seed.section_key, seed.title, seed.description, seed.display_order
from public.consultation_templates t
cross join (values
  ('symptoms', 'Síntomas y señales', 'Explora sólo lo relevante al caso: “Quiero saber si hay molestias que estén afectando tu apetito, digestión, energía o relación con los alimentos.”', 2),
  ('weight_history', 'Historia de peso', 'Antes de interpretar una medición aislada, revisa su trayectoria: “Más que un número, me interesa entender cómo ha cambiado tu peso y qué estaba ocurriendo en esos periodos.”', 3),
  ('behavior_context', 'Conducta y contexto alimentario', 'Aborda con neutralidad: “No buscamos juzgar tu alimentación; quiero saber qué situaciones facilitan o dificultan comer como te gustaría.”', 6)
) as seed(section_key, title, description, display_order)
where t.template_key = 'system_initial_v1'
  and not exists (select 1 from public.consultation_template_sections s where s.template_id = t.id and s.section_key = seed.section_key);

update public.consultation_template_sections s
set display_order = case s.section_key
  when 'motivo' then 0 when 'health_history' then 1 when 'symptoms' then 2
  when 'weight_history' then 3 when 'dietary_pattern' then 4 when 'lifestyle' then 5
  when 'behavior_context' then 6 when 'anthropometry' then 7 when 'assessment' then 8
  when 'objectives' then 9 else s.display_order end,
description = case s.section_key
  when 'motivo' then '“Antes de hablar de dieta, quiero entender qué te trae a consulta, qué estás buscando y qué cosas pueden estar influyendo en tu alimentación.”'
  when 'health_history' then '“Para personalizar el acompañamiento necesito conocer los antecedentes de salud, tratamientos y restricciones relevantes. Sólo profundizaremos donde haga falta.”'
  when 'dietary_pattern' then '“Primero revisemos cómo comes en realidad, sin buscar perfección. Después veremos qué patrón se repite y qué cambios son posibles en tu rutina.”'
  when 'lifestyle' then '“El sueño, el movimiento y el horario no son datos aislados: influyen en energía, hambre y en qué tan viable será el plan.”'
  when 'anthropometry' then 'Registra los datos disponibles como mediciones, no como etiquetas. La interpretación se realiza después junto con la historia clínica y dietética.'
  when 'assessment' then '“Con lo que reunimos, voy a organizar los hallazgos para definir qué problema nutricional vamos a priorizar y por qué.”'
  when 'objectives' then '“No intentaremos cambiar todo a la vez. De lo que encontramos, elijamos de una a tres acciones concretas que sean realistas antes del seguimiento.”'
  else s.description end
from public.consultation_templates t
where t.id = s.template_id and t.template_key = 'system_initial_v1';

update public.consultation_template_sections s
set description = case s.section_key
  when 'progress' then '“Empecemos por tu experiencia: ¿cómo te fue desde la última consulta? No se trata de calificarte, sino de entender qué funcionó.”'
  when 'health_changes' then 'Revisa cambios relevantes de salud, síntomas, tratamiento y rutina; profundiza únicamente en lo que cambió o en lo que importa al caso.'
  when 'indicators' then 'Compara sólo los indicadores definidos anteriormente. El progreso no se limita al peso: pueden cambiar síntomas, energía, hábitos, glucosa o funcionamiento cotidiano.'
  when 'adjustments' then '“Si algo no se pudo hacer, busquemos la barrera y ajustemos el plan; no es un fracaso ni una falta de voluntad.”'
  when 'closure' then '“Antes de cerrar, acordemos exactamente qué se intentará hacer y cómo sabremos si está funcionando.”'
  else s.description end
from public.consultation_templates t
where t.id = s.template_id and t.template_key = 'system_follow_up_v1';

-- Convert broad narrative questions into structured, quick-to-complete fields.
update public.consultation_template_questions q
set question_type = seed.question_type, label = seed.label, help_text = seed.help_text,
    configuration = seed.configuration
from public.consultation_templates t
join public.consultation_template_sections s on s.template_id = t.id
join (values
  ('system_initial_v1','motivo','main_reason','select','Motivo principal de consulta','Elige el eje principal; podrás añadir contexto después.', '{"options":["Pérdida de peso","Ganancia de peso","Cambio de hábitos","Control metabólico","Digestión o síntomas","Nutrición deportiva","Embarazo o lactancia","Alimentación vegetariana/vegana","Otro"]}'::jsonb),
  ('system_initial_v1','motivo','expectations','multi_select','Qué busca lograr con el acompañamiento',null, '{"options":["Más energía","Mejorar síntomas","Mejorar glucosa o lípidos","Cambiar hábitos","Rendimiento físico","Composición corporal","Relación más tranquila con la comida","Otro"]}'::jsonb),
  ('system_initial_v1','health_history','personal_history','multi_select','Antecedentes personales relevantes',null, '{"options":["Diabetes o prediabetes","Hipertensión","Dislipidemia","Enfermedad tiroidea","Enfermedad renal","Enfermedad hepática","Enfermedad cardiovascular","Gastrointestinal","Anemia o deficiencias","Ninguno conocido","Otro"]}'::jsonb),
  ('system_initial_v1','health_history','family_history','multi_select','Antecedentes familiares relevantes',null, '{"options":["Diabetes","Hipertensión","Dislipidemia","Enfermedad cardiovascular precoz","Enfermedad renal","Enfermedad tiroidea","Obesidad","Cáncer relevante","Ninguno conocido","No sabe"]}'::jsonb),
  ('system_initial_v1','health_history','allergies','multi_select','Alergias, intolerancias o restricciones',null, '{"options":["Alergia confirmada","Intolerancia diagnosticada","Intolerancia percibida","Restricción cultural o religiosa","Vegetariana/vegana","Ninguna referida","Otro"]}'::jsonb),
  ('system_initial_v1','health_history','diagnoses','repeatable_group','Diagnósticos actuales','Agrega sólo los que requieran contexto clínico.', '{"fields":[{"key":"diagnostico","label":"Diagnóstico"},{"key":"desde","label":"Desde cuándo","type":"date"},{"key":"seguimiento","label":"Seguimiento","type":"select","options":["Controlado","En estudio","Sin seguimiento"]}]}'::jsonb),
  ('system_initial_v1','health_history','medications','repeatable_group','Medicamentos','Incluye tratamiento indicado y productos de libre venta relevantes.', '{"fields":[{"key":"nombre","label":"Medicamento"},{"key":"dosis","label":"Dosis"},{"key":"frecuencia","label":"Frecuencia","type":"select","options":["Diario","2 veces al día","Semanal","Según necesidad","Otro"]},{"key":"motivo","label":"Motivo"}]}'::jsonb),
  ('system_initial_v1','health_history','supplements','repeatable_group','Suplementos y productos de apoyo',null, '{"fields":[{"key":"nombre","label":"Producto"},{"key":"dosis","label":"Dosis"},{"key":"frecuencia","label":"Frecuencia","type":"select","options":["Diario","Días de entrenamiento","Semanal","Ocasional"]},{"key":"motivo","label":"Motivo"}]}'::jsonb),
  ('system_initial_v1','dietary_pattern','usual_pattern','multi_select','Patrón habitual más frecuente',null, '{"options":["Desayuna la mayoría de los días","Salta comidas","Come fuera de casa con frecuencia","Come de noche","Pica entre comidas","Prepara comida en casa","Suele comer con prisa","Horario regular","Horario variable"]}'::jsonb),
  ('system_initial_v1','dietary_pattern','meal_schedule','select','Regularidad de horarios de comida',null, '{"options":["Regular la mayoría de los días","Variable por trabajo/estudio","Variable por familia/cuidados","Turnos nocturnos","No identificado"]}'::jsonb),
  ('system_initial_v1','dietary_pattern','hydration','select','Hidratación habitual',null, '{"options":["Menos de 2 vasos/día","2 a 4 vasos/día","5 a 7 vasos/día","8 o más vasos/día","No sabe"]}'::jsonb),
  ('system_initial_v1','dietary_pattern','recall_24h','repeatable_group','Recordatorio de 24 horas','Pide primero una lista rápida y luego registra horario, preparación y contexto.', '{"fields":[{"key":"momento","label":"Momento","type":"select","options":["Desayuno","Colación","Comida","Cena","Después de cenar","Otro"]},{"key":"hora","label":"Hora","type":"time"},{"key":"alimento","label":"Alimento o bebida"},{"key":"porcion","label":"Porción aproximada"},{"key":"contexto","label":"Lugar o contexto","type":"select","options":["Casa","Trabajo/estudio","Restaurante","Calle","Traslado","Otro"]}]}'::jsonb),
  ('system_initial_v1','lifestyle','sleep','select','Horas de sueño habituales',null, '{"options":["Menos de 5 h","5 a 6 h","6 a 7 h","7 a 9 h","Más de 9 h","Turno nocturno o variable"]}'::jsonb),
  ('system_initial_v1','lifestyle','physical_activity','select','Movimiento y actividad física habitual',null, '{"options":["Principalmente sedentario","Activo en trabajo o traslados","Ejercicio 1-2 días/semana","Ejercicio 3-4 días/semana","Ejercicio 5+ días/semana","Limitado por lesión o condición"]}'::jsonb),
  ('system_initial_v1','lifestyle','stress','select','Estrés percibido reciente',null, '{"options":["Bajo","Moderado","Alto","Muy alto","Prefiere no responder"]}'::jsonb),
  ('system_initial_v1','lifestyle','schedule_constraints','multi_select','Factores de rutina que condicionan el plan',null, '{"options":["Trabajo/estudio","Traslados","Cuidado de familia","Tiempo limitado","No puede calentar comida","Presupuesto","Viajes","Turnos","Ninguno identificado","Otro"]}'::jsonb),
  ('system_follow_up_v1','progress','changes_since_last','multi_select','Cambios que pudo implementar',null, '{"options":["Horarios de comida","Hidratación","Verduras/fruta","Bebidas azucaradas","Preparación de alimentos","Actividad física","Sueño","Registro o automonitoreo","Ninguno todavía"]}'::jsonb),
  ('system_follow_up_v1','progress','progress_perception','select','Cómo percibe su progreso',null, '{"options":["Mejoró claramente","Mejoró un poco","Sin cambios","Empeoró","No está seguro"]}'::jsonb),
  ('system_follow_up_v1','health_changes','symptoms_changes','multi_select','Síntomas o molestias desde la última consulta',null, '{"options":["Mejoraron","Sin cambios","Empeoraron","Apareció un síntoma nuevo","No hubo síntomas relevantes"]}'::jsonb),
  ('system_follow_up_v1','health_changes','medical_changes','multi_select','Cambios de salud o tratamiento',null, '{"options":["Nuevo diagnóstico","Cambio de medicamento","Cambio de suplemento","Nuevo estudio de laboratorio","Lesión","Ninguno relevante","Otro"]}'::jsonb),
  ('system_follow_up_v1','adjustments','barriers','multi_select','Barreras encontradas',null, '{"options":["Tiempo","Hambre","Preparación","Costo","Trabajo","Viajes","Familia","Sabor","Eventos sociales","Estrés","Sueño","Plan demasiado restrictivo","Acceso a alimentos","Ninguna identificada","Otra"]}'::jsonb),
  ('system_follow_up_v1','adjustments','facilitators','multi_select','Qué facilitó el cambio',null, '{"options":["Apoyo familiar","Plan práctico","Mejor organización","Más energía","Mejor sueño","Acceso a alimentos","Recordatorios","Entrenamiento","Otro"]}'::jsonb),
  ('system_follow_up_v1','adjustments','adjustments','repeatable_group','Ajustes acordados',null, '{"fields":[{"key":"ajuste","label":"Ajuste"},{"key":"motivo","label":"Motivo","type":"select","options":["Síntomas","Barreras","Preferencia","Resultado clínico","Cambio de rutina"]},{"key":"como","label":"Cómo aplicarlo"}]}'::jsonb),
  ('system_follow_up_v1','closure','next_objectives','repeatable_group','Objetivos del siguiente periodo','Limita a 1–3 objetivos conductuales concretos.', '{"fields":[{"key":"objetivo","label":"Objetivo"},{"key":"prioridad","label":"Prioridad","type":"select","options":["Principal","Secundaria"]},{"key":"revision","label":"Revisión","type":"date"}]}'::jsonb)
) as seed(template_key, section_key, question_key, question_type, label, help_text, configuration)
  on s.template_id = t.id and s.section_key = seed.section_key
where t.template_key = seed.template_key and q.section_id = s.id and q.question_key = seed.question_key;

with seed(template_key, section_key, question_key, label, question_type, response_area, display_order, configuration) as (
  values
  ('system_initial_v1','motivo','consultation_now','¿Qué hizo que buscara consulta ahora?','select','patient_reported',10,'{"options":["Cambio reciente de salud","Cambio de peso","Recomendación médica","Evento de vida","Nuevo objetivo físico","Motivación personal","Otro"]}'::jsonb),
  ('system_initial_v1','motivo','trigger_events','Eventos que pueden estar influyendo','multi_select','patient_reported',11,'{"options":["Enfermedad","Embarazo/lactancia","Medicamentos","Cambio laboral","Duelo","Lesión","Sedentarismo","Cambio de ciudad","Estrés","Alteración de sueño","Entrenamiento","Cirugía","Ninguno identificado"]}'::jsonb),
  ('system_initial_v1','motivo','previous_care_learning','Experiencia previa con planes nutricionales','select','patient_reported',12,'{"options":["Nunca tuvo","Le funcionó parcialmente","Fue muy restrictivo","No se adaptó a su rutina","Le generó ansiedad o culpa","Otro"]}'::jsonb),
  ('system_initial_v1','health_history','surgeries_hospitalizations','Cirugías u hospitalizaciones relevantes','multi_select','patient_reported',10,'{"options":["Ninguna","Cirugía digestiva","Cirugía bariátrica","Otra cirugía","Hospitalización reciente","Otra"]}'::jsonb),
  ('system_initial_v1','health_history','substances','Alcohol, tabaco u otras sustancias','multi_select','patient_reported',11,'{"options":["No refiere","Alcohol ocasional","Alcohol semanal","Tabaco/vapeo","Otra sustancia","Prefiere no responder"]}'::jsonb),
  ('system_initial_v1','symptoms','digestive_screen','Síntomas digestivos actuales','multi_select','patient_reported',0,'{"options":["Sin síntomas relevantes","Apetito bajo","Saciedad precoz","Náusea","Vómito","Reflujo","Distensión","Dolor abdominal","Flatulencia","Diarrea","Estreñimiento","Dificultad para masticar","Dificultad para deglutir"]}'::jsonb),
  ('system_initial_v1','symptoms','bowel_frequency','Frecuencia de evacuaciones','select','patient_reported',1,'{"options":["Menos de 3 por semana","3 a 6 por semana","1 al día","Más de 1 al día","No desea responder"]}'::jsonb),
  ('system_initial_v1','symptoms','general_symptoms','Síntomas generales','multi_select','patient_reported',2,'{"options":["Fatiga","Debilidad","Mareo","Sed excesiva","Orina frecuente","Cambio de apetito","Edema","Ninguno relevante"]}'::jsonb),
  ('system_initial_v1','symptoms','skin_hair_nails','Piel, cabello o uñas','multi_select','patient_reported',3,'{"options":["Caída de cabello","Fragilidad ungueal","Cambios cutáneos","Lesiones orales","Ninguno relevante"]}'::jsonb),
  ('system_initial_v1','weight_history','weight_trend','Trayectoria de peso relevante','repeatable_group','patient_reported',0,'{"fields":[{"key":"momento","label":"Momento","type":"select","options":["Actual","Hace 6 meses","Hace 1 año","Peso habitual","Máximo adulto","Mínimo adulto"]},{"key":"peso","label":"Peso (kg)","type":"number"},{"key":"contexto","label":"Contexto"}]}'::jsonb),
  ('system_initial_v1','weight_history','recent_weight_change','Cambio de peso reciente','select','patient_reported',1,'{"options":["Sin cambio relevante","Aumentó","Disminuyó","Fluctúa con frecuencia","No sabe"]}'::jsonb),
  ('system_initial_v1','weight_history','weight_change_intention','El cambio fue intencional','select','patient_reported',2,'{"options":["Sí","No","Parcialmente","No aplica"]}'::jsonb),
  ('system_initial_v1','dietary_pattern','food_frequency','Grupos que se consumen con frecuencia','multi_select','patient_reported',10,'{"options":["Verduras","Fruta","Leguminosas","Cereales integrales","Lácteos","Carne roja","Pescado","Huevo","Embutidos","Comida rápida","Dulces/panadería","Bebidas azucaradas","Alcohol"]}'::jsonb),
  ('system_initial_v1','dietary_pattern','meal_environment','Contexto habitual al comer','multi_select','patient_reported',11,'{"options":["En casa","Trabajo/escuela","Restaurante/comedor","Calle","Frente a pantallas","Con familia","A solas","Con prisa"]}'::jsonb),
  ('system_initial_v1','lifestyle','sleep_quality','Calidad de sueño percibida','select','patient_reported',10,'{"options":["Reparador","Interrumpido","Despierta cansado","Ronca o sospecha pausas","Variable"]}'::jsonb),
  ('system_initial_v1','lifestyle','exercise_limitations','Limitaciones para actividad','multi_select','patient_reported',11,'{"options":["Ninguna","Dolor","Lesión","Falta de tiempo","Condición médica","Cansancio","Otro"]}'::jsonb),
  ('system_initial_v1','behavior_context','eating_drivers','Situaciones que influyen al comer','multi_select','patient_reported',0,'{"options":["Hambre física","Estrés","Aburrimiento","Ansiedad","Eventos sociales","Cansancio","Disponibilidad de alimentos","Horario","Ninguna identificada"]}'::jsonb),
  ('system_initial_v1','behavior_context','eating_behaviors','Conductas alimentarias relevantes','multi_select','patient_reported',1,'{"options":["Come rápido","Come hasta sentirse muy lleno","Se salta comidas para compensar","Siente culpa al comer","Pierde el control al comer","Tiene alimentos prohibidos","No identifica estas conductas"]}'::jsonb),
  ('system_initial_v1','behavior_context','food_access','Acceso y preparación de alimentos','multi_select','patient_reported',2,'{"options":["Compra alimentos","Otra persona compra","Cocina en casa","Necesita opciones sin cocina","Presupuesto limitado","Acceso limitado cerca de casa/trabajo","Sin barreras identificadas"]}'::jsonb),
  ('system_initial_v1','anthropometry','waist_measurement','Cintura (cm), si se midió','number','professional_assessment',10,'{}'::jsonb),
  ('system_initial_v1','assessment','problem_domain','Dominio principal del problema nutricional','multi_select','professional_assessment',10,'{"options":["Ingesta","Clínico/bioquímico","Antropométrico","Conducta/entorno","Conocimiento/habilidades"]}'::jsonb),
  ('system_initial_v1','objectives','followup_indicators','Indicadores para seguimiento','multi_select','professional_assessment',10,'{"options":["Peso o cintura","Síntomas","Glucosa/HbA1c","Laboratorios","Hidratación","Verduras/fruta","Bebidas azucaradas","Actividad física","Sueño","Hambre/saciedad","Adherencia"]}'::jsonb),
  ('system_follow_up_v1','health_changes','symptom_detail','Síntomas relevantes a revisar','multi_select','patient_reported',10,'{"options":["Hambre","Saciedad","Energía","Digestión","Evacuaciones","Sueño","Antojos","Entrenamiento","Síntoma nuevo","Ninguno relevante"]}'::jsonb),
  ('system_follow_up_v1','indicators','indicators_reviewed','Indicadores revisados hoy','multi_select','professional_assessment',10,'{"options":["Peso o cintura","Síntomas","Glucosa/HbA1c","Laboratorios","Hidratación","Verduras/fruta","Bebidas azucaradas","Actividad física","Sueño","Hambre/saciedad","Adherencia"]}'::jsonb),
  ('system_follow_up_v1','indicators','diagnosis_status','Estado del problema nutricional','select','professional_assessment',11,'{"options":["Activo","Mejorando","Resuelto","Nuevo problema"]}'::jsonb),
  ('system_follow_up_v1','closure','plan_decision','Decisión para el siguiente periodo','multi_select','professional_assessment',10,'{"options":["Mantener lo que funciona","Modificar una estrategia","Agregar un objetivo","Solicitar/revisar estudio","Derivar o trabajo interdisciplinario"]}'::jsonb)
)
insert into public.consultation_template_questions (section_id, question_key, label, question_type, response_area, display_order, configuration)
select s.id, seed.question_key, seed.label, seed.question_type, seed.response_area, seed.display_order, seed.configuration
from seed
join public.consultation_templates t on t.template_key = seed.template_key
join public.consultation_template_sections s on s.template_id = t.id and s.section_key = seed.section_key
on conflict (section_id, question_key) do nothing;
