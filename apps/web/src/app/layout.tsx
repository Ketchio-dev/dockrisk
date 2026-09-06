import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

// Inter, self-hosted by next/font: the references (Motive, Stripe, Retool) all set their UI in Inter or a
// near-identical grotesk; the "AI look" came from the dark palette and the cards, not the typeface.
const inter = Inter({ variable: "--font-inter", subsets: ["latin"], display: "swap" });

export const metadata: Metadata = {
  title: "DockRisk · RoadStar dispatch",
  description: "Detention and HOS exception desk for Southern Ontario city dispatch",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${inter.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
