"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { z } from "zod";
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
import { Loader2, Building2, Plus, ArrowRight, AlertTriangle, ShieldCheck, Database, Cloud, Info, Settings2 } from "lucide-react";
import { cn, formatCurrency } from "@/lib/utils";
import { CURRENCY_PRESETS, COMMON_SYMBOLS } from "@/lib/constants/currencies";

const OnboardingSchema = OrganizationSchema.pick({
  name: true,
  currencySymbol: true,
  currencyPosition: true,
  currencyHasSpace: true,
  thousandSeparator: true,
  decimalSeparator: true,
  grouping: true,
  decimalPlaces: true,
  storageSettings: true,
});
type OnboardingFormValues = z.infer<typeof OnboardingSchema>;

import { Suspense } from "react";

function OnboardingContent() {
  const { organizations, isLoading, refreshOrganizations, setActiveOrganizationId } = useOrganization();
  const router = useRouter();
  const searchParams = useSearchParams();
  const inviteOrgId = searchParams.get("inviteOrgId");
  
  const [isJoining, setIsJoining] = useState(!!inviteOrgId);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [showAdvancedFormatting, setShowAdvancedFormatting] = useState(false);

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
  } = useForm<OnboardingFormValues>({
    resolver: zodResolver(OnboardingSchema),
    defaultValues: {
      name: "",
      currencySymbol: "৳",
      currencyPosition: "prefix",
      currencyHasSpace: false,
      thousandSeparator: ",",
      decimalSeparator: ".",
      grouping: "standard",
      decimalPlaces: 2,
      storageSettings: { provider: "system" },
    },
  });

  const mutation = useMutation({
    mutationFn: async (values: OnboardingFormValues) => {
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

  const onSubmit = (values: OnboardingFormValues) => {
    mutation.mutate(values);
  };
  
  const applyPreset = (symbol: string) => {
    setValue("currencySymbol", symbol, { shouldDirty: true });
    const preset = CURRENCY_PRESETS[symbol];
    if (preset) {
      setValue("currencyPosition", preset.position, { shouldDirty: true });
      setValue("currencyHasSpace", preset.hasSpace, { shouldDirty: true });
      setValue("thousandSeparator", preset.thousandSeparator, { shouldDirty: true });
      setValue("decimalSeparator", preset.decimalSeparator, { shouldDirty: true });
      setValue("grouping", preset.grouping, { shouldDirty: true });
      setValue("decimalPlaces", preset.decimalPlaces, { shouldDirty: true });
    }
  };

  const selectedSymbol = watch("currencySymbol");
  const selectedPosition = watch("currencyPosition") || "prefix";
  const selectedHasSpace = watch("currencyHasSpace");
  const selectedThousandSep = watch("thousandSeparator") || ",";
  const selectedDecimalSep = watch("decimalSeparator") || ".";
  const selectedGrouping = watch("grouping") || "standard";
  const selectedDecimalPlaces = watch("decimalPlaces") ?? 2;

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

                <div className="pt-2 border-t border-border mt-4 space-y-4">
                  <div className="p-4 bg-muted/30 rounded-2xl border border-border space-y-4 shadow-sm">
                    {/* Primary Row: Symbol & Presets */}
                    <div className="flex flex-col gap-4">
                      <div className="space-y-1.5 flex-1">
                        <Label className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Currency Symbol</Label>
                        <div className="flex items-center gap-2">
                          <Input
                            placeholder="$"
                            {...register("currencySymbol")}
                            className="h-9 w-20 text-sm font-bold text-center bg-card shadow-sm border-border/60"
                          />
                          <div className="flex gap-1 overflow-x-auto pb-1 no-scrollbar">
                            {COMMON_SYMBOLS.slice(0, 6).map((s) => (
                              <Button
                                key={s}
                                type="button"
                                variant={selectedSymbol === s ? "default" : "outline"}
                                size="sm"
                                onClick={() => applyPreset(s)}
                                className={cn(
                                  "w-8 h-8 p-0 text-xs transition-all shrink-0",
                                  selectedSymbol === s 
                                    ? "shadow-sm bg-primary text-primary-foreground border-primary" 
                                    : "bg-card border-border/60 text-muted-foreground hover:bg-accent/10"
                                )}
                              >
                                {s}
                              </Button>
                            ))}
                          </div>
                        </div>
                      </div>

                      {/* Integrated Preview */}
                      <div className="bg-card/50 rounded-xl p-3 border border-border/40 flex items-center justify-between">
                        <div className="space-y-0.5">
                          <span className="text-[9px] uppercase font-bold text-muted-foreground block leading-none">Live Preview</span>
                          <span className={cn(
                            "text-base font-black tabular-nums tracking-tight leading-none",
                            selectedSymbol ? "text-primary" : "text-muted-foreground/50 italic"
                          )}>
                            {formatCurrency(
                              1234.56, 
                              selectedSymbol, 
                              selectedPosition, 
                              selectedHasSpace, 
                              selectedThousandSep, 
                              selectedDecimalSep, 
                              selectedGrouping, 
                              selectedDecimalPlaces
                            )}
                          </span>
                        </div>
                        
                        <div className="flex flex-col items-end gap-1.5">
                          <span className="text-[9px] uppercase font-bold text-muted-foreground leading-none">Customize</span>
                          <Switch
                            checked={showAdvancedFormatting}
                            onCheckedChange={setShowAdvancedFormatting}
                            className="scale-75 data-[state=checked]:bg-primary"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Advanced Section */}
                    {showAdvancedFormatting && (
                      <div className="pt-4 border-t border-border/30 space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-1.5">
                            <Label className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Position</Label>
                            <Controller
                              name="currencyPosition"
                              control={control}
                              render={({ field }) => (
                                <Select value={field.value} onValueChange={field.onChange}>
                                  <SelectTrigger className="h-8 text-[11px] bg-card border-border/60 shadow-none">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="prefix" className="text-xs">Before Amount</SelectItem>
                                    <SelectItem value="suffix" className="text-xs">After Amount</SelectItem>
                                  </SelectContent>
                                </Select>
                              )}
                            />
                          </div>

                          <div className="space-y-1.5">
                            <Label className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Use Spacing</Label>
                            <div className="flex h-8 items-center rounded-md border border-border/60 bg-card px-3">
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
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                           <div className="space-y-1.5">
                            <Label className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Thousand Sep</Label>
                            <Controller
                              name="thousandSeparator"
                              control={control}
                              render={({ field }) => (
                                <Select value={field.value} onValueChange={field.onChange}>
                                  <SelectTrigger className="h-8 text-[11px] bg-card border-border/60 shadow-none">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="," className="text-xs">Comma (,)</SelectItem>
                                    <SelectItem value="." className="text-xs">Dot (.)</SelectItem>
                                    <SelectItem value=" " className="text-xs">Space ( )</SelectItem>
                                    <SelectItem value="'" className="text-xs">Apostrophe (')</SelectItem>
                                    <SelectItem value="none" className="text-xs">None</SelectItem>
                                  </SelectContent>
                                </Select>
                              )}
                            />
                          </div>

                          <div className="space-y-1.5">
                            <Label className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Decimal Sep</Label>
                            <Controller
                              name="decimalSeparator"
                              control={control}
                              render={({ field }) => (
                                <Select value={field.value} onValueChange={field.onChange}>
                                  <SelectTrigger className="h-8 text-[11px] bg-card border-border/60 shadow-none">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="." className="text-xs">Dot (.)</SelectItem>
                                    <SelectItem value="," className="text-xs">Comma (,)</SelectItem>
                                  </SelectContent>
                                </Select>
                              )}
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                           <div className="space-y-1.5">
                            <Label className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Grouping</Label>
                            <Controller
                              name="grouping"
                              control={control}
                              render={({ field }) => (
                                <Select value={field.value} onValueChange={field.onChange}>
                                  <SelectTrigger className="h-8 text-[11px] bg-card border-border/60 shadow-none">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="standard" className="text-xs">Standard (3,3)</SelectItem>
                                    <SelectItem value="indian" className="text-xs">Indian (3,2,2)</SelectItem>
                                    <SelectItem value="none" className="text-xs">None</SelectItem>
                                  </SelectContent>
                                </Select>
                              )}
                            />
                          </div>

                          <div className="space-y-1.5">
                            <Label className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Decimals</Label>
                            <Input
                              type="number"
                              min={0}
                              max={4}
                              {...register("decimalPlaces", { valueAsNumber: true })}
                              className="h-8 text-xs bg-card border-border/60"
                            />
                          </div>
                        </div>

                        <div className="flex items-start gap-2 p-2.5 bg-muted/50 rounded-xl border border-border/40 text-[9px] text-muted-foreground leading-relaxed">
                          <Info className="h-3 w-3 mt-0.5 shrink-0" />
                          <p>These settings define how amounts look across all reports and journals. You can change them later in Settings.</p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
 
              <div className="pt-2 border-t border-border mt-4">
                <div className="p-4 bg-muted/30 rounded-2xl border border-border shadow-sm space-y-4">
                  <div className="flex justify-between items-center">
                    <div className="space-y-1">
                      <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Storage Configuration</Label>
                      <p className="text-[10px] text-muted-foreground">Setup how your receipts are stored.</p>
                    </div>
                    <Database className="w-4 h-4 text-muted-foreground" />
                  </div>
 
                  <div className="space-y-1.5">
                    <Controller
                      name="storageSettings.provider"
                      control={control}
                      render={({ field }) => (
                        <Select value={field.value} onValueChange={field.onChange}>
                          <SelectTrigger className="w-full text-xs h-9 bg-card">
                            <SelectValue placeholder="Select Provider">
                              {field.value === "system" ? "System Default" : 
                               field.value === "s3" ? "Custom S3 Storage" : 
                               field.value === "cloudinary" ? "Custom Cloudinary" : "Select Provider"}
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="system">System Default</SelectItem>
                            <SelectItem value="s3">Custom S3 Storage</SelectItem>
                            <SelectItem value="cloudinary">Custom Cloudinary</SelectItem>
                          </SelectContent>
                        </Select>
                      )}
                    />
                  </div>
 
                  {watch("storageSettings.provider") !== "system" && (
                    <div className="space-y-4 animate-in fade-in slide-in-from-top-1">
                      <div className="space-y-1.5">
                        <Label className="text-[10px] uppercase font-bold text-muted-foreground">Path / Prefix</Label>
                        <Input
                          placeholder="e.g. receipts/2024"
                          {...register("storageSettings.customFolder")}
                          className="h-8 text-xs font-medium"
                        />
                      </div>
 
                      {watch("storageSettings.provider") === "s3" && (
                        <div className="grid grid-cols-2 gap-3 pb-2 animate-in fade-in slide-in-from-top-1">
                          <div className="space-y-1.5">
                            <Label className="text-[10px] uppercase font-bold text-muted-foreground">Endpoint</Label>
                            <Input {...register("storageSettings.s3.endpoint")} className="h-8 text-xs" />
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-[10px] uppercase font-bold text-muted-foreground">Region</Label>
                            <Input {...register("storageSettings.s3.region")} className="h-8 text-xs" />
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-[10px] uppercase font-bold text-muted-foreground">Access Key ID</Label>
                            <Input {...register("storageSettings.s3.accessKeyId")} className="h-8 text-xs" />
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-[10px] uppercase font-bold text-muted-foreground">Secret Key</Label>
                            <Input type="password" {...register("storageSettings.s3.secretAccessKey")} className="h-8 text-xs" />
                          </div>
                          <div className="space-y-1.5 col-span-2">
                            <Label className="text-[10px] uppercase font-bold text-muted-foreground">Bucket Name</Label>
                            <Input {...register("storageSettings.s3.bucketName")} className="h-8 text-xs" />
                          </div>
                        </div>
                      )}
 
                      {watch("storageSettings.provider") === "cloudinary" && (
                        <div className="grid grid-cols-2 gap-3 pb-2 animate-in fade-in slide-in-from-top-1">
                          <div className="space-y-1.5">
                            <Label className="text-[10px] uppercase font-bold text-muted-foreground">Cloud Name</Label>
                            <Input {...register("storageSettings.cloudinary.cloudName")} className="h-8 text-xs" />
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-[10px] uppercase font-bold text-muted-foreground">API Key</Label>
                            <Input {...register("storageSettings.cloudinary.apiKey")} className="h-8 text-xs" />
                          </div>
                          <div className="space-y-1.5 col-span-2">
                            <Label className="text-[10px] uppercase font-bold text-muted-foreground">API Secret</Label>
                            <Input type="password" {...register("storageSettings.cloudinary.apiSecret")} className="h-8 text-xs" />
                          </div>
                        </div>
                      )}
                    </div>
                  )}
 
                  <div className="flex gap-3 p-3 bg-amber-500/5 border border-amber-500/10 rounded-xl">
                    <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0" />
                    <div className="space-y-1">
                      <p className="text-[11px] font-bold text-amber-600 uppercase tracking-tight">Data Integrity Warning</p>
                      <p className="text-[10px] leading-relaxed text-amber-600/80">
                        Changing your storage provider after setup may prevent previously uploaded receipts from loading. Choose your preference carefully.
                      </p>
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

