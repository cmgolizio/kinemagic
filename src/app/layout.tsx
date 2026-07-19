import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";

const plexSans = IBM_Plex_Sans({
  variable: "--font-plex-sans",
  weight: ["400", "500", "600"],
  subsets: ["latin"],
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  weight: ["400", "500", "600"],
  subsets: ["latin"],
});

// Absolute base for OG/twitter image URLs. Vercel injects its deployment
// hosts; NEXT_PUBLIC_SITE_URL wins once a custom domain exists.
const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ??
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : "http://localhost:3000");

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "Kinemagic — planar mechanism simulator",
  description:
    "Design four-bar linkages and other planar mechanisms in the browser. Drag joints, watch coupler curves trace live, then export to fabricate.",
};

export const viewport: Viewport = {
  themeColor: "#0d2440",
};

// Runs before first paint so the persisted theme never flashes.
const themeInit = `try{var t=localStorage.getItem("kinemagic-theme");if(t==="draft"||t==="blueprint")document.documentElement.setAttribute("data-theme",t)}catch(e){}`;

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
      <body className="min-h-full flex flex-col">
        <script dangerouslySetInnerHTML={{ __html: themeInit }} />
        {children}
        <Analytics />
      </body>
    </html>
  );
}