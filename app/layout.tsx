import type { Metadata } from "next";
import "./globals.css";
import { NavTabs } from "@/components/NavTabs";
import { AnalyticsProvider } from "@/components/AnalyticsProvider";

export const metadata: Metadata = {
  title: "ESPN Fantasy Tool",
  description: "ESPN Fantasy trade analyzer & team comparison — NBA, WNBA, MLB, NHL, NFL",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="bg-[#0f1117] text-gray-100 min-h-screen antialiased">
        <NavTabs />
        <main className="pt-14 min-h-screen">
          {children}
        </main>
        <AnalyticsProvider />
      </body>
    </html>
  );
}
