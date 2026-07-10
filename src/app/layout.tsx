import type { Metadata } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import Link from "next/link";
import { Analytics } from "@vercel/analytics/next";
import { ThemeToggle } from "@/components/ThemeToggle";
import "./globals.css";

const plexSans = IBM_Plex_Sans({
  variable: "--font-plex-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "Kinemagic — Mechanism Simulator",
  description:
    "A physics-accurate planar mechanism simulator. Drag joints, drive the crank, watch coupler curves trace live — then export laser-ready SVG or printable STL.",
};

/**
 * Applies the persisted theme before first paint so neither theme flashes.
 * Pattern from the Next.js "preventing flash before hydration" guide.
 */
const themeInitScript = `(function(){try{var t=localStorage.getItem("kinemagic-theme");if(t==="draft"||t==="blueprint")document.documentElement.setAttribute("data-theme",t)}catch(e){}})()`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      data-theme="blueprint"
      suppressHydrationWarning
      className={`${plexSans.variable} ${plexMono.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="flex min-h-full flex-col bg-ground text-ink">
        <header className="flex items-center justify-between gap-4 border-b border-surface-edge bg-surface px-4 py-2">
          <Link
            href="/"
            className="font-mono text-sm font-semibold uppercase tracking-[0.25em] text-ink"
          >
            Kinemagic
            <span className="ml-3 hidden text-xs font-normal normal-case tracking-normal text-ink-muted sm:inline">
              mechanism simulator
            </span>
          </Link>
          <nav aria-label="Main" className="flex items-center gap-1 font-mono text-xs uppercase">
            <Link href="/" className="px-3 py-1.5 tracking-widest text-ink-muted hover:text-ink">
              Simulator
            </Link>
            <Link
              href="/learn"
              className="px-3 py-1.5 tracking-widest text-ink-muted hover:text-ink"
            >
              Learn
            </Link>
            <Link
              href="/gallery"
              className="px-3 py-1.5 tracking-widest text-ink-muted hover:text-ink"
            >
              Gallery
            </Link>
            <ThemeToggle />
          </nav>
        </header>
        <main className="flex min-h-0 flex-1 flex-col">{children}</main>
        <Analytics />
      </body>
    </html>
  );
}