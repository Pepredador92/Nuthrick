import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { PublicProfessionalHeader } from './PublicProfessionalHeader';

afterEach(cleanup);
const profile = { name: 'María del Carmen Profesional', professionalTitle: 'Licenciada en Nutrición', licenseNumber: '0000000', country: 'México', careModalities: ['online' as const], links: [] };
it('groups all public networks and contact methods without a second booking action', () => {
  render(<PublicProfessionalHeader profile={{...profile, avatarUrl:'/test-avatar.jpg', contacts:[{type:'phone',countryCode:'+52',value:'4920000001'},{type:'email',value:'synthetic@example.invalid'}],links:[
    {type:'instagram',title:'Instagram',url:'https://instagram.com/example'},
    {type:'facebook',title:'Facebook',url:'https://facebook.com/example'},
    {type:'tiktok',title:'TikTok',url:'https://tiktok.com/@example'},
    {type:'youtube',title:'Mi canal de YouTube',url:'https://youtube.com/@example'},
    {type:'custom',title:'Mi sitio web',url:'https://example.com'},
  ]}}/>);
  const nav = within(screen.getByRole('navigation',{name:'Contacto y redes sociales'}));
  expect(nav.getAllByRole('link')).toHaveLength(7);
  expect(nav.getByRole('link',{name:'WhatsApp'})).toHaveAttribute('href','https://wa.me/524920000001');
  expect(nav.getByRole('link',{name:'Mi canal de YouTube'})).toHaveAttribute('rel','noopener noreferrer');
  expect(screen.getByRole('img',{name:`Foto de ${profile.name}`})).toBeInTheDocument();
  expect(screen.getByRole('heading',{level:1})).toHaveTextContent(profile.name);
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
});
it('shows only one link per exact destination, including WhatsApp registered twice', () => {
  render(<PublicProfessionalHeader profile={{...profile,contacts:[{type:'phone',countryCode:'+52',value:'4920000001'}],links:[{type:'whatsapp',title:'Escríbeme',url:'https://wa.me/524920000001/'}]}}/>);
  expect(screen.getAllByRole('link')).toHaveLength(1);
});
it('works with networks but no contact, and ignores executable destinations', () => {
  render(<PublicProfessionalHeader profile={{...profile,links:[{type:'instagram',title:'Instagram',url:'https://instagram.com/example'},{type:'custom',title:'Invalid',url:'javascript:alert(1)'}]}}/>);
  expect(screen.getAllByRole('link')).toHaveLength(1);
  expect(screen.getByRole('navigation')).toBeInTheDocument();
});
it('keeps a centered initials fallback without an empty contact strip', () => {
  render(<PublicProfessionalHeader profile={profile}/>);
  expect(screen.getByText('Md')).toBeInTheDocument();
  expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
});
