-- Optional common consultation steps, independent of initial/follow-up interview designs.
-- Existing labels, response keys, approvals and closed histories are preserved.
create function private.with_consultation_workflow(p_structure jsonb) returns jsonb
language plpgsql immutable set search_path='' as $$
declare sections jsonb := p_structure->'sections'; section jsonb; question jsonb; missing jsonb;
  existing_keys text[]; section_keys text[]; key text; section_key text;
  seeds jsonb := $seeds$[{"section_key": "recall", "title": "Recordatorio de 24 horas", "description": "Primero escucha todo lo que comió y bebió desde que despertó hasta que se durmió, sin interrumpir. Después busca olvidos, completa horarios y cantidades, y revisa al final. Es un día concreto: no lo confundas con el consumo habitual ni calcules nutrientes sin una fuente de composición.", "questions": [{"question_key": "recall_date", "label": "Día al que corresponde el recordatorio", "question_type": "date", "response_area": "patient_reported", "is_required": false, "configuration": {}}, {"question_key": "recall_day_type", "label": "¿Cómo fue ese día?", "question_type": "select", "response_area": "patient_reported", "is_required": false, "configuration": {"options": ["Habitual entre semana", "Habitual de fin de semana", "Diferente por trabajo / viaje", "Enfermedad / poco apetito", "Celebración / evento", "Otro", "No sabe / no recuerda"]}}, {"question_key": "recall_24h_v2", "label": "1. Lista rápida · 3. Horarios · 4. Detalles", "question_type": "repeatable_group", "response_area": "patient_reported", "is_required": false, "configuration": {"fields": [{"key": "food", "label": "Alimento o bebida", "type": "text", "required": true, "placeholder": "Anota primero lo que recuerda"}, {"key": "occasion", "label": "Ocasión", "type": "select", "options": ["Desayuno", "Colación matutina", "Comida", "Colación vespertina", "Cena", "Consumo nocturno", "Otro"]}, {"key": "time", "label": "Hora", "type": "time"}, {"key": "amount", "label": "Cantidad y tamaño", "type": "text", "placeholder": "Ej. 1 taza, 2 tortillas, 1 pieza mediana"}, {"key": "preparation", "label": "Preparación", "type": "select", "options": ["Crudo", "Hervido / vapor", "Asado / plancha", "Horneado", "Frito", "Guisado", "Envasado", "Otra", "No sabe / no recuerda"], "detail": true}, {"key": "brand", "label": "Marca (si aplica)", "type": "text", "detail": true}, {"key": "ingredients", "label": "Ingredientes / aceite / azúcar", "type": "text", "detail": true}, {"key": "accompaniments", "label": "Salsas y acompañamientos", "type": "text", "detail": true}, {"key": "place", "label": "Lugar", "type": "select", "options": ["Casa", "Trabajo / escuela", "Restaurante", "Comedor", "Calle", "En traslado", "Otro"], "detail": true}], "add_label": "Agregar alimento o bebida"}, "help_text": "Un registro por alimento o preparación. “Completar detalles” permite hacer la segunda pasada sin perder la lista rápida."}, {"question_key": "recall_forgotten_review", "label": "2. Buscar olvidos: categorías que ya se preguntaron", "question_type": "multi_select", "response_area": "professional_assessment", "is_required": false, "configuration": {"options": ["Bebidas / agua", "Snacks / dulces", "Salsas / aderezos", "Aceites / grasas", "Alcohol", "Café / té", "Leche / azúcar añadida", "Probaditas al cocinar"], "exclusive_options": ["Ninguno referido", "No sabe / no recuerda", "Prefiere no responder", "Ninguna", "No utiliza", "Sin dificultades"]}, "help_text": "Marcar significa que se revisó, no que lo consumió. Si recuerda algo, agrégalo en la lista."}, {"question_key": "recall_final_check", "label": "5. ¿Falta algo por anotar de lo que comió o bebió?", "question_type": "select", "response_area": "professional_assessment", "is_required": false, "configuration": {"options": ["Revisado; no recuerda más", "Agregó alimentos y se revisó de nuevo", "Pendiente de completar"]}}]}, {"section_key": "workflow_pes", "title": "Diagnóstico PES", "questions": [{"question_key": "pes_problem", "label": "Problema nutricional", "question_type": "long_text", "response_area": "professional_assessment", "configuration": {"max_length": 2000}, "is_required": false}, {"question_key": "pes_etiology", "label": "Etiología", "question_type": "long_text", "response_area": "professional_assessment", "configuration": {"max_length": 2000}, "is_required": false}, {"question_key": "pes_evidence", "label": "Signos y síntomas", "question_type": "long_text", "response_area": "professional_assessment", "configuration": {"max_length": 2000}, "is_required": false}, {"question_key": "pes_statement", "label": "Redacción PES", "question_type": "long_text", "response_area": "professional_assessment", "configuration": {"max_length": 2000}, "is_required": false}]}, {"section_key": "workflow_objective", "title": "Objetivos acordados", "questions": [{"question_key": "treatment_objective", "label": "Objetivo acordado con el paciente", "question_type": "long_text", "response_area": "professional_assessment", "configuration": {"max_length": 2000}, "is_required": false}]}, {"section_key": "workflow_recommendations", "title": "Recomendaciones y seguimiento", "questions": [{"question_key": "first_actions", "label": "Indicaciones acordadas con el paciente", "question_type": "long_text", "response_area": "professional_assessment", "configuration": {"max_length": 2000}, "is_required": false}]}]$seeds$::jsonb;
begin
  if jsonb_typeof(sections) is distinct from 'array' then raise exception 'invalid_structure'; end if;
  select coalesce(array_agg(q->>'question_key'),'{}') into existing_keys
    from jsonb_array_elements(sections) s cross join lateral jsonb_array_elements(s->'questions') q;
  select coalesce(array_agg(s->>'section_key'),'{}') into section_keys from jsonb_array_elements(sections) s;
  for section in select value from jsonb_array_elements(seeds) loop
    missing := '[]';
    for question in select value from jsonb_array_elements(section->'questions') loop
      key := question->>'question_key';
      if key='treatment_objective' then
        if existing_keys && array['objectives','treatment_objective','next_objectives'] then continue; end if;
        if p_structure->>'consultation_type'='follow_up' then
          key := 'next_objectives'; question := jsonb_set(question,'{question_key}',to_jsonb(key));
        end if;
      end if;
      if not(key=any(existing_keys)) then missing := missing || jsonb_build_array(question); end if;
    end loop;
    if jsonb_array_length(missing)>0 then
      section_key := 'workflow_' || (section->>'section_key');
      while section_key=any(section_keys) loop section_key := section_key || '_extra'; end loop;
      sections := sections || jsonb_build_array(section || jsonb_build_object('section_key',section_key,'questions',missing));
      section_keys := array_append(section_keys,section_key);
    end if;
  end loop;
  return jsonb_set(p_structure,'{sections}',sections);
end $$;
revoke all on function private.with_consultation_workflow(jsonb) from public,anon,authenticated,service_role;

-- Only the current owned editable snapshot can be enriched. No arbitrary client structure is accepted.
create function private.prepare_consultation_workflow(p_consultation uuid,p_revision integer)
returns public.consultation_snapshots language plpgsql security definer set search_path='' as $$
declare owner uuid := (select auth.uid()); c public.consultations; s public.consultation_snapshots; next_structure jsonb;
begin
  if owner is null then raise exception 'context_unavailable' using errcode='42501'; end if;
  perform private.require_entitlement(owner,'consultations');
  select * into c from public.consultations where id=p_consultation and professional_id=owner
    and status='draft' and deleted_at is null for update;
  if not found then raise exception 'context_unavailable' using errcode='42501'; end if;
  select * into s from public.consultation_snapshots where consultation_id=c.id and professional_id=owner and patient_id=c.patient_id
    order by revision desc limit 1 for update;
  if s.id is null or s.revision<>p_revision then raise exception 'context_changed' using errcode='40001'; end if;
  next_structure := private.with_consultation_workflow(s.structure);
  if next_structure is distinct from s.structure then
    update public.consultation_snapshots set structure=next_structure where id=s.id returning * into s;
  end if;
  return s;
end $$;
revoke all on function private.prepare_consultation_workflow(uuid,integer) from public,anon,service_role;
grant execute on function private.prepare_consultation_workflow(uuid,integer) to authenticated;
create function public.prepare_consultation_workflow(p_consultation uuid,p_revision integer)
returns public.consultation_snapshots language sql security invoker set search_path='' as $$
  select private.prepare_consultation_workflow(p_consultation,p_revision);
$$;
revoke all on function public.prepare_consultation_workflow(uuid,integer) from public,anon,service_role;
grant execute on function public.prepare_consultation_workflow(uuid,integer) to authenticated;

-- Deploy the compatible AI Edge adapters before promoting these prompt versions.
update private.ai_feature_config set prompt_version='pes_diagnosis@4',updated_at=now()
  where feature='pes_diagnosis' and prompt_version='pes_diagnosis@3';
update private.ai_feature_config set prompt_version='consultation_support@3',updated_at=now()
  where feature='consultation_support' and prompt_version='consultation_support@2';
