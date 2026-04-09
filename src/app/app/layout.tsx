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
        <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border/40 px-4 sticky top-0 z-50 bg-background/80 backdrop-blur-md transition-all">
          <SidebarTrigger className="-ml-1 h-8 w-8" />
          <Separator orientation="vertical" className="mr-2 h-4 my-auto opacity-40" />
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
