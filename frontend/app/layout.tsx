import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'),
  title: 'Nuthrick — Tu práctica nutricional, en un solo lugar',
  description: 'Gestiona tu perfil profesional y las bases de tu consulta nutricional con Nuthrick.',
  openGraph: {
    title: 'Nuthrick — Tu práctica nutricional, en un solo lugar',
    description: 'Una plataforma clara y segura para profesionales de la nutrición.',
    images: [{ url: '/og.png', width: 1730, height: 909, alt: 'Nuthrick, tu práctica nutricional en un solo lugar' }],
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Nuthrick — Tu práctica nutricional, en un solo lugar',
    description: 'Una plataforma clara y segura para profesionales de la nutrición.',
    images: ['/og.png'],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
