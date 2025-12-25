import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import TahiHeader from "@/app/components/Header/TahiHeader";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL?.trim() || "https://income.mn";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "TAHI — Smart Delivery & Pickup",
  description: "Хүргэлт үүсгээд жолоочоор хүргүүлнэ.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="mn">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <TahiHeader />
        <div className="pt-16">{children}</div>
      </body>
    </html>
  );
}
