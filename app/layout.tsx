import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Job Feed Statistics Dashboard',
  description: 'Monitor post counts, completeness, and recency across RSSHub job sources',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased">
        {children}
      </body>
    </html>
  );
}
