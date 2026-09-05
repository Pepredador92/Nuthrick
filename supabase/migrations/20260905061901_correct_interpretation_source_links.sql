-- Editorial metadata correction before release; no range or historical snapshot changes.
update public.interpretation_references
set definition = definition || '{"url":"https://iris.who.int/bitstream/10665/42330/1/WHO_TRS_894.pdf","locator":"Clasificación internacional de IMC adulto; WHO TRS 894"}'::jsonb
where id='who-adult-bmi' and version='1.0.0';
update public.interpretation_references
set definition = definition || '{"locator":"Puntos de corte de cintura-cadera y riesgo de complicaciones metabólicas"}'::jsonb
where id='who-adult-whr' and version='1.0.0';
