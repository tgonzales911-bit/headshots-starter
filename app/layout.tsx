import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { Suspense } from "react";
import { Analytics } from "@vercel/analytics/react";
import Footer from "@/components/Footer";
import Navbar from "@/components/Navbar";
import AnnouncementBar from "@/components/homepage/announcement-bar";
import { Toaster } from "@/components/ui/toaster";
import { validateConfig } from "@/lib/config";
import { SITE_NAME, SITE_TAGLINE } from "@/lib/site";
import "./globals.css";

// Validate configuration at app initialization
validateConfig();

/**
 * Fonts are bundled (SIL Open Font License) so the build never depends on a
 * font CDN. Marcellus: inscriptional capitals, the lettering of a brass
 * nameplate. Public Sans: plain civic sans for everything else.
 */
const display = localFont({
  src: "./fonts/marcellus-latin-400.woff2",
  weight: "400",
  style: "normal",
  variable: "--font-display",
  display: "swap",
});

const sans = localFont({
  src: "./fonts/public-sans-latin-wght.woff2",
  weight: "100 900",
  style: "normal",
  variable: "--font-sans",
  display: "swap",
});

const FALLBACK_SITE_URL = "https://badgeshot.vercel.app";

/** DEPLOYMENT_URL may be a bare host or http://; metadata needs an https URL. */
function siteUrl(): URL {
  const raw = process.env.DEPLOYMENT_URL?.trim();
  if (raw) {
    const withScheme = /^https?:\/\//i.test(raw) ? raw.replace(/^http:\/\//i, "https://") : `https://${raw}`;
    try {
      return new URL(withScheme);
    } catch {
      // fall through to the default
    }
  }
  return new URL(FALLBACK_SITE_URL);
}

const description =
  "Class A dress-uniform portraits for the fire service, made with photos of your own badge, shoulder patch and collar brass. Checked by a person before delivery.";

// Pinch-zoom stays enabled: no maximumScale.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Same colour as --navy-950; the browser needs a literal value here.
  themeColor: "#090f1b",
  colorScheme: "dark",
};

export const metadata: Metadata = {
  metadataBase: siteUrl(),
  title: {
    default: `${SITE_NAME}: start your Class A portrait order`,
    template: `%s | ${SITE_NAME}`,
  },
  description,
  applicationName: SITE_NAME,
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    title: `${SITE_NAME}: ${SITE_TAGLINE}`,
    description,
    url: "/",
    images: [
      {
        url: "/brand/og.jpg",
        width: 1200,
        height: 630,
        alt: `${SITE_NAME}. ${SITE_TAGLINE}.`,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: `${SITE_NAME}: ${SITE_TAGLINE}`,
    description,
    images: ["/brand/og.jpg"],
  },
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/favicon-32x32.png", type: "image/png", sizes: "32x32" },
      { url: "/favicon-16x16.png", type: "image/png", sizes: "16x16" },
    ],
    apple: [{ url: "/brand/apple-touch-icon.png", sizes: "180x180" }],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    // The "dark" class is fixed: there is no light theme and no toggle.
    <html lang="en" className={`dark ${display.variable} ${sans.variable}`}>
      <body className="flex min-h-screen flex-col">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[200] focus:rounded-md focus:bg-gold focus:px-4 focus:py-3 focus:font-semibold focus:text-navy-950"
        >
          Skip to content
        </a>
        <AnnouncementBar />
        <Suspense
          fallback={
            <div className="sticky top-0 z-[100] w-full border-b border-navy-600 bg-navy-950">
              <div className="container h-16" />
            </div>
          }
        >
          <Navbar />
        </Suspense>
        <main id="main" className="flex-1">
          {children}
        </main>
        <Footer />
        <Toaster />
        <Analytics />
      </body>
    </html>
  );
}
