"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { useState } from "react";
import { OrganizationProvider } from "@/context/OrganizationContext";
import { Auth0Provider } from "@auth0/nextjs-auth0/client";
import { Toaster } from "sonner";
import { TooltipProvider } from "@/components/ui/tooltip";

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60 * 1000, // 1 minute
      },
    },
  }));

  return (
    <Auth0Provider>
      <QueryClientProvider client={queryClient}>
        <OrganizationProvider>
          <TooltipProvider>
            {children}
          </TooltipProvider>
        </OrganizationProvider>
        <Toaster position="top-right" richColors />
        <ReactQueryDevtools initialIsOpen={false} />
      </QueryClientProvider>
    </Auth0Provider>
  );
}
