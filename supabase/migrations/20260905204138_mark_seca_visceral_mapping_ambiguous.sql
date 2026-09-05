update public.measurement_device_capabilities c
set mapping_status='ambiguous',
    notes='The official source confirms visceral fat but does not identify a compatible unit (score, mass, percentage, or area).',
    manufacturer_unit=null
from public.measurement_devices d
where d.id=c.device_id
  and lower(d.manufacturer)='seca'
  and d.model in ('mBCA 555','mBCA Go 525c')
  and c.measurement_type_id='visceral_fat_device';
