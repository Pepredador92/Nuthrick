import type { Metadata } from 'next';
import { ClientApplication } from '@/src/app/ClientApplication';

interface PublicContent { name?: string; professionalTitle?: string; biography?: string }

async function getProfileContent(slug: string): Promise<PublicContent | null> {
  const baseUrl = process.env.VITE_SUPABASE_URL;
  const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!baseUrl || !key) return null;
  const query = new URLSearchParams({ select: 'content', slug: `eq.${slug}`, limit: '1' });
  const response = await fetch(`${baseUrl}/rest/v1/public_professional_pages?${query}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  if (!response.ok) return null;
  const rows = await response.json() as Array<{ content: PublicContent }>;
  return rows[0]?.content ?? null;
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const profile = await getProfileContent(slug);
  if (!profile) return { title: 'Perfil profesional | Nuthrick', openGraph: { images: [] }, twitter: { images: [] } };
  const title = `${profile.name ?? 'Perfil profesional'} | Nuthrick`;
  const description = profile.biography?.slice(0, 155) || profile.professionalTitle || 'Perfil profesional en Nuthrick';
  return {
    title,
    description,
    openGraph: { title, description, type: 'profile', images: [] },
    twitter: { card: 'summary', title, description, images: [] },
  };
}

export default function PublicProfessionalRoute() {
  return <ClientApplication />;
}
