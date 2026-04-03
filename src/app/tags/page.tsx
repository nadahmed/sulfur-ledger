"use client";
import React from "react";
import { useOrganization } from "@/context/OrganizationContext";
import { useAuthGuard } from "@/hooks/use-auth-guard";
import { TagsSettings } from "@/components/settings/TagsSettings";
import { Loader2 } from "lucide-react";

export default function TagsPage() {
  const { activeOrganizationId, isOrgLoading, organizations, permissions, isOwner } = useOrganization();
  const { isUserLoading } = useAuthGuard();

  const isLoading = isUserLoading || isOrgLoading;
  const canManage = isOwner || permissions.includes("manage:tags") || permissions.includes("manage:organization");

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <Loader2 className="w-8 h-8 animate-spin text-neutral-400 mr-2" />
        <span className="text-neutral-500 font-medium">Loading tags...</span>
      </div>
    );
  }

  if (!activeOrganizationId) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <p className="text-neutral-500 italic">No organization selected.</p>
      </div>
    );
  }

  return (
    <main className="max-w-screen-2xl p-4 md:p-8 space-y-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl font-bold tracking-tight">Tag Management</h1>
        <p className="text-neutral-500">
           Organize your transactions with labels, project IDs, and custom categories.
        </p>
      </div>
      
      <div className="bg-white rounded-2xl border p-6 shadow-sm">
        <TagsSettings orgId={activeOrganizationId} canManage={canManage} />
      </div>
    </main>
  );
}
