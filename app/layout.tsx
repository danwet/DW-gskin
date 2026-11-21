import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";

const geist = Geist({
  subsets: ["latin"],
  variable: "--font-geist",
});

export const metadata: Metadata = {
  title: "DW Dashboard",
  description: "What needs your attention after each email triage.",
  applicationName: "DW Dashboard",
  appleWebApp: {
    capable: true,
    title: "DW Dashboard",
    statusBarStyle: "black",
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
      </head>
      <body>{children}</body>
    </html>
  );
}
