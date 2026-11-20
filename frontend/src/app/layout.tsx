import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Chihuahueños S.A. de C.V. — Boletos Interestatales',
  description:
    'Sistema de compra de boletos interestatales con bloqueo concurrente de asientos en tiempo real y verificación de identidad.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body className={`${inter.className} min-h-screen antialiased bg-slate-50 text-slate-900`}>
        {children}
      </body>
    </html>
  );
}
