import type { Metadata } from "next";
import { DM_Sans } from "next/font/google";
import "./globals.css";
import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";

// Placeholder for Erbaum (commercial license required).
// Replace with Erbaum when font files are available.
const dmSans = DM_Sans({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
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
    <html lang="en" className={dmSans.variable}>
      <body className="min-h-screen flex flex-col">
        <Navbar />
        <main className="flex-1">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
