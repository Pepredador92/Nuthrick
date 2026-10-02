begin;
-- Only the two public plans change. Patient capacity, prices, paid invoices,
-- purchased balances, courtesy grants and explicit overrides are untouched.
update private.plan_entitlements pe set value=case when c.value_type='boolean' then 'false'::jsonb else '0'::jsonb end
from private.entitlement_catalog c,private.plans p
where p.id=pe.plan_id and c.key=pe.entitlement_key and p.code='esencial' and c.key like 'ai.%';
update private.plan_entitlements pe set value='true'::jsonb
from private.entitlement_catalog c,private.plans p
where p.id=pe.plan_id and c.key=pe.entitlement_key and p.code='profesional' and c.key in ('ai.recall_24h','ai.pes','ai.diet_draft','ai.credit_purchase') and c.value_type='boolean';
update private.plans set description=case code
 when 'esencial' then 'Funciones esenciales para tu consulta: expedientes, mediciones, Taller manual, perfil público y Super Link. Hasta 30 pacientes activos. Sin funciones de IA.'
 else 'Pacientes ilimitados, funciones de IA para R24h, PES y Taller, biblioteca completa y exportaciones avanzadas.' end,
 credits_provisional=false,updated_at=now() where code in ('esencial','profesional');
insert into private.admin_audit(action,entity,reason,metadata) values('commercial_ai_split','plans','Esencial sin IA y Profesional con IA, autorizado por el administrador','{"patient_limits_unchanged":true,"prices_unchanged":true,"balances_preserved":true}');
commit;
