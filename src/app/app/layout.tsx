"use client";

import { Breadcrumbs } from "@/components/Breadcrumbs";
import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { Separator } from "@/components/ui/separator";
import { RefreshButton } from "@/components/refresh-button";

import { useAuthGuard } from "@/hooks/use-auth-guard";

export default function AppLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  useAuthGuard();
  
  return (
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
  );
}
