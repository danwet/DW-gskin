import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import "./globals.css";
import { GLAS_BOOT } from "@/lib/glas-boot";
import { GlasFilters } from "@/components/kit/glas-filters";
import { ThemeKleur } from "@/components/ThemeKleur";

const geist = Geist({
  subsets: ["latin"],
  variable: "--font-geist",
});

/**
 * `viewportFit: "cover"` laat de app tot in de veilige marges doorlopen; zonder
 * dat is `env(safe-area-inset-bottom)` op iOS altijd 0.
 */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  // Zonder theme-color schildert iOS de strook boven de pagina (en de
  // statusbalk) wit. Eén vaste waarde: de app heeft zijn eigen themakeuze, dus
  // een media-query op het systeemthema zou de verkeerde kleur geven.
  // `ThemeKleur` zet hem bij naar de kleur die op dat moment geldt.
  themeColor: "#f2f2f2",
};

export const metadata: Metadata = {
  title: "DW Gskin",
  description: "What needs your attention after each email triage.",
  applicationName: "DW Gskin",
  appleWebApp: {
    capable: true,
    title: "DW Gskin",
    // Transparant zodat de pagina zelf de kleur van de statusbalk bepaalt;
    // "black" zou de strook juist hard zwart maken in standalone-modus.
    statusBarStyle: "black-translucent",
  },
  icons: {
    icon: [{ url: "/favicon.png", sizes: "512x512", type: "image/png" }],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

const themeBoot = `
try {
  var saved = JSON.parse(localStorage.getItem("brief-settings") || "{}");
  var theme = saved.theme || "system";
  var dark = theme === "dark" || (theme !== "light" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
} catch (e) {}
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={geist.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBoot }} />
        <script dangerouslySetInnerHTML={{ __html: GLAS_BOOT }} />
      </head>
      <body>
        <ThemeKleur />
        <GlasFilters />
        {children}
      </body>
    </html>
  );
}
