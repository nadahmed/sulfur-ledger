"use client";
import React from "react";
import { useOrganization } from "@/context/OrganizationContext";
import { TagsSettings } from "@/components/settings/TagsSettings";
import { Loader2 } from "lucide-react";

export default function TagsPage() {
  const { activeOrganizationId, isLoading: isOrgLoading, organizations, permissions, isOwner } = useOrganization();

  const isLoading = isOrgLoading;
  const canManage = isOwner || permissions.includes("manage:tags") || permissions.includes("manage:organization");

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground mr-2" />
        <span className="text-muted-foreground font-medium">Loading tags...</span>
      </div>
    );
  }

  if (!activeOrganizationId) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <p className="text-muted-foreground italic">No organization selected.</p>
      </div>
    );
  }

  return (
    <main className="max-w-screen-2xl p-4 md:p-8 space-y-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl font-bold tracking-tight">Tag Management</h1>
        <p className="text-muted-foreground">
           Organize your transactions with labels, project IDs, and custom categories.
        </p>
      </div>
      
      <div className="bg-card rounded-2xl border border-border p-6 shadow-sm">
        <TagsSettings orgId={activeOrganizationId} canManage={canManage} />
      </div>
    </main>
  );
}
