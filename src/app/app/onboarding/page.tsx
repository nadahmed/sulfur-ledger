"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useOrganization } from "@/context/OrganizationContext";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { OrganizationSchema, OrganizationFormValues } from "@/lib/schemas";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { useEffect, useState } from "react";
import { Loader2, Building2, Plus, ArrowRight } from "lucide-react";
import { cn, formatCurrency } from "@/lib/utils";

import { Suspense } from "react";

function OnboardingContent() {
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
      router.push("/app/dashboard");
    },
    onError: (error: Error) => {
      setIsJoining(false);
      toast.error(error.message);
      // Remove query param on error so user can proceed normally
      router.replace("/app/onboarding");
    },
  });

  const {
    register,
    handleSubmit,
    control,
    watch,
    setValue,
    formState: { errors },
  } = useForm<OrganizationFormValues>({
    resolver: zodResolver(OrganizationSchema),
    defaultValues: {
      name: "",
      currencySymbol: "৳",
      currencyPosition: "prefix",
      currencyHasSpace: false,
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
      router.push("/app/dashboard");
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const onSubmit = (values: OrganizationFormValues) => {
    mutation.mutate(values);
  };
  
  const quickSymbols = ["৳", "$", "€", "£", "¥", "₹"];
  const selectedSymbol = watch("currencySymbol");
  const selectedPosition = watch("currencyPosition") || "prefix";
  const selectedHasSpace = watch("currencyHasSpace");

  const handleSelectOrg = (orgId: string) => {
    if (!orgId) return;
    setActiveOrganizationId(orgId);
    router.push("/app/dashboard");
  };

  if (isLoading || isJoining) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-background p-4 text-foreground">
        <Loader2 className="w-8 h-8 animate-spin text-primary mb-4" />
        <h2 className="text-xl font-semibold text-foreground">
          {isJoining ? "Joining organization..." : "Loading organizations..."}
        </h2>
        <p className="text-muted-foreground mt-2">Please wait while we set things up for you.</p>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-background p-4 text-foreground">
      <Card className="w-full max-w-md shadow-2xl border-border bg-card">
        {showCreateForm ? (
          <form onSubmit={handleSubmit(onSubmit)}>
            <CardHeader className="space-y-1">
              <CardTitle className="text-2xl font-bold">Create Organization</CardTitle>
              <CardDescription>
                Create a new container for your accounts and journal entries.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6 pt-4">
              <div className="space-y-2">
                <Label htmlFor="org-name">Organization Name</Label>
                <Input
                  id="org-name"
                  placeholder="e.g. My Personal Ledger or ACME Corp"
                  {...register("name")}
                  autoFocus
                  className={errors.name ? "border-destructive focus:ring-destructive" : "focus:ring-2 focus:ring-primary"}
                />
                {errors.name && (
                  <p className="text-sm text-destructive">{errors.name.message}</p>
                )}
              </div>

              <div className="pt-2 border-t border-border mt-4 space-y-6">
                <div className="flex flex-col lg:flex-row flex-wrap items-stretch lg:items-end gap-x-8 gap-y-6 p-4 bg-muted/30 rounded-2xl border border-border relative overflow-hidden group shadow-sm">
                  <div className="space-y-2 flex-grow lg:flex-grow-0">
                    <Label className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold leading-none">Currency Symbol</Label>
                    <div className="flex items-center gap-2 h-9">
                      <Input
                        id="currency-symbol"
                        placeholder="$"
                        {...register("currencySymbol")}
                        className="h-full w-20 text-base font-bold text-center bg-card shadow-sm"
                      />
                      <div className="flex gap-1 h-7 items-center overflow-x-auto">
                        {quickSymbols.slice(0, 4).map((s) => (
                          <Button
                            key={s}
                            type="button"
                            variant={selectedSymbol === s ? "default" : "outline"}
                            size="sm"
                            onClick={() => setValue("currencySymbol", s, { shouldDirty: true })}
                            className={cn(
                              "w-8 h-8 p-0 text-[10px] transition-all shrink-0",
                              selectedSymbol === s 
                                ? "shadow-sm" 
                                : "bg-card border-border text-muted-foreground hover:border-accent hover:bg-accent/10"
                            )}
                          >
                            {s}
                          </Button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2 w-full lg:w-40">
                    <Label className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold leading-none">Symbol Position</Label>
                    <div className="h-9">
                      <Controller
                        name="currencyPosition"
                        control={control}
                        render={({ field }) => (
                          <Select value={field.value} onValueChange={field.onChange}>
                            <SelectTrigger className="w-full h-full text-[13px] bg-card shadow-sm ring-offset-background">
                              <SelectValue placeholder="Position">
                                {field.value === "prefix" ? "Before Amount" : field.value === "suffix" ? "After Amount" : undefined}
                              </SelectValue>
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="prefix">Before Amount</SelectItem>
                              <SelectItem value="suffix">After Amount</SelectItem>
                            </SelectContent>
                          </Select>
                        )}
                      />
                    </div>
                  </div>

                  <div className="space-y-2 shrink-0">
                    <Label className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold leading-none">Use Spacing</Label>
                    <div className="flex items-center justify-center bg-card px-4 h-9 rounded-md border border-border shadow-sm w-fit">
                      <Controller
                        name="currencyHasSpace"
                        control={control}
                        render={({ field }) => (
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                            className="scale-75"
                          />
                        )}
                      />
                    </div>
                  </div>

                  <div className="flex-1 space-y-2 lg:border-l border-border lg:pl-8 lg:ml-2 min-w-[200px]">
                     <Label className="text-[10px] uppercase tracking-widest text-primary font-black opacity-60 leading-none">Live Preview</Label>
                     <div className="flex gap-6 items-center h-9 justify-around lg:justify-start">
                        <div className="flex items-center gap-2">
                          <span className="text-[8px] uppercase text-muted-foreground font-bold hidden sm:inline">Entry</span>
                          <span className="text-sm font-bold text-foreground tabular-nums leading-none">
                            {formatCurrency(1234.56, selectedSymbol, selectedPosition, selectedHasSpace)}
                          </span>
                        </div>
                        <div className="w-px h-4 bg-border hidden lg:block" />
                        <div className="flex items-center gap-2">
                          <span className="text-[8px] uppercase text-muted-foreground font-bold hidden sm:inline">Expense</span>
                          <span className="text-sm font-bold text-red-500 tabular-nums leading-none">
                            {formatCurrency(-1234.56, selectedSymbol, selectedPosition, selectedHasSpace)}
                          </span>
                        </div>
                     </div>
                  </div>
                </div>
              </div>
            </CardContent>
            <CardFooter className="flex flex-col gap-3">
              <Button 
                type="submit" 
                className="w-full bg-primary hover:bg-primary/90 text-white font-medium py-2 rounded-lg transition-colors"
                disabled={mutation.isPending}
              >
                {mutation.isPending ? "Creating..." : "Create Organization"}
              </Button>
              {organizations.length > 0 && (
                <Button 
                  type="button" 
                  variant="ghost" 
                  className="w-full text-muted-foreground hover:text-foreground"
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
                    className="flex items-center justify-between p-4 bg-card border border-border rounded-xl hover:border-primary hover:bg-accent transition-all text-left group"
                  >
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-muted rounded-lg group-hover:bg-primary/20 group-hover:text-primary transition-colors">
                        <Building2 size={20} className="text-muted-foreground group-hover:text-primary" />
                      </div>
                      <span className="font-semibold text-foreground">{org.name}</span>
                    </div>
                    <ArrowRight size={18} className="text-muted-foreground group-hover:text-primary transition-colors" />
                  </button>
                ))}
              </div>
            </CardContent>
            <CardFooter>
              <Button 
                onClick={() => setShowCreateForm(true)}
                variant="outline"
                className="w-full flex items-center justify-center gap-2 py-6 border-dashed border-2 hover:border-primary hover:bg-accent hover:text-primary transition-all border-border text-muted-foreground"
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

export default function OnboardingPage() {
  return (
    <Suspense fallback={
      <div className="flex flex-col items-center justify-center min-h-screen bg-background p-4">
        <Loader2 className="w-8 h-8 animate-spin text-primary mb-4" />
        <h2 className="text-xl font-semibold text-foreground">Loading...</h2>
      </div>
    }>
      <OnboardingContent />
    </Suspense>
  );
}

