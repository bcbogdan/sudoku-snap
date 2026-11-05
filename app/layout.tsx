import type { Metadata, Viewport } from 'next';
import { THEME_BOOTSTRAP_SCRIPT, THEME_COLORS } from '../lib/theme';
import { ThemeControl } from './components/ThemeControl';
import './globals.css';
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: THEME_COLORS.light,
};
export const metadata: Metadata = {
  title: 'Sudoku Snap · From paper to play',
  description: 'Scan a Sudoku photo locally, review the clues, and play with candidate notes.',
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP_SCRIPT }} />
        <link
          rel="preload"
          href="/fonts/bricolage-grotesque-latin-wght.woff2"
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />
        <link
          rel="preload"
          href="/fonts/jetbrains-mono-latin-wght.woff2"
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />
      </head>
      <body>
        {children}
        <div className="theme-settings">
          <ThemeControl />
        </div>
      </body>
    </html>
  );
}
