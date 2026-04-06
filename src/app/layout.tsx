import { Providers } from "@/components/Providers";
import type { Metadata } from "next";
import { Poppins, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { Separator } from "@/components/ui/separator";
import { PwaRegister } from "@/components/pwa-register";
import { RefreshButton } from "@/components/refresh-button";

const poppins = Poppins({
  variable: "--font-poppins",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Sulfur Book",
  description: "A double-entry bookkeeping application",
};

export const viewport = {
  themeColor: "#09090b",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${poppins.variable} ${jetbrainsMono.variable} antialiased`}
      >
        <PwaRegister />
        <Providers>
          <SidebarProvider>
            <AppSidebar />
            <SidebarInset>
              <header className="flex h-16 shrink-0 items-center gap-2 border-b px-4 sticky top-0 z-50 bg-background">
                <SidebarTrigger className="-ml-1" />
                <Separator orientation="vertical" className="mr-2 h-6 my-auto" />
                <Breadcrumbs />
                <div className="ml-auto flex items-center gap-2">
                  <RefreshButton />
                </div>
              </header>
              <div className="flex flex-col flex-1 overflow-y-auto">
                {children}
              </div>
            </SidebarInset>
          </SidebarProvider>
        </Providers>
      </body>
    </html>
  );
}
