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
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'https://nuthrick.vercel.app'),
  title: 'Nuthrick — Hasta el mejor nutriólogo tiene sus trucos',
  description: 'Nuthrick conecta evaluación, cálculos, decisiones, indicaciones y seguimiento para que los profesionales de nutrición terminen más trabajo durante la consulta y tengan menos pendientes después.',
  alternates: { canonical: '/' },
  openGraph: {
    title: 'Nuthrick — Hasta el mejor nutriólogo tiene sus trucos',
    description: 'Termina más trabajo durante la consulta y ten menos pendientes después.',
    images: [{ url: '/og.png', width: 1730, height: 909, alt: 'Nuthrick, herramientas para ejercer mejor la nutrición' }],
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Nuthrick — Hasta el mejor nutriólogo tiene sus trucos',
    description: 'Termina más trabajo durante la consulta y ten menos pendientes después.',
    images: ['/og.png'],
  },
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#f7f8f4',
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
