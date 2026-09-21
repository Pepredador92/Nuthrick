import {fireEvent,render,screen,waitFor} from '@testing-library/react';
import {beforeEach,expect,it,vi} from 'vitest';
import {PortalAccessCode} from './PortalAccessCode';
import {portalAction} from '@/src/services/patientPortal';
vi.mock('@/src/services/patientPortal',()=>({portalAction:vi.fn()}));
beforeEach(()=>vi.clearAllMocks());
it('requires identity confirmation and only displays the newly issued code',async()=>{
  vi.mocked(portalAction).mockResolvedValue({code:'12345678',expiresAt:new Date(Date.now()+600000).toISOString()});
  render(<PortalAccessCode patientId="patient"/>);
  expect(portalAction).not.toHaveBeenCalled();
  expect(screen.getByRole('button',{name:'Generar código de acceso'})).toBeDisabled();
  fireEvent.click(screen.getByRole('checkbox'));
  fireEvent.click(screen.getByRole('button',{name:'Generar código de acceso'}));
  await waitFor(()=>expect(screen.getByLabelText('Código de un solo uso')).toHaveValue('12345678'));
  expect(portalAction).toHaveBeenCalledWith({patientId:'patient'},'issue_code',{identityConfirmed:true});
  expect(screen.getByRole('checkbox')).not.toBeChecked();
  fireEvent.click(screen.getByRole('button',{name:'Ocultar código'}));
  expect(screen.queryByLabelText('Código de un solo uso')).not.toBeInTheDocument();
});
