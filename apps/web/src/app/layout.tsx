import type { Metadata } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans, IBM_Plex_Sans_Condensed } from "next/font/google";
import "./globals.css";

// One family, three widths. Plex is an engineering face (it was drawn for IBM's hardware and documentation),
// which is the register of a dispatch desk: TMS screens, ELD log grids, rate confirmations. The condensed cut
// carries the instrument numbers, the mono cut carries identifiers (bill numbers, units, timestamps).
const sans = IBM_Plex_Sans({ variable: "--font-sans-src", subsets: ["latin"], weight: ["400", "500", "600"], display: "swap" });
const cond = IBM_Plex_Sans_Condensed({ variable: "--font-cond-src", subsets: ["latin"], weight: ["500", "600"], display: "swap" });
const mono = IBM_Plex_Mono({ variable: "--font-mono-src", subsets: ["latin"], weight: ["400", "500"], display: "swap" });

export const metadata: Metadata = {
  title: "DockRisk",
  description: "Detention and hours-of-service exception desk for Southern Ontario city dispatch",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${sans.variable} ${cond.variable} ${mono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
