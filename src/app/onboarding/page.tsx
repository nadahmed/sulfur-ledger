"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useOrganization } from "@/context/OrganizationContext";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { OrganizationSchema, OrganizationFormValues } from "@/lib/schemas";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { useEffect, useState } from "react";
import { Loader2, Building2, Plus, ArrowRight } from "lucide-react";

export default function OnboardingPage() {
  const { organizations, isLoading, refreshOrganizations, setActiveOrganizationId } = useOrganization();
  const router = useRouter();
  const searchParams = useSearchParams();
  const inviteOrgId = searchParams.get("inviteOrgId");
  
  const [isJoining, setIsJoining] = useState(!!inviteOrgId);
  const [showCreateForm, setShowCreateForm] = useState(false);

  useEffect(() => {
    if (inviteOrgId) {
      acceptInviteMutation.mutate(inviteOrgId);
    }
  }, [inviteOrgId]);

  // Set default view based on existing orgs
  useEffect(() => {
    if (!isLoading && organizations.length === 0) {
      setShowCreateForm(true);
    }
  }, [isLoading, organizations.length]);

  const acceptInviteMutation = useMutation({
    mutationFn: async (orgId: string) => {
      const res = await fetch("/api/organizations/invitations/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orgId }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to join organization");
      }
      return res.json();
    },
    onSuccess: async (data) => {
      await refreshOrganizations();
      setActiveOrganizationId(data.orgId);
      toast.success("Successfully joined the organization!");
      router.push("/");
    },
    onError: (error: Error) => {
      setIsJoining(false);
      toast.error(error.message);
      // Remove query param on error so user can proceed normally
      router.replace("/onboarding");
    },
  });

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<OrganizationFormValues>({
    resolver: zodResolver(OrganizationSchema),
    defaultValues: {
      name: "",
    },
  });

  const mutation = useMutation({
    mutationFn: async (values: OrganizationFormValues) => {
      const res = await fetch("/api/organizations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to create organization");
      }

      return res.json();
    },
    onSuccess: async (org) => {
      await refreshOrganizations();
      setActiveOrganizationId(org.id);
      toast.success("Organization created successfully");
      router.push("/");
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const onSubmit = (values: OrganizationFormValues) => {
    mutation.mutate(values);
  };

  const handleSelectOrg = (orgId: string) => {
    setActiveOrganizationId(orgId);
    router.push("/");
  };

  if (isLoading || isJoining) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-neutral-50 p-4">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600 mb-4" />
        <h2 className="text-xl font-semibold text-neutral-800">
          {isJoining ? "Joining organization..." : "Loading organizations..."}
        </h2>
        <p className="text-neutral-500 mt-2">Please wait while we set things up for you.</p>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-neutral-50 p-4">
      <Card className="w-full max-w-md shadow-lg border-neutral-200">
        {showCreateForm ? (
          <form onSubmit={handleSubmit(onSubmit)}>
            <CardHeader className="space-y-1">
              <CardTitle className="text-2xl font-bold">Create Organization</CardTitle>
              <CardDescription>
                Create a new container for your accounts and journal entries.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 pt-4">
              <div className="space-y-2">
                <Label htmlFor="org-name">Organization Name</Label>
                <Input
                  id="org-name"
                  placeholder="e.g. My Personal Ledger or ACME Corp"
                  {...register("name")}
                  autoFocus
                  className={errors.name ? "border-red-500 focus:ring-red-500" : "focus:ring-2 focus:ring-blue-500"}
                />
                {errors.name && (
                  <p className="text-sm text-red-500">{errors.name.message}</p>
                )}
              </div>
            </CardContent>
            <CardFooter className="flex flex-col gap-3">
              <Button 
                type="submit" 
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 rounded-lg transition-colors"
                disabled={mutation.isPending}
              >
                {mutation.isPending ? "Creating..." : "Create Organization"}
              </Button>
              {organizations.length > 0 && (
                <Button 
                  type="button" 
                  variant="ghost" 
                  className="w-full text-neutral-500 hover:text-neutral-800"
                  onClick={() => setShowCreateForm(false)}
                >
                  Back to selection
                </Button>
              )}
            </CardFooter>
          </form>
        ) : (
          <>
            <CardHeader className="space-y-1">
              <CardTitle className="text-2xl font-bold">Your Organizations</CardTitle>
              <CardDescription>
                Select an organization to continue or create a new one.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 pt-4">
              <div className="grid gap-3">
                {organizations.map((org) => (
                  <button
                    key={org.id}
                    onClick={() => handleSelectOrg(org.id)}
                    className="flex items-center justify-between p-4 bg-white border border-neutral-200 rounded-xl hover:border-blue-500 hover:bg-blue-50 transition-all text-left group"
                  >
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-neutral-100 rounded-lg group-hover:bg-blue-100 group-hover:text-blue-600 transition-colors">
                        <Building2 size={20} />
                      </div>
                      <span className="font-semibold text-neutral-800">{org.name}</span>
                    </div>
                    <ArrowRight size={18} className="text-neutral-400 group-hover:text-blue-500 transition-colors" />
                  </button>
                ))}
              </div>
            </CardContent>
            <CardFooter>
              <Button 
                onClick={() => setShowCreateForm(true)}
                variant="outline"
                className="w-full flex items-center justify-center gap-2 py-6 border-dashed border-2 hover:border-blue-500 hover:bg-blue-50 hover:text-blue-600 transition-all border-neutral-300 text-neutral-500"
              >
                <Plus size={20} />
                <span>Create New Organization</span>
              </Button>
            </CardFooter>
          </>
        )}
      </Card>
    </div>
  );
}

