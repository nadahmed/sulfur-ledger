"use client";

import React, { createContext, useContext, useState, useEffect, ReactNode, useMemo } from "react";
import { useUser } from "@auth0/nextjs-auth0/client";
import { ROLE_PERMISSIONS } from "@/lib/constants/permissions";

interface Organization {
  id: string; // This is the orgId
  name: string;
  role?: string;
  isOwner?: boolean;
  currencySymbol?: string;
  currencyPosition?: "prefix" | "suffix";
  currencyHasSpace?: boolean;
  thousandSeparator?: string;
  decimalSeparator?: string;
  grouping?: "standard" | "indian" | "none";
  decimalPlaces?: number;
  createdAt?: string;
}

interface OrganizationContextType {
  activeOrganizationId: string | null;
  setActiveOrganizationId: (id: string | null) => void;
  organizations: Organization[];
  permissions: string[];
  isOwner: boolean;
  isLoading: boolean;
  refreshOrganizations: () => Promise<void>;
}

const OrganizationContext = createContext<OrganizationContextType | undefined>(undefined);

export function OrganizationProvider({ children }: { children: ReactNode }) {
  const { user, isLoading: isUserLoading } = useUser();
  const [activeOrganizationId, setActiveOrganizationId] = useState<string | null>(null);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [isOwner, setIsOwner] = useState(false);

  const fetchOrganizations = async () => {
    try {
      const res = await fetch("/api/organizations");
      if (res.ok) {
        const data = await res.json();
        
        setOrganizations(data.map((o: any) => ({ 
          id: o.orgId, 
          name: o.orgName || o.name || `Org ${o.orgId.slice(0,4)}`,
          role: o.role,
          isOwner: o.isOwner,
          currencySymbol: o.currencySymbol || "৳",
          currencyPosition: o.currencyPosition || "prefix",
          currencyHasSpace: o.currencyHasSpace || false,
          thousandSeparator: o.thousandSeparator || ",",
          decimalSeparator: o.decimalSeparator || ".",
          grouping: o.grouping || "standard",
          decimalPlaces: o.decimalPlaces ?? 2,
          createdAt: o.createdAt
        })));

        // Derive owner status from local user info if needed
        const activeOrgId = localStorage.getItem("activeOrganizationId") || activeOrganizationId;

        // isOwner will be derived from the active organization in the render cycle

        return data;
      }
    } catch (err) {
      console.error("Failed to fetch organizations:", err);
    }
    return [];
  };

  useEffect(() => {
    const initOrgs = async () => {
      if (!isUserLoading && user) {
        const orgs = await fetchOrganizations();
        
        const storedOrg = localStorage.getItem("activeOrganizationId");
        if (storedOrg && orgs.some((o: any) => o.orgId === storedOrg)) {
          setActiveOrganizationId(storedOrg);
        } else if (orgs.length > 0) {
          const firstOrg = orgs[0].orgId;
          setActiveOrganizationId(firstOrg);
          localStorage.setItem("activeOrganizationId", firstOrg);
          document.cookie = `activeOrgId=${firstOrg}; path=/; max-age=31536000; SameSite=Lax`;
        } else {
          setActiveOrganizationId(null);
        }
        setIsLoading(false);
      } else if (!isUserLoading && !user) {
        setOrganizations([]);
        setActiveOrganizationId(null);
        setIsLoading(false);
      }
    };

    initOrgs();
  }, [user, isUserLoading]);

  const handleSetOrgId = (id: string | null) => {
    setActiveOrganizationId(id);
    if (id) {
      localStorage.setItem("activeOrganizationId", id);
      document.cookie = `activeOrgId=${id}; path=/; max-age=31536000; SameSite=Lax`;
      
      // Update isOwner status for the new org
      const activeLink = organizations.find((o: any) => o.id === id);
      // Wait, organizations in context are {id, name}. 
      // We need the original OrgUser data.
      // Let's store that too or refetch.
      fetchOrganizations(); 
    } else {
      localStorage.removeItem("activeOrganizationId");
      document.cookie = `activeOrgId=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT`;
      setIsOwner(false);
    }
  };

  const refreshOrganizations = async () => {
    await fetchOrganizations();
  };

  const activeOrg = useMemo(() => 
    organizations.find(o => o.id === activeOrganizationId),
    [organizations, activeOrganizationId]
  );

  const permissions = useMemo(() => {
    if (activeOrg?.isOwner) {
      return ROLE_PERMISSIONS["admin"].concat(["manage:organization"]);
    }
    if (activeOrg?.role && ROLE_PERMISSIONS[activeOrg.role]) {
      return ROLE_PERMISSIONS[activeOrg.role];
    }
    return [];
  }, [activeOrg]);

  const isOwnerStatus = !!activeOrg?.isOwner;

  return (
    <OrganizationContext.Provider
      value={{ 
        activeOrganizationId, 
        setActiveOrganizationId: handleSetOrgId, 
        organizations,
        permissions,
        isOwner: isOwnerStatus,
        isLoading: isLoading || isUserLoading,
        refreshOrganizations
      }}
    >
      {children}
    </OrganizationContext.Provider>
  );
}

export function useOrganization() {
  const context = useContext(OrganizationContext);
  if (context === undefined) {
    throw new Error("useOrganization must be used within an OrganizationProvider");
  }
  return context;
}
