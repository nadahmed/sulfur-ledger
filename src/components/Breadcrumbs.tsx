"use client";

import { usePathname } from "next/navigation";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import React from "react";

export function Breadcrumbs() {
  const pathname = usePathname();
  const segments = pathname.split("/").filter(v => v && v !== "app");

  return (
    <Breadcrumb>
      <BreadcrumbList>
        <BreadcrumbItem className="hidden md:block">
          <BreadcrumbLink href="/app/dashboard">Dashboard</BreadcrumbLink>
        </BreadcrumbItem>
        {segments.length > 0 && segments[0] !== "dashboard" && <BreadcrumbSeparator className="hidden md:block" />}
        {segments.map((segment, index) => {
          if (segment === "dashboard") return null;
          
          const fullSegments = pathname.split("/").filter(Boolean);
          const appIndex = fullSegments.indexOf("app");
          const actualSegments = fullSegments.slice(0, fullSegments.indexOf(segment) + 1);
          const href = `/${actualSegments.join("/")}`;
          
          const isLast = index === segments.length - 1;
          const title = segment.charAt(0).toUpperCase() + segment.slice(1);

          return (
            <React.Fragment key={href}>
              <BreadcrumbItem>
                {isLast ? (
                  <BreadcrumbPage>{title}</BreadcrumbPage>
                ) : (
                  <BreadcrumbLink href={href}>{title}</BreadcrumbLink>
                )}
              </BreadcrumbItem>
              {!isLast && <BreadcrumbSeparator />}
            </React.Fragment>
          );
        })}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
