"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { OrganizationSwitcher } from "@/components/OrganizationSwitcher";
import { useOrganization } from "@/context/OrganizationContext";
import { useUser } from "@auth0/nextjs-auth0/client";

interface HeaderProps {
  title: string;
  showBack?: boolean;
}

export function Header({ title, showBack }: HeaderProps) {
  const { activeOrganizationId, organizations, isLoading } = useOrganization();
  const { user } = useUser();

  const activeOrg = organizations.find(o => o.id === activeOrganizationId);
  const activeOrgName = activeOrg ? activeOrg.name : (isLoading ? "Loading..." : activeOrganizationId);

  return (
    <header className="flex justify-between items-center mb-12">
      <div className="flex items-center gap-4">
        {showBack && (
          <Link href="/">
            <Button variant="outline" size="sm">← Back</Button>
          </Link>
        )}
        <div>
          <h1 className="text-3xl font-bold">{title}</h1>
          {activeOrganizationId && (
            <p className="text-sm text-neutral-500">
              Organization: <span className="font-semibold text-neutral-700">{activeOrgName}</span>
            </p>
          )}
        </div>
      </div>
      <div className="flex gap-4 items-center">
        {user && (
          <>
            <Link href="/settings">
              <Button variant="ghost" size="sm">Settings</Button>
            </Link>
            <OrganizationSwitcher />
          </>
        )}
        <Link href="/auth/logout">
          <Button variant="outline" size="sm">Logout</Button>
        </Link>
      </div>
    </header>
  );
}
