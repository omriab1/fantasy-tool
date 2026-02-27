import type { Metadata } from "next";
import "./globals.css";
import { NavTabs } from "@/components/NavTabs";
import { Analytics } from "@vercel/analytics/next";

export const metadata: Metadata = {
  title: "Fantasy Tool",
  description: "ESPN Fantasy Basketball trade analyzer & team comparison",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="bg-[#0f1117] text-gray-100 min-h-screen antialiased">
        <NavTabs />
        <main className="pt-14 min-h-screen">
          {children}
        </main>
        <Analytics />
      </body>
    </html>
  );
}
