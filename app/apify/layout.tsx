import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Apify Job Data Review',
  description: 'Review Indeed and JobStreet fields from their latest successful Apify runs',
};

export default function ApifyLayout({ children }: { children: React.ReactNode }) {
  return children;
}
