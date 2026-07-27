import type { Metadata } from 'next';
import { ReducedMotionSync } from '@/components/ReducedMotionSync/ReducedMotionSync';
import { ThemeSync } from '@/components/ThemeSync/ThemeSync';
import './globals.css';

export const metadata: Metadata = {
  title: 'ResponderIQ',
  description: 'Adaptive EMS training — a real operational BLS-01 simulator.',
};

/**
 * Blocking, pre-paint application of theme, lighting and reduced-motion from
 * local settings, so the very first paint matches the user's choice and there
 * is no flash of the wrong theme. Mirrors the same storage key and validation
 * as lib/settings/storage.ts (kept intentionally tiny and dependency-free —
 * it must run before any bundle loads). ThemeSync/ReducedMotionSync re-apply
 * after hydration and handle live changes.
 */
const themeBootstrap = `(function(){try{
  var raw = localStorage.getItem('responderiq:local-settings');
  var s = raw ? JSON.parse(raw) : {};
  var pref = (s.theme === 'light' || s.theme === 'dark' || s.theme === 'system') ? s.theme : 'system';
  var theme = pref;
  if (pref === 'system') {
    theme = (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) ? 'light' : 'dark';
  }
  var root = document.documentElement;
  root.dataset.theme = theme;
  root.dataset.lighting = (s.lightingMode === 'reduced') ? 'reduced' : 'standard';
  root.dataset.reducedMotion = (s.reducedMotion === true) ? 'true' : 'false';
}catch(e){}})();`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // The bootstrap script below sets data-theme/data-lighting/data-reduced-motion
    // on <html> before React hydrates, so those attributes intentionally differ
    // from the server-rendered markup. suppressHydrationWarning scopes that
    // expected difference to this element only (the standard theme-before-paint
    // pattern) — it does not suppress warnings for any descendant.
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootstrap }} />
      </head>
      <body>
        <ReducedMotionSync />
        <ThemeSync />
        {children}
      </body>
    </html>
  );
}
