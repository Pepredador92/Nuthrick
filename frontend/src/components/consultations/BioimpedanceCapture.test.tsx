import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BioimpedanceCapture } from './BioimpedanceCapture';

const api = vi.hoisted(() => ({ load: vi.fn(), save: vi.fn() }));
vi.mock('@/src/services/bioimpedance', () => ({ loadConsultationDeviceData: api.load, saveDeviceMeasurements: api.save }));

const measurement = (id:string,name:string,unit:string,subcategory='composicion_general') => ({ id,code:id,name,display_name:name,clinical_name:name,category:id==='weight'?'general':'bioimpedance',subcategory,unit,data_type:'number',min_value:0,max_value:1000,decimal_places:1,description:'',synonyms:[],display_order:1,source_kind:'device_reported',choice_options:[] });
const capabilities = [
  { measurement_type_id:'weight',manufacturer_variable_name:'Weight',manufacturer_unit:'kg',display_order:1,measurement:measurement('weight','Peso','kg') },
  { measurement_type_id:'body_fat_percentage_device',manufacturer_variable_name:'Percent Body Fat',manufacturer_unit:'%',display_order:2,measurement:{...measurement('body_fat_percentage_device','Grasa (%)','%'),data_type:'percentage'} },
];
const devices = [
  { id:'device-a',catalog_device_id:'catalog-a',custom_manufacturer:null,custom_model:null,custom_name:null,alias:'InBody principal',serial_number:'ABC',internal_id:null,is_active:true,is_default:true,catalog_device:{id:'catalog-a',manufacturer:'InBody',model:'270S',commercial_name:'InBody 270S',family:'InBody',technology:'DSM-MFBIA',notes:'',is_segmental:true,validation_status:'verified',source_title:'Official',source_url:'https://example.com'},capabilities },
  { id:'device-b',catalog_device_id:null,custom_manufacturer:'Marca propia',custom_model:'X1',custom_name:null,alias:'Equipo móvil',serial_number:null,internal_id:null,is_active:true,is_default:false,catalog_device:null,capabilities:[capabilities[0]] },
];
const consultation={id:'consultation-1'} as never;

describe('BioimpedanceCapture',()=>{
  beforeEach(()=>{ vi.clearAllMocks(); api.load.mockResolvedValue({devices,sessions:[]}); api.save.mockResolvedValue({}); });
  it('requires explicit equipment and renders only compatible fields',async()=>{
    render(<BioimpedanceCapture consultation={consultation}/>);
    expect(await screen.findByRole('heading',{name:'Bioimpedancia'})).toBeInTheDocument();
    expect(screen.queryByLabelText(/peso/i)).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/equipo utilizado/i),{target:{value:'device-b'}});
    expect(screen.getByLabelText(/peso/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/grasa/i)).not.toBeInTheDocument();
  });
  it('saves only entered numeric values and keeps provenance selection explicit',async()=>{
    render(<BioimpedanceCapture consultation={consultation}/>);
    await screen.findByRole('heading',{name:'Bioimpedancia'});
    fireEvent.change(screen.getByLabelText(/equipo utilizado/i),{target:{value:'device-a'}});
    fireEvent.change(screen.getByLabelText(/peso/i),{target:{value:'81.2'}});
    fireEvent.click(screen.getByRole('button',{name:/guardar datos del equipo/i}));
    await waitFor(()=>expect(api.save).toHaveBeenCalledWith('consultation-1','device-a',{weight:81.2}));
    expect(api.save.mock.calls[0][2]).not.toHaveProperty('body_fat_percentage_device');
  });
  it('shows simultaneous historical sessions without overwriting either device',async()=>{
    api.load.mockResolvedValue({devices,sessions:[
      {id:'s1',professional_device_id:'device-a',capture_source:'manual',device_snapshot:{alias:'InBody principal',manufacturer:'InBody',model:'270S',commercial_name:'InBody 270S',technology:'DSM',is_standard:true},measured_at:'2026-09-05T12:00:00Z',created_at:'2026-09-05T12:00:00Z',values:[{id:'v1',measurement_type_id:'weight',value:81.2,unit:'kg'}]},
      {id:'s2',professional_device_id:'device-b',capture_source:'manual',device_snapshot:{alias:'Equipo móvil',manufacturer:'Marca propia',model:'X1',commercial_name:'X1',technology:'Equipo personalizado',is_standard:false},measured_at:'2026-09-05T12:05:00Z',created_at:'2026-09-05T12:05:00Z',values:[{id:'v2',measurement_type_id:'weight',value:80.9,unit:'kg'}]},
    ]});
    render(<BioimpedanceCapture consultation={consultation}/>);
    expect((await screen.findAllByText(/InBody principal · InBody 270S/)).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/Equipo móvil · Marca propia X1/)).toBeInTheDocument();
  });
});
