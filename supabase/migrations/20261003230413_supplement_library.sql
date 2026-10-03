create table public.supplement_products (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid references public.professional_profiles(id) on delete cascade,
 stable_code text unique,
 name text not null check(length(trim(name)) between 1 and 180),
 brand text not null default '' check(length(brand)<=120),
 presentation text not null default '' check(length(presentation)<=120),
 serving_label text not null check(length(trim(serving_label)) between 1 and 180),
 serving_grams numeric check(serving_grams>0 and serving_grams<=100000),
 scoops_per_serving numeric check(scoops_per_serving>0 and scoops_per_serving<=100000),
 energy_kcal numeric not null check(energy_kcal>=0 and energy_kcal<=100000),
 carbohydrate_g numeric not null check(carbohydrate_g>=0 and carbohydrate_g<=100000),
 protein_g numeric not null check(protein_g>=0 and protein_g<=100000),
 fat_g numeric not null check(fat_g>=0 and fat_g<=100000),
 source_url text check(length(source_url)<=2000), label_url text check(length(label_url)<=2000), verified_at date,
 active boolean not null default true,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 check(owner_id is null or (stable_code is null and source_url is null and label_url is null and verified_at is null))
);
create index supplement_products_owner_idx on public.supplement_products(owner_id);
create trigger supplement_products_updated_at before update on public.supplement_products for each row execute function private.set_updated_at();
alter table public.supplement_products enable row level security;
revoke all on public.supplement_products from anon, authenticated;
grant select,insert,update,delete on public.supplement_products to authenticated;
create policy supplements_read on public.supplement_products for select to authenticated using(owner_id is null or owner_id=(select auth.uid()));
create policy supplements_insert on public.supplement_products for insert to authenticated with check(owner_id=(select auth.uid()));
create policy supplements_update on public.supplement_products for update to authenticated using(owner_id=(select auth.uid())) with check(owner_id=(select auth.uid()));
create policy supplements_delete on public.supplement_products for delete to authenticated using(owner_id=(select auth.uid()));

-- Mexican labels inspected 2026-10-03. Values are per labeled portion, not per 100 g.
-- A measure means the product's own scoop; it is never a household tablespoon conversion.
insert into public.supplement_products(stable_code,name,brand,presentation,serving_label,serving_grams,scoops_per_serving,energy_kcal,carbohydrate_g,protein_g,fat_g,source_url,label_url,verified_at) values
('GNC_MX_106306005','Zero Carb · Vainilla','Isopure','3 lb','1 medida del producto (32 g)',32,1,104.5,0,25,0.5,'https://gnc.com.mx/zero-carb-proteina-isopure-vainilla-3-libras.html','https://gnc.com.mx/media/catalog/product/1/0/106306005_01_02.jpg','2026-10-03'),
('GNC_MX_107206001','Gold Standard 100% Whey · Chocolate','Optimum Nutrition','5 lb','1 medida del producto (31 g)',31,1,121.5,3,24,1.5,'https://gnc.com.mx/gold-standard-100-whey-proteina-de-suero-de-leche-optimum-nutrition-chocolate-5-libras.html','https://gnc.com.mx/media/catalog/product/1/0/107206001_01_02.jpg','2026-10-03'),
('GNC_MX_100101039','Lean Shake 25 · Vainilla','GNC Total Lean','832 g','1 medida copeteada del producto (52 g)',52,1,180,19,25,3,'https://gnc.com.mx/lean-shake-25-suplemento-alimenticio-total-lean-vainilla-832-gramos.html','https://gnc.com.mx/media/catalog/product/1/0/100101039_b_2_.jpg','2026-10-03'),
('GNC_MX_107206013','Serious Mass · Chocolate','Optimum Nutrition','6 lb','2 medidas del producto (340 g)',340,2,1258,251,50,6,'https://gnc.com.mx/serious-mass-proteina-optimum-nutrition-chocolate-6-libras.html','https://gnc.com.mx/media/catalog/product/1/0/107206013_01_02.jpg','2026-10-03'),
('GNC_MX_100106052','100% Whey · Vainilla','GNC Pro Performance','408 g','1 medida del producto (30.77 g)',30.77,1,117,2,25,1,'https://gnc.com.mx/100-whey-proteina-de-suero-de-leche-pro-performance-vainilla-408-gramos.html','https://gnc.com.mx/media/catalog/product/1/0/100106052_02.jpg','2026-10-03');
