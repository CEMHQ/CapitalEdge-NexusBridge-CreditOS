import type { Metadata } from "next";
import { Barlow } from "next/font/google";
import "./globals.css";
import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";

// Barlow — closest Google Fonts match to Erbaum (geometric, rational, wide weight range).
// Replace with licensed Erbaum when available.
const barlow = Barlow({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800"],
});

export const metadata: Metadata = {
  title: {
    default: "NexusBridge Lending",
    template: "%s | NexusBridge Lending",
  },
  description:
    "Short-term asset-backed bridge loans for real estate investors. Fast capital. Institutional process. Transparent returns for investors.",
  keywords: ["bridge loans", "private credit", "real estate financing", "hard money", "investor lending"],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={barlow.variable}>
      <body className="min-h-screen flex flex-col">
        <Navbar />
        <main className="flex-1">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
