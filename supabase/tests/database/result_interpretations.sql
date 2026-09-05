-- Runs inside a transaction and leaves no test patients or changes behind.
begin;
do $$
declare refs jsonb; ctx jsonb := '{"age":34,"sex":"male","pregnant":false,"bmi":28}'; r record; result jsonb;
begin
  select jsonb_agg(definition) into refs from public.interpretation_references where active;
  for r in select * from (values
    ('bmi',18.49999,'underweight'),('bmi',18.5,'normal'),('bmi',24.96,'normal'),('bmi',24.99999,'normal'),('bmi',25,'overweight'),('bmi',29.99999,'overweight'),('bmi',30,'obesity-i'),('bmi',34.99999,'obesity-i'),('bmi',35,'obesity-ii'),('bmi',39.99999,'obesity-ii'),('bmi',40,'obesity-iii'),
    ('waist_hip_ratio',0.89999,'male-below'),('waist_hip_ratio',0.9,'male-increased'),
    ('waist_height_ratio',0.39,null),('waist_height_ratio',0.4,'healthy'),('waist_height_ratio',0.49,'healthy'),('waist_height_ratio',0.5,'increased'),('waist_height_ratio',0.59,'increased'),('waist_height_ratio',0.6,'high')
  ) t(code,val,expected) loop
    result:=private.interpret_result(r.code,r.val,case when r.code='bmi' then 'kg/m²' else 'razón' end,ctx,refs,null);
    if result->'rule'->>'id' is distinct from r.expected then raise exception 'Boundary failed: %',r; end if;
  end loop;
  for r in select * from (values (0.84999,'female-below'),(0.85,'female-increased')) t(val,expected) loop
    result:=private.interpret_result('waist_hip_ratio',r.val,'razón',ctx || '{"sex":"female"}',refs,null);
    if result->'rule'->>'id' is distinct from r.expected then raise exception 'Female boundary failed'; end if;
  end loop;
  for r in select * from (values
    ('bmi','{"age":null}'::jsonb,'missing_context'),('bmi','{"age":17}','not_applicable'),('bmi','{"pregnant":null}','missing_context'),('bmi','{"pregnant":true}','not_applicable'),
    ('waist_hip_ratio','{"sex":null}','missing_context'),('waist_height_ratio','{"bmi":null}','missing_context'),('waist_height_ratio','{"bmi":35}','not_applicable')
  ) t(code,context_patch,expected) loop
    result:=private.interpret_result(r.code,28,case when r.code='bmi' then 'kg/m²' else 'razón' end,ctx || r.context_patch,refs,null);
    if result->>'state' <> r.expected then raise exception 'Context failed: %',r; end if;
  end loop;
  if private.interpret_result('body_fat_jp7_siri',20,'%',ctx,refs,null)->>'state' <> 'no_reference' then raise exception 'Invented fat interpretation'; end if;
  if private.interpret_result('fat_mass_jp7_siri',16,'kg',ctx,refs,null)->>'state' <> 'no_reference' then raise exception 'Invented fat-mass interpretation'; end if;
  if private.interpret_result('fat_free_mass_jp7_siri',64,'kg',ctx,refs,null)->>'state' <> 'no_reference' then raise exception 'Invented fat-free-mass interpretation'; end if;

  for r in select * from (values
    (2.74,'low',2.5),(2.75,'moderate',3.0),(5.24,'moderate',5.0),
    (5.25,'high',5.5),(7.24,'high',7.0),(7.25,'very-high',7.5)
  ) t(val,expected,evaluated) loop
    result:=private.interpret_result('somatotype_endomorphy',r.val,'componente',ctx,refs,null);
    if result->'rule'->>'id' is distinct from r.expected
      or (result->>'evaluatedValue')::numeric is distinct from r.evaluated
      or (result->>'value')::numeric is distinct from r.val
    then raise exception 'Heath-Carter component boundary failed: %',r; end if;
  end loop;
  if private.interpret_result('somatotype_endomorphy',0.1,'componente',ctx,refs,null)->>'state' <> 'not_applicable'
    then raise exception 'Component lower bound was extended'; end if;

  for r in select * from (values
    ('central',3.0,3.0,4.0),
    ('balanced-endomorph',4.0,2.0,2.0),
    ('mesomorphic-endomorph',5.0,3.0,2.0),
    ('mesomorph-endomorph',4.0,4.0,2.0),
    ('endomorphic-mesomorph',3.0,5.0,1.0),
    ('balanced-mesomorph',2.0,5.0,2.0),
    ('ectomorphic-mesomorph',2.0,5.0,3.0),
    ('mesomorph-ectomorph',2.0,4.0,4.0),
    ('mesomorphic-ectomorph',2.0,3.0,4.0),
    ('balanced-ectomorph',2.0,2.0,4.0),
    ('endomorphic-ectomorph',3.0,1.0,5.0),
    ('endomorph-ectomorph',4.0,2.0,4.0),
    ('ectomorphic-endomorph',5.0,2.0,4.0)
  ) t(expected,endo,meso,ecto) loop
    if private.heath_carter_somatotype_category(jsonb_build_object(
      'somatotype_endomorphy',r.endo,
      'somatotype_mesomorphy',r.meso,
      'somatotype_ectomorphy',r.ecto
    )) is distinct from r.expected then raise exception 'Somatotype category failed: %',r; end if;
    result:=private.interpret_result(
      'somatochart_coordinates',r.ecto-r.endo,'coordenadas',
      ctx || jsonb_build_object('somatotypeCategory',r.expected),refs,null
    );
    if result->'rule'->>'id' is distinct from r.expected then raise exception 'Somatotype interpretation failed: %',r; end if;
  end loop;
  if private.heath_carter_somatotype_category('{"somatotype_endomorphy":3,"somatotype_mesomorphy":5}'::jsonb) is not null
    then raise exception 'Incomplete somatotype was classified'; end if;
  if private.heath_carter_somatotype_category('{"somatotype_endomorphy":3,"somatotype_mesomorphy":3,"somatotype_ectomorphy":4}'::jsonb) <> 'central'
    or private.heath_carter_somatotype_category('{"somatotype_endomorphy":3,"somatotype_mesomorphy":3,"somatotype_ectomorphy":4.01}'::jsonb) <> 'balanced-ectomorph'
    or private.heath_carter_somatotype_category('{"somatotype_endomorphy":4,"somatotype_mesomorphy":3.5,"somatotype_ectomorphy":2}'::jsonb) <> 'mesomorph-endomorph'
    or private.heath_carter_somatotype_category('{"somatotype_endomorphy":4,"somatotype_mesomorphy":3.49,"somatotype_ectomorphy":2}'::jsonb) <> 'mesomorphic-endomorph'
    then raise exception 'Somatotype tolerance boundary failed'; end if;
  if private.interpret_result('somatochart_coordinates',0,'coordenadas',ctx,refs,null)->>'state' <> 'missing_context'
    then raise exception 'Missing somatotype context was not reported'; end if;
end $$;

insert into auth.users(id,email) values
 ('fd000000-0000-4000-8000-000000000001','interpretation-owner@nuthrick.test'),
 ('fd000000-0000-4000-8000-000000000002','interpretation-other@nuthrick.test');
set local role authenticated;
select set_config('request.jwt.claim.sub','fd000000-0000-4000-8000-000000000001',true);
insert into public.patients(id,full_name,height_cm,birth_date,equation_sex)
values ('fd000000-0000-4000-8000-000000000003','Paciente de pruebas de interpretación',200,'1992-06-10','male');
insert into public.consultations(id,patient_id,status,consultation_type,sequence_number,consultation_date)
values ('fd000000-0000-4000-8000-000000000004','fd000000-0000-4000-8000-000000000003','draft','initial',0,'2026-09-04T12:00:00Z'),
 ('fd000000-0000-4000-8000-000000000005','fd000000-0000-4000-8000-000000000003','draft','follow_up',1,'2026-09-05T12:00:00Z');
select count(*) from public.save_consultation_measurements('fd000000-0000-4000-8000-000000000004','{"weight":111.2}');
select count(*) from public.save_consultation_measurements('fd000000-0000-4000-8000-000000000005','{"weight":98.4}');

-- Reusable test payload built exclusively from this transaction's synthetic measurements.
create function pg_temp.payload(cid uuid,kg numeric) returns jsonb language sql as $$
 select jsonb_build_object('bmi',jsonb_build_object('rawResult',kg/4,'displayedResult',(kg/4)::text,'inputs',jsonb_build_object(
 'weight',jsonb_build_object('label','Peso','source','consultation_measurement','value',kg::text,'unit','kg','measurementCode','weight','measurementId',(select id from public.consultation_measurements where consultation_id=cid and measurement_type_id='weight')),
 'height',jsonb_build_object('label','Altura','source','patient_record','value','200','unit','cm','patientField','height_cm')),'dependencies','{}'::jsonb,'patientContext','{}'::jsonb));
$$;
select count(*) from public.save_calculations_with_context('fd000000-0000-4000-8000-000000000004',pg_temp.payload('fd000000-0000-4000-8000-000000000004',111.2),false);
select count(*) from public.save_calculations_with_context('fd000000-0000-4000-8000-000000000005',pg_temp.payload('fd000000-0000-4000-8000-000000000005',98.4),false);
do $$ begin
 if (select interpretation_snapshot->'rule'->>'id' from public.consultation_calculation_results where consultation_id='fd000000-0000-4000-8000-000000000004') <> 'overweight' then raise exception 'Snapshot classification failed'; end if;
 if (select interpretation_snapshot->'rule'->>'id' from public.consultation_calculation_results where consultation_id='fd000000-0000-4000-8000-000000000005') <> 'normal' then raise exception 'Separate consultation classification failed'; end if;
 begin update public.interpretation_references set active=false where id='who-adult-bmi'; raise exception 'Reference should be protected'; exception when insufficient_privilege then null; end;
end $$;

-- A deliberate context edit in a draft is not a silent catalogue backfill.
-- It must refresh applicability even when the mathematical result is unchanged.
select count(*) from public.save_calculations_with_context('fd000000-0000-4000-8000-000000000004',pg_temp.payload('fd000000-0000-4000-8000-000000000004',111.2),true);
do $$ begin
 if (select interpretation_snapshot->>'state' from public.consultation_calculation_results where consultation_id='fd000000-0000-4000-8000-000000000004') <> 'not_applicable' then raise exception 'Explicit context change did not refresh interpretation'; end if;
end $$;
select count(*) from public.save_calculations_with_context('fd000000-0000-4000-8000-000000000004',pg_temp.payload('fd000000-0000-4000-8000-000000000004',111.2),false);
do $$ begin
 if (select interpretation_snapshot->'rule'->>'id' from public.consultation_calculation_results where consultation_id='fd000000-0000-4000-8000-000000000004') <> 'overweight' then raise exception 'Interpretation did not recover after explicit context change'; end if;
end $$;

reset role;
update public.interpretation_references set definition=jsonb_set(definition,'{rules,2,label}','"Changed reference"') where id='who-adult-bmi';
set local role authenticated;
select count(*) from public.save_calculations_with_context('fd000000-0000-4000-8000-000000000004',pg_temp.payload('fd000000-0000-4000-8000-000000000004',111.2),false);
do $$ begin
 if (select interpretation_snapshot->'rule'->>'label' from public.consultation_calculation_results where consultation_id='fd000000-0000-4000-8000-000000000004') <> 'Sobrepeso / preobesidad' then raise exception 'Historical reference overwritten'; end if;
end $$;

select set_config('request.jwt.claim.sub','fd000000-0000-4000-8000-000000000002',true);
do $$ begin
 if exists(select 1 from public.consultation_calculation_results) then raise exception 'Cross-professional read allowed'; end if;
 begin perform public.save_calculations_with_context('fd000000-0000-4000-8000-000000000004','{}',false); raise exception 'Cross-professional save allowed'; exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claim.sub','fd000000-0000-4000-8000-000000000001',true);
update public.consultations set status='completed',completed_at=now() where id='fd000000-0000-4000-8000-000000000004';
do $$ begin
 begin perform public.save_calculations_with_context('fd000000-0000-4000-8000-000000000004','{}',false); raise exception 'Completed consultation save allowed'; exception when insufficient_privilege then null; end;
end $$;
select count(*) from public.save_calculations_with_context('fd000000-0000-4000-8000-000000000005','{}',false);
do $$ begin
 if exists(select 1 from public.consultation_calculation_results where consultation_id='fd000000-0000-4000-8000-000000000005') then raise exception 'Removed result retained stale interpretation'; end if;
end $$;
select 'PASS: boundaries, context, explicit context edits, Heath-Carter descriptors/categories, deliberate no-reference states, protected references, historical snapshots, separate consultations, RLS, completed history, deletion' as verification;
rollback;
