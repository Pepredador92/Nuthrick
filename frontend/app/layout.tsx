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
        <script dangerouslySetInnerHTML={{ __html: `(function(){var t=location.pathname==='/'?'night':'day';try{var saved=localStorage.getItem('nuthrick.theme');if(saved==='day'||saved==='night')t=saved}catch(e){}document.documentElement.dataset.nuthrickTheme=t;var m=document.querySelector('meta[name="theme-color"]');if(m)m.content=t==='night'?'#081520':'#eef3ef'})()` }} />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
