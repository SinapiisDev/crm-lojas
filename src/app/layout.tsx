import type { Metadata } from "next";
import { Urbanist } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const urbanist = Urbanist({ variable: "--font-sans", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "CRM Lojas",
  description: "Leads, tarefas e reuniões das lojas",
  icons: { icon: "/icones/192", apple: "/icones/180" },
  appleWebApp: { capable: true, title: "CRM", statusBarStyle: "black-translucent" },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pt-BR" className={`${urbanist.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        {children}
        <Toaster richColors position="top-center" />
      </body>
    </html>
  );
}
