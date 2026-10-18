import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, Lexend, Source_Sans_3 } from "next/font/google";
import "./globals.css";

/**
 * Typography — Corporate Trust (ui-ux-pro-max)
 * Lexend: readable authority for titles / metrics (CPE institutional)
 * Source Sans 3: clear UI body, forms, labels
 * IBM Plex Mono: currency, references, tabular data
 */
const lexend = Lexend({
  variable: "--font-lexend",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const sourceSans = Source_Sans_3({
  variable: "--font-source-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const ibmPlexMono = IBM_Plex_Mono({
  variable: "--font-ibm-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: {
    default: "BBB · CPE Sinking Fund",
    template: "%s · BBB",
  },
  description:
    "CPE Department Sinking-fund System — contributions, loans, and maker-checker verification.",
  applicationName: "BBB",
  icons: {
    icon: [{ url: "/brand/bbb-logo.png", type: "image/png" }],
    apple: [{ url: "/apple-icon.png", sizes: "180x180", type: "image/png" }],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "BBB",
  },
};

export const viewport: Viewport = {
  themeColor: "#11335d",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${lexend.variable} ${sourceSans.variable} ${ibmPlexMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col overflow-x-clip">
        {children}
      </body>
    </html>
  );
}
