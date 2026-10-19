import type { Metadata, Viewport } from 'next';
import './globals.css';
export const viewport: Viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover' };
export const metadata: Metadata = {
  title: 'Sudoku · From paper to play',
  description: 'Scan a Sudoku photo locally, review the clues, and play with candidate notes.',
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
