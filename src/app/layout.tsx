import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";

/**
 * Typography — Royal Ledger
 * Plus Jakarta Sans: UI, headings, brand chrome
 * IBM Plex Mono: currency, references, tabular data
 */
const plusJakarta = Plus_Jakarta_Sans({
  variable: "--font-ui",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

const ibmPlexMono = IBM_Plex_Mono({
  variable: "--font-ibm-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
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
      className={`${plusJakarta.variable} ${ibmPlexMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col overflow-x-clip">
        {children}
      </body>
    </html>
  );
}
