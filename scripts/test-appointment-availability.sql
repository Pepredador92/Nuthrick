do $$ declare owner_id uuid:='00000000-0000-0000-0000-000000000001';
 day date:=(now() at time zone 'America/Mexico_City')::date+26; result jsonb; slot jsonb; occupied timestamptz;
begin
 if has_function_privilege('anon','public.agenda_appointment_availability(uuid,date,text,uuid)','execute')
 or has_function_privilege('authenticated','public.agenda_appointment_availability(uuid,date,text,uuid)','execute') then raise exception 'Unsafe availability grants'; end if;
 update public.availability_settings set public_booking_enabled=false where professional_id=owner_id;
 result:=public.agenda_appointment_availability(owner_id,day,'online');
 if jsonb_array_length(result->'slots')<1 or jsonb_array_length(result->'weekdays')<>7 then raise exception 'Private availability missing'; end if;
 occupied:=(result->'slots'->0->>'start')::timestamptz;
 insert into public.agenda_entries(professional_id,kind,source,starts_at,ends_at,timezone)
 values(owner_id,'block','professional',occupied,occupied+interval '1 hour','America/Mexico_City');
 result:=public.agenda_appointment_availability(owner_id,day,'online');
 if exists(select 1 from jsonb_array_elements(result->'slots') s where (s->>'start')::timestamptz=occupied) then raise exception 'Occupied slot offered'; end if;
 for slot in select * from jsonb_array_elements(result->'slots') loop
   if not private.agenda_fits(owner_id,(slot->>'start')::timestamptz,(slot->>'end')::timestamptz,'online',null) then raise exception 'Slot not aligned to schedule'; end if;
 end loop;
 perform pg_temp.expect_error(format('select public.agenda_appointment_availability(%L,%L,''online'')',owner_id,day+10000),'invalid_range');
 if result::text like '%contact_name%' or result::text like '%patient_id%' then raise exception 'Patient detail leaked'; end if;
end $$;
select 'PASS authenticated availability, occupied slots, schedule alignment, bounds and grants';
