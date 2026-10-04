import { productMetadata } from '@/src/lib/productMetadata';
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

export const metadata = productMetadata;

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#eef3ef',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: `try{var t=localStorage.getItem('nuthrick.theme');document.documentElement.dataset.nuthrickTheme=t==='night'?'night':'day';if(t==='night'){var m=document.querySelector('meta[name="theme-color"]');if(m)m.content='#081520'}}catch(e){document.documentElement.dataset.nuthrickTheme='day'}` }} />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
