import type { Metadata } from "next";
import { Geist } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const geistSans = Geist({ variable: "--font-sans", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "CRM Lojas",
  description: "Leads, tarefas e reuniões das lojas",
  icons: { icon: "/icones/192", apple: "/icones/180" },
  appleWebApp: { capable: true, title: "CRM", statusBarStyle: "default" },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pt-BR" className={`${geistSans.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        {children}
        <Toaster richColors position="top-center" />
      </body>
    </html>
  );
}
