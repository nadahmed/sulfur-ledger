"use client";

import { useUser } from "@auth0/nextjs-auth0/client";
import { useRouter, usePathname } from "next/navigation";
import { useEffect } from "react";

export function useAuthGuard() {
  const { user, isLoading } = useUser();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    // List of public paths that don't need authentication
    const publicPaths = ["/", "/auth/login", "/auth/callback"];

    const isPublic = publicPaths.some(p => pathname === p || pathname.startsWith(p + "/"));

    if (!isLoading && !user && !isPublic) {
      // Redirect to login if not authenticated and trying to access a private path
      window.location.href = "/auth/login";
    }
  }, [user, isLoading, router, pathname]);

  return { user, isLoading };
}
