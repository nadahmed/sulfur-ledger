"use client";

import { useOrganization } from "@/context/OrganizationContext";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue,
  SelectSeparator
} from "@/components/ui/select";
import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";

export function OrganizationSwitcher() {
  const { organizations, activeOrganizationId, setActiveOrganizationId } = useOrganization();
  const router = useRouter();
  const activeOrg = organizations.find(o => o.id === activeOrganizationId);

  if (organizations.length === 0) return null;

  return (
    <Select 
      value={activeOrganizationId || ""} 
      onValueChange={(value) => {
        if (value === "new") {
          router.push("/app/onboarding");
        } else {
          setActiveOrganizationId(value);
          // Force reload to clear any cached data or state tied to the old org
          window.location.reload();
        }
      }}
    >
      <SelectTrigger className="w-[200px] border-neutral-200 bg-white">
        <SelectValue placeholder="Select Organization">
          {activeOrg?.name}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {organizations.map((org) => (
          <SelectItem key={org.id} value={org.id}>
            {org.name}
          </SelectItem>
        ))}
        <SelectSeparator />
        <SelectItem value="new" className="text-primary font-medium">
          <div className="flex items-center gap-2">
            <Plus className="w-4 h-4" />
            Create New
          </div>
        </SelectItem>
      </SelectContent>
    </Select>
  );
}
