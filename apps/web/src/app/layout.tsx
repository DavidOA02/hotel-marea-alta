import type { Metadata, Viewport } from 'next';
import { Avisos } from '@/components/ui';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL('https://www.mareaalta.pe'),
  title: { default: 'Hotel Marea Alta Paracas | Hotel boutique frente al mar', template: '%s | Hotel Marea Alta Paracas' },
  description: 'Hotel boutique 4 estrellas frente a la bahía de Paracas, a 3 h 30 de Lima. Habitaciones con vista al mar, cocina marina peruana, bar de pisco, spa y piscina. Reserva directa en soles o dólares.',
  openGraph: { type: 'website', locale: 'es_PE', siteName: 'Hotel Marea Alta Paracas', images: ['https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=1200&q=70'] },
  icons: { icon: [{ url: '/favicon.svg', type: 'image/svg+xml' }, { url: '/icon-192.png', sizes: '192x192' }], apple: '/apple-touch-icon.png' }
};
export const viewport: Viewport = { themeColor: '#12303A' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-PE" data-scroll-behavior="smooth">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;1,400&family=Jost:wght@300;400;500;600&display=swap" rel="stylesheet" />
      </head>
      <body>
        <a href="#contenido" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[300] focus:bg-ocean focus:p-3 focus:text-white">Saltar al contenido</a>
        {children}
        <Avisos />
      </body>
    </html>
  );
}
