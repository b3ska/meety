import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import Sidebar from "@/components/Sidebar";

const inter = Inter({ subsets: ["latin"], display: "swap" });

export const metadata: Metadata = {
  title: "Meety · Meeting Intelligence",
  description: "AI-powered meeting analysis and team insights",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`h-full ${inter.className}`}>
      <head>
        {/* Material Symbols Outlined — icon font, not supported by next/font */}
        <link
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="flex h-full antialiased">
        <Sidebar />
        <main className="flex-1 overflow-y-auto min-h-0">{children}</main>
      </body>
    </html>
  );
}
