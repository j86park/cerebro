import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Sidebar } from "@/components/layout/Sidebar";
import { TopBar } from "@/components/layout/TopBar";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Cerebro | Autonomous Vault Intelligence",
  description: "Replicated vault with AI agents",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.className} bg-background text-foreground h-screen flex overflow-hidden`}>
        <Sidebar className="w-64 flex-shrink-0 hidden md:flex" />
        <div className="flex-1 flex flex-col h-full overflow-hidden">
          <TopBar />
          <main className="flex-1 overflow-y-auto p-6 md:p-8">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
