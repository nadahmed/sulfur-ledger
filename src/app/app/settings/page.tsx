"use client";

import { useState, useEffect, Suspense } from "react";
import { z } from "zod";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useUser } from "@auth0/nextjs-auth0/client";
import { useOrganization } from "@/context/OrganizationContext";
import { toast } from "sonner";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertCircle, Save, UserPlus, Shield, Mail, Trash2, Loader2, Key, Copy, Check, RotateCcw, FileJson, FileSpreadsheet, Download, Upload, Info, Sparkles, MessageSquare, Bot } from "lucide-react";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { cn, formatCurrency, slugify } from "@/lib/utils";
import {
  CURRENCY_PRESETS,
  COMMON_SYMBOLS,
  CurrencyGrouping,
  ThousandSeparator,
  DecimalSeparator,
  CurrencyPosition
} from "@/lib/constants/currencies";
import {
  OrganizationSchema,
  OrganizationFormValues,
  InvitationSchema,
  InvitationFormValues,
  EmailSettingsSchema,
  EmailSettingsFormValues,
  AiSettingsFormValues,
  AiSettingsSchema,
  ApiKeyFormValues,
  ApiKeySchema
} from "@/lib/schemas";

const GeneralOrgSchema = OrganizationSchema.pick({
  name: true,
  currencySymbol: true,
  currencyPosition: true,
  currencyHasSpace: true,
  thousandSeparator: true,
  decimalSeparator: true,
  grouping: true,
  decimalPlaces: true,
});
type GeneralOrgFormValues = z.infer<typeof GeneralOrgSchema>;

const parseCSVLine = (line: string) => {
  const result = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"' && line[i + 1] === '"') {
      current += '"';
      i++;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  result.push(current);
  return result;
};

const parseCSV = (csv: string) => {
  const lines = csv.split(/\r?\n/).filter(line => line.trim() !== "");
  if (lines.length < 2) return [];

  const headers = parseCSVLine(lines[0]).map(h => h.trim());
  return lines.slice(1).map(line => {
    const values = parseCSVLine(line);
    const obj: any = {};
    headers.forEach((header, i) => {
      obj[header] = values[i]?.trim();
    });
    return obj;
  }).filter(row => row["Date"] && row["Amount"] && row["From (Source)"] && row["To (Destination)"]);
};

export default function SettingsPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-muted-foreground">Loading settings...</div>}>
      <SettingsInner />
    </Suspense>
  );
}

function SettingsInner() {
  const { user, isLoading: isUserLoading } = useUser();
  const {
    activeOrganizationId,
    organizations,
    refreshOrganizations,
    setActiveOrganizationId,
    permissions,
    isOwner,
    isLoading: isOrgLoading
  } = useOrganization();
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const queryClient = useQueryClient();

  const urlTab = searchParams.get("tab");
  const activeTab = urlTab && ["general", "members", "email", "mcp", "ai", "storage", "data"].includes(urlTab) ? urlTab : "general";

  const handleTabChange = (value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", value);
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  };

  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [confirmConfig, setConfirmConfig] = useState<{
    open: boolean;
    title: string;
    description: string;
    onConfirm: () => void;
    variant?: "default" | "destructive";
  } | null>(null);

  const activeOrg = organizations.find(o => o.id === activeOrganizationId);
  const canManage = isOwner || permissions.includes("manage:organization");
  const isLoading = isOrgLoading;

  // --- Queries ---

  const { data: members = [], isLoading: isLoadingMembers } = useQuery({
    queryKey: ["members", activeOrganizationId],
    queryFn: async () => {
      const res = await fetch(`/api/organizations/members?orgId=${activeOrganizationId}`);
      if (!res.ok) throw new Error("Failed to fetch members");
      return res.json();
    },
    enabled: !!activeOrganizationId,
  });

  const { data: emailSettings, isLoading: isLoadingEmailSettings } = useQuery<EmailSettingsFormValues>({
    queryKey: ["email-settings", activeOrganizationId],
    queryFn: async () => {
      const res = await fetch(`/api/organizations/email-settings?orgId=${activeOrganizationId}`);
      if (!res.ok) throw new Error("Failed to fetch email settings");
      return res.json();
    },
    enabled: !!activeOrganizationId && canManage,
  });

  const { data: pendingInvites = [], isLoading: isLoadingInvites } = useQuery({
    queryKey: ["invitations", activeOrganizationId],
    queryFn: async () => {
      const res = await fetch(`/api/organizations/invitations?orgId=${activeOrganizationId}`);
      if (!res.ok) throw new Error("Failed to fetch invitations");
      return res.json();
    },
    enabled: !!activeOrganizationId && canManage,
  });


  const { data: aiSettings, isLoading: isLoadingAiSettings } = useQuery<AiSettingsFormValues>({
    queryKey: ["ai-settings", activeOrganizationId],
    queryFn: async () => {
      const res = await fetch(`/api/organizations/ai-settings?orgId=${activeOrganizationId}`);
      if (!res.ok) throw new Error("Failed to fetch AI settings");
      return res.json();
    },
    enabled: !!activeOrganizationId && canManage,
  });

  const { data: storageSettingsData, isLoading: isLoadingStorageSettings } = useQuery<{ storageSettings: any }>({
    queryKey: ["storage-settings", activeOrganizationId],
    queryFn: async () => {
      const res = await fetch(`/api/organizations/storage-settings?orgId=${activeOrganizationId}`);
      if (!res.ok) throw new Error("Failed to fetch storage settings");
      return res.json();
    },
    enabled: !!activeOrganizationId && canManage,
  });

  // --- Mutations ---

  const leaveOrgMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/organizations/members?orgId=${activeOrganizationId}&userId=${user?.sub}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error((await res.json()).error || "Failed to leave");
    },
    onSuccess: () => {
      refreshOrganizations();
      setActiveOrganizationId(null);
      toast.success("You have left the organization.");
      router.push("/app/onboarding");
    },
    onError: (err: any) => toast.error(err.message),
  });

  const removeMemberMutation = useMutation({
    mutationFn: async (userId: string) => {
      const resp = await fetch(`/api/organizations/members?orgId=${activeOrganizationId}&userId=${userId}`, {
        method: "DELETE",
      });
      if (!resp.ok) {
        const errorData = await resp.json();
        throw new Error(errorData.error || "Failed to remove member");
      }
      return resp.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["members", activeOrganizationId] });
      toast.success("Member removed");
    },
    onError: (err: any) => toast.error(err.message),
  });

  const updateRoleMutation = useMutation({
    mutationFn: async ({ userId, role }: { userId: string, role: string }) => {
      const resp = await fetch(`/api/organizations/members?orgId=${activeOrganizationId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, role }),
      });
      if (!resp.ok) {
        const errorData = await resp.json();
        throw new Error(errorData.error || "Failed to update role");
      }
      return resp.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["members", activeOrganizationId] });
      toast.success("Role updated");
    },
    onError: (err: any) => toast.error(err.message),
  });

  const updateOrgMutation = useMutation({
    mutationFn: async (values: GeneralOrgFormValues) => {
      const res = await fetch("/api/organizations", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: activeOrganizationId,
          name: values.name,
          currencySymbol: values.currencySymbol,
          currencyPosition: values.currencyPosition,
          currencyHasSpace: values.currencyHasSpace,
          thousandSeparator: values.thousandSeparator,
          decimalSeparator: values.decimalSeparator,
          grouping: values.grouping,
          decimalPlaces: values.decimalPlaces
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Update failed");
    },
    onSuccess: () => {
      refreshOrganizations();
      toast.success("Organization name updated!");
    },
    onError: (err: any) => toast.error(err.message),
  });

  const deleteOrgMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/organizations?id=${activeOrganizationId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error((await res.json()).error || "Delete failed");
    },
    onSuccess: () => {
      refreshOrganizations();
      setActiveOrganizationId(null);
      toast.success("Organization deleted successfully");
      router.push("/app/onboarding");
    },
    onError: (err: any) => toast.error(err.message),
  });

  const inviteMutation = useMutation({
    mutationFn: async (values: InvitationFormValues) => {
      const res = await fetch("/api/organizations/invitations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...values,
          orgId: activeOrganizationId,
          orgName: activeOrg?.name
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Invite failed");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["invitations"] });
      toast.success("Invitation sent successfully!");
      resetInvite();
    },
    onError: (err: any) => toast.error(err.message),
  });

  const saveEmailMutation = useMutation({
    mutationFn: async (values: EmailSettingsFormValues) => {
      const res = await fetch("/api/organizations/email-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orgId: activeOrganizationId, settings: values }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Update failed");
    },
    onSuccess: () => {
      toast.success("Email settings saved!");
      queryClient.invalidateQueries({ queryKey: ["email-settings"] });
    },
    onError: (err: any) => toast.error(err.message),
  });

  const testEmailMutation = useMutation({
    mutationFn: async (values: EmailSettingsFormValues) => {
      const res = await fetch("/api/organizations/email-settings/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings: values }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Test failed");
    },
    onSuccess: () => {
      toast.success("Test email sent! Check your inbox.");
    },
    onError: (err: any) => toast.error(err.message),
  });

  // --- Forms ---

  const cancelInviteMutation = useMutation({
    mutationFn: async (email: string) => {
      const res = await fetch(`/api/organizations/invitations?orgId=${activeOrganizationId}&email=${email}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error((await res.json()).error || "Cancellation failed");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["invitations"] });
      toast.success("Invitation cancelled");
    },
    onError: (err: any) => toast.error(err.message),
  });


  const saveStorageSettingsMutation = useMutation({
    mutationFn: async (values: { settings: any }) => {
      const res = await fetch("/api/organizations/storage-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orgId: activeOrganizationId, ...values }),
      });
      if (!res.ok) throw new Error("Update failed");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["storage-settings", activeOrganizationId] });
      toast.success("Storage settings updated successfully");
    },
    onError: (err: any) => toast.error(`Error: ${err.message}`),
  });

  const {
    register: registerAi,
    handleSubmit: handleSubmitAi,
    control: controlAi,
    watch: watchAi,
    reset: resetAi,
    formState: { errors: errorsAi }
  } = useForm<AiSettingsFormValues>({
    resolver: zodResolver(AiSettingsSchema),
    defaultValues: { provider: "system" }
  });

  useEffect(() => {
    if (aiSettings) resetAi(aiSettings);
  }, [aiSettings, resetAi]);

  const watchAiProvider = watchAi("provider");

  const saveAiMutation = useMutation({
    mutationFn: async (values: AiSettingsFormValues) => {
      const res = await fetch("/api/organizations/ai-settings", {
        method: "POST",
        body: JSON.stringify({ orgId: activeOrganizationId, settings: values }),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ai-settings", activeOrganizationId] });
      toast.success("AI settings updated successfully");
    },
    onError: (err: any) => toast.error(`Error: ${err.message}`),
  });
  
  const { data: apiKeys = [], isLoading: isLoadingKeys } = useQuery<any[]>({
    queryKey: ["api-keys", activeOrganizationId],
    queryFn: async () => {
      const res = await fetch(`/api/organizations/keys?orgId=${activeOrganizationId}`);
      if (!res.ok) throw new Error("Failed to fetch keys");
      return res.json();
    },
    enabled: !!activeOrganizationId && canManage,
  });

  const [showAddKey, setShowAddKey] = useState(false);
  const [newKeyData, setNewKeyData] = useState<any>(null);
  const [showConfigFor, setShowConfigFor] = useState<any>(null);

  const createKeyMutation = useMutation({
    mutationFn: async (values: ApiKeyFormValues) => {
      const res = await fetch("/api/organizations/keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...values, orgId: activeOrganizationId }),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: (data) => {
      setNewKeyData(data);
      setShowAddKey(false);
      queryClient.invalidateQueries({ queryKey: ["api-keys"] });
      toast.success("API Key created successfully!");
    },
    onError: (err: any) => toast.error(err.message),
  });

  const deleteKeyMutation = useMutation({
    mutationFn: async (keyValue: string) => {
      const res = await fetch(`/api/organizations/keys?orgId=${activeOrganizationId}&key=${keyValue}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to revoke key");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["api-keys"] });
      toast.success("API Key revoked");
    },
    onError: (err: any) => toast.error(err.message),
  });

  const {
    register: registerApiKey,
    handleSubmit: handleSubmitApiKey,
    control: controlApiKey,
    reset: resetApiKey,
    formState: { errors: apiKeyErrors }
  } = useForm<ApiKeyFormValues>({
    resolver: zodResolver(ApiKeySchema),
    defaultValues: { name: "", role: "member", ttlDays: "30" }
  });

  const {
    register: registerOrg,
    handleSubmit: handleSubmitOrg,
    control: controlOrg,
    watch: watchOrg,
    formState: { isDirty: isOrgDirty },
    setValue: setOrgValue,
  } = useForm<GeneralOrgFormValues>({
    resolver: zodResolver(GeneralOrgSchema),
    defaultValues: {
      name: activeOrg?.name || "",
      currencySymbol: activeOrg?.currencySymbol || "৳",
      currencyPosition: activeOrg?.currencyPosition || "prefix",
      currencyHasSpace: activeOrg?.currencyHasSpace || false,
      thousandSeparator: (activeOrg?.thousandSeparator as any) || ",",
      decimalSeparator: (activeOrg?.decimalSeparator as any) || ".",
      grouping: (activeOrg?.grouping as any) || "standard",
      decimalPlaces: activeOrg?.decimalPlaces ?? 2,
    },
  });

  useEffect(() => {
    if (activeOrg) {
      setOrgValue("name", activeOrg.name);
      setOrgValue("currencySymbol", activeOrg.currencySymbol || "৳");
      setOrgValue("currencyPosition", activeOrg.currencyPosition || "prefix");
      setOrgValue("currencyHasSpace", activeOrg.currencyHasSpace || false);
      setOrgValue("thousandSeparator", (activeOrg.thousandSeparator as any) || ",");
      setOrgValue("decimalSeparator", (activeOrg.decimalSeparator as any) || ".");
      setOrgValue("grouping", (activeOrg.grouping as any) || "standard");
      setOrgValue("decimalPlaces", activeOrg.decimalPlaces ?? 2);
    }
  }, [activeOrg, setOrgValue]);

  const applyPreset = (symbol: string) => {
    setOrgValue("currencySymbol", symbol, { shouldDirty: true });
    const preset = (CURRENCY_PRESETS as any)[symbol];
    if (preset) {
      setOrgValue("currencyPosition", preset.position, { shouldDirty: true });
      setOrgValue("currencyHasSpace", preset.hasSpace, { shouldDirty: true });
      setOrgValue("thousandSeparator", preset.thousandSeparator as any, { shouldDirty: true });
      setOrgValue("decimalSeparator", preset.decimalSeparator as any, { shouldDirty: true });
      setOrgValue("grouping", preset.grouping as any, { shouldDirty: true });
      setOrgValue("decimalPlaces", preset.decimalPlaces, { shouldDirty: true });
      toast.info(`Applied formatting preset for ${symbol}`);
    }
  };

  const selectedSymbol = watchOrg("currencySymbol");
  const selectedPosition = watchOrg("currencyPosition") || "prefix";
  const selectedHasSpace = watchOrg("currencyHasSpace");
  const selectedThousandSep = watchOrg("thousandSeparator") as ThousandSeparator || ",";
  const selectedDecimalSep = watchOrg("decimalSeparator") as DecimalSeparator || ".";
  const selectedGrouping = watchOrg("grouping") as CurrencyGrouping || "standard";
  const selectedDecimalPlaces = watchOrg("decimalPlaces") ?? 2;

  const {
    register: registerInvite,
    handleSubmit: handleSubmitInvite,
    control: controlInvite,
    reset: resetInvite,
    formState: { errors: inviteErrors },
  } = useForm<InvitationFormValues>({
    resolver: zodResolver(InvitationSchema),
    defaultValues: { email: "", role: "viewer" },
  });

  const {
    register: registerEmail,
    handleSubmit: handleSubmitEmail,
    control: controlEmail,
    setValue: setEmailValue,
    watch: watchEmail,
  } = useForm<EmailSettingsFormValues>({
    resolver: zodResolver(EmailSettingsSchema),
    defaultValues: emailSettings || { provider: "system", senderEmail: "", senderName: "Sulfur Book" },
  });


  const [storageProvider, setStorageProvider] = useState<"system" | "s3" | "cloudinary">("system");
  const [s3Settings, setS3Settings] = useState({
    endpoint: "",
    region: "",
    accessKeyId: "",
    secretAccessKey: "",
    bucketName: "",
  });
  const [cloudinarySettings, setCloudinarySettings] = useState({
    cloudName: "",
    apiKey: "",
    apiSecret: "",
  });
  const [customFolder, setCustomFolder] = useState("");

  useEffect(() => {
    if (storageSettingsData) {
      const s = storageSettingsData.storageSettings;
      if (s) {
        setStorageProvider(s.provider || "system");
        setCustomFolder(s.customFolder || "");
        if (s.s3) setS3Settings(s.s3);
        if (s.cloudinary) setCloudinarySettings(s.cloudinary);
      }
    }
  }, [storageSettingsData]);

  const [copied, setCopied] = useState(false);
  const [isExportingCsv, setIsExportingCsv] = useState(false);
  const [isExportingJson, setIsExportingJson] = useState(false);
  const [isImportingCsv, setIsImportingCsv] = useState(false);
  const [isImportingJson, setIsImportingJson] = useState(false);
  const [showAdvancedFormatting, setShowAdvancedFormatting] = useState(false);

  const watchProvider = watchEmail("provider");

  useEffect(() => {
    if (emailSettings) {
      Object.entries(emailSettings).forEach(([key, value]) => {
        setEmailValue(key as any, value);
      });
    }
  }, [emailSettings, setEmailValue]);

  if (isLoading) return <div className="p-8 text-center text-muted-foreground">Loading settings...</div>;

  if (!activeOrganizationId) {
    return <div className="p-8 text-center">Redirecting to setup...</div>;
  }

  return (
    <main className="max-w-screen-2xl p-4 md:p-6 min-h-screen pb-24">
      <div className="mb-4">
        <h1 className="text-xl font-bold">Settings</h1>
      </div>

      <div className="mt-4 mb-4 flex flex-wrap items-center gap-2">
        {[
          { id: "general", label: "General" },
          { id: "members", label: "Members" },
          { id: "email", label: "Email Delivery" },
          { id: "storage", label: "Receipts & Storage" },
          { id: "ai", label: "AI Assistant" },
          { id: "mcp", label: "MCP Server" },
          { id: "data", label: "Data Management" },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => handleTabChange(tab.id)}
            className={cn(
              "text-xs px-4 py-1.5 transition-all rounded-full font-semibold border shadow-sm touch-manipulation",
              activeTab === tab.id 
                ? "bg-primary border-primary text-primary-foreground shadow-primary/20 scale-105 z-10" 
                : "bg-background border-border text-muted-foreground hover:border-primary/40 hover:text-foreground"
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="mt-6">
        {activeTab === "general" && (
          <div className="space-y-6">
            <Card className="shadow-sm border-border/40 overflow-hidden bg-card/50 backdrop-blur-sm">
              <form onSubmit={handleSubmitOrg((v: GeneralOrgFormValues) => updateOrgMutation.mutate(v))}>
                <CardHeader className="pb-2 pt-4 px-5">
                  <CardTitle className="text-lg">Organization Details</CardTitle>
                  <CardDescription className="text-xs">Manage identity and accounting format.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4 px-5 pb-5">
                  <div className="space-y-1.5">
                    <Label htmlFor="org-name" className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Organization Name</Label>
                    <Input
                      id="org-name"
                      {...registerOrg("name")}
                      disabled={!canManage}
                      className="max-w-md h-9 text-sm"
                    />
                  </div>

                  <div className="pt-4 border-t border-border/30 space-y-4">
                    <div className="flex flex-col lg:flex-row flex-wrap items-stretch lg:items-center gap-4 p-3 bg-muted/20 rounded-xl border border-border/40 shadow-sm transition-all duration-300">
                      <div className="space-y-1.5 min-w-[120px]">
                        <Label className="text-[10px] uppercase tracking-widest text-muted-foreground font-black leading-none">Symbol</Label>
                        <div className="flex items-center gap-2 h-9">
                          <Input
                            id="currency-symbol"
                            placeholder="$"
                            {...registerOrg("currencySymbol")}
                            onChange={(e) => {
                              const val = e.target.value;
                              setOrgValue("currencySymbol", val, { shouldDirty: true });
                              if (CURRENCY_PRESETS[val]) {
                                applyPreset(val);
                              }
                            }}
                            className="h-full w-20 text-sm font-bold bg-card shadow-sm border-primary/20 focus-visible:ring-primary/30"
                            disabled={!canManage}
                          />
                        </div>
                      </div>

                      <div className="space-y-1.5 flex-1 min-w-[200px]">
                        <Label className="text-[10px] uppercase tracking-widest text-muted-foreground font-black leading-none">Presets</Label>
                        <div className="flex flex-wrap gap-1.5 items-center h-auto lg:h-9">
                          {COMMON_SYMBOLS.map((s) => (
                            <button
                              key={s}
                              type="button"
                              disabled={!canManage}
                              onClick={() => applyPreset(s)}
                              className={cn(
                                "w-8 h-8 flex items-center justify-center rounded-lg text-xs border transition-all shrink-0",
                                selectedSymbol === s
                                  ? "bg-primary border-primary text-white shadow-md scale-105"
                                  : "bg-card border-border/60 text-muted-foreground hover:border-primary/40 hover:bg-primary/5"
                              )}
                            >
                              {s}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="lg:border-l border-border/30 lg:pl-6 space-y-1.5 min-w-[140px]">
                        <Label className="text-[10px] uppercase tracking-widest text-primary font-black opacity-80 leading-none">Preview</Label>
                        <div className="h-9 flex items-center">
                          <span className="text-xl font-black text-foreground tabular-nums tracking-tight">
                            {formatCurrency(1234.56, selectedSymbol, selectedPosition, selectedHasSpace, selectedThousandSep, selectedDecimalSep, selectedGrouping, selectedDecimalPlaces)}
                          </span>
                        </div>
                      </div>

                      <div className="lg:border-l border-border/30 lg:pl-6 flex flex-col items-center justify-center space-y-1.5">
                        <Label className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold leading-none">Customize</Label>
                        <div className="h-9 flex items-center">
                          <Switch
                            checked={showAdvancedFormatting}
                            onCheckedChange={setShowAdvancedFormatting}
                            className="scale-90 data-[state=checked]:bg-primary"
                          />
                        </div>
                      </div>
                    </div>

                    {showAdvancedFormatting && (
                      <div className="p-4 bg-card/30 rounded-xl border border-border/40 shadow-inner space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                          <div className="space-y-1.5">
                            <Label className="text-[10px] uppercase tracking-widest text-muted-foreground font-black leading-none">Symbol Position</Label>
                            <div className="h-8">
                              <Controller
                                name="currencyPosition"
                                control={controlOrg}
                                render={({ field }) => (
                                  <Select
                                    value={field.value}
                                    onValueChange={field.onChange}
                                    disabled={!canManage}
                                  >
                                    <SelectTrigger className="w-full h-full text-xs bg-card shadow-sm border-border/60">
                                      <SelectValue placeholder="Position" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="prefix" className="text-xs">Before Amount</SelectItem>
                                      <SelectItem value="suffix" className="text-xs">After Amount</SelectItem>
                                    </SelectContent>
                                  </Select>
                                )}
                              />
                            </div>
                          </div>

                          <div className="space-y-1.5 shrink-0">
                            <Label className="text-[10px] uppercase tracking-widest text-muted-foreground font-black leading-none">Use Spacing</Label>
                            <div className="flex items-center justify-center bg-card px-3 h-8 rounded-lg border border-border/60 shadow-sm w-fit">
                              <Controller
                                name="currencyHasSpace"
                                control={controlOrg}
                                render={({ field }) => (
                                  <Switch
                                    checked={field.value}
                                    onCheckedChange={field.onChange}
                                    className="scale-75"
                                    disabled={!canManage}
                                  />
                                )}
                              />
                            </div>
                          </div>
                        </div>

                        <div className="pt-4 border-t border-border/30 grid grid-cols-2 lg:grid-cols-4 gap-4">
                          <div className="space-y-1.5">
                            <Label className="text-[10px] uppercase tracking-widest text-muted-foreground font-black leading-none">Thousand Sep</Label>
                            <Controller
                              name="thousandSeparator"
                              control={controlOrg}
                              render={({ field }) => (
                                <Select value={field.value} onValueChange={field.onChange} disabled={!canManage}>
                                  <SelectTrigger className="h-8 text-xs bg-card border-border/60">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="," className="text-xs">Comma ( , )</SelectItem>
                                    <SelectItem value="." className="text-xs">Dot ( . )</SelectItem>
                                    <SelectItem value=" " className="text-xs">Space ( )</SelectItem>
                                    <SelectItem value="'" className="text-xs">Single Quote ( ' )</SelectItem>
                                    <SelectItem value="none" className="text-xs">None</SelectItem>
                                  </SelectContent>
                                </Select>
                              )}
                            />
                          </div>

                          <div className="space-y-1.5">
                            <Label className="text-[10px] uppercase tracking-widest text-muted-foreground font-black leading-none">Decimal Sep</Label>
                            <Controller
                              name="decimalSeparator"
                              control={controlOrg}
                              render={({ field }) => (
                                <Select value={field.value} onValueChange={field.onChange} disabled={!canManage}>
                                  <SelectTrigger className="h-8 text-xs bg-card border-border/60">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="." className="text-xs">Dot ( . )</SelectItem>
                                    <SelectItem value="," className="text-xs">Comma ( , )</SelectItem>
                                  </SelectContent>
                                </Select>
                              )}
                            />
                          </div>

                          <div className="space-y-1.5">
                            <Label className="text-[10px] uppercase tracking-widest text-muted-foreground font-black leading-none">Grouping</Label>
                            <Controller
                              name="grouping"
                              control={controlOrg}
                              render={({ field }) => (
                                <Select value={field.value} onValueChange={field.onChange} disabled={!canManage}>
                                  <SelectTrigger className="h-8 text-xs bg-card border-border/60">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="standard" className="text-xs">Standard (3-3)</SelectItem>
                                    <SelectItem value="indian" className="text-xs">Indian (3-2)</SelectItem>
                                    <SelectItem value="none" className="text-xs">None</SelectItem>
                                  </SelectContent>
                                </Select>
                              )}
                            />
                          </div>

                          <div className="space-y-1.5">
                            <Label className="text-[10px] uppercase tracking-widest text-muted-foreground font-black leading-none">Decimal Places</Label>
                            <Input
                              type="number"
                              min={0}
                              max={4}
                              {...registerOrg("decimalPlaces", { valueAsNumber: true })}
                              disabled={!canManage}
                              className="h-8 text-xs bg-card font-bold border-border/60"
                            />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="mt-4 p-3 bg-muted/30 border border-border rounded-xl text-[10px] text-muted-foreground flex items-start gap-2 max-w-2xl">
                    <Info className="w-3.5 h-3.5 mt-0.5 shrink-0 opacity-70" />
                    <p className="leading-relaxed">This setting only changes the <strong>display symbol</strong> across reports and exports. It does not convert historical amounts or change the underlying values in your database.</p>
                  </div>
                </CardContent>
                {canManage && (
                  <CardFooter className="bg-muted/10 border-t border-border/40 py-2.5 px-5">
                    <Button type="submit" size="sm" className="h-8 px-5 bg-primary hover:bg-primary/90 shadow-sm transition-all" disabled={updateOrgMutation.isPending || !isOrgDirty}>
                      {updateOrgMutation.isPending ? "Saving..." : <span className="flex items-center gap-2 text-xs font-semibold"><Save className="w-3 h-3" /> Save Changes</span>}
                    </Button>
                  </CardFooter>
                )}
              </form>
            </Card>

            {!isOwner && (
              <Card className="border-warning/20 shadow-sm bg-warning/5 overflow-hidden mt-8">
                <CardHeader className="pb-2 pt-4 px-5">
                  <div className="flex items-center gap-2 text-warning">
                    <CardTitle className="text-lg">Leave Organization</CardTitle>
                  </div>
                  <CardDescription className="text-xs text-warning/80">You will lose all access to this organization's data and reports.</CardDescription>
                </CardHeader>
                <CardFooter className="bg-warning/10 border-t border-warning/20 px-5 py-2.5">
                  <Button
                    variant="outline"
                    size="sm"
                    className="border-warning/30 text-warning hover:bg-warning/20 hover:border-warning/40 font-semibold shadow-sm"
                    onClick={() => {
                      setConfirmConfig({
                        open: true,
                        title: "Leave Organization",
                        description: "Are you sure you want to leave this organization? This action will immediately revoke your access.",
                        variant: "destructive",
                        onConfirm: () => leaveOrgMutation.mutate(),
                      });
                    }}
                    disabled={leaveOrgMutation.isPending}
                  >
                    {leaveOrgMutation.isPending ? "Leaving..." : "Leave Organization"}
                  </Button>
                </CardFooter>
              </Card>
            )}

            {isOwner && (
              <div className="mt-12 space-y-4">
                <div className="flex items-center gap-3">
                  <div className="h-px flex-1 bg-destructive/10" />
                  <span className="text-[10px] uppercase font-black tracking-widest text-destructive/60">Danger Zone</span>
                  <div className="h-px flex-1 bg-destructive/10" />
                </div>
                <Card className="border-destructive/20 shadow-md bg-destructive/5 overflow-hidden">
                  <CardHeader className="pb-2 pt-4 px-5">
                    <div className="flex items-center gap-2 text-destructive">
                      <AlertCircle className="w-5 h-5" />
                      <CardTitle className="text-lg">Delete Organization</CardTitle>
                    </div>
                    <CardDescription className="text-xs text-destructive/70">Permanently delete this organization, all its members, and every record.</CardDescription>
                  </CardHeader>
                  <CardContent className="px-5 pb-5 space-y-4 font-medium">
                    <div className="space-y-2 max-w-md">
                      <Label className="text-[10px] uppercase font-bold text-destructive/40 tracking-widest">Confirmation Required</Label>
                      <p className="text-xs text-destructive/80">To proceed, please type the organization name: <strong className="select-all opacity-100 font-black">"{activeOrg?.name}"</strong></p>
                      <Input
                        value={deleteConfirm}
                        onChange={(e) => setDeleteConfirm(e.target.value)}
                        placeholder="Enter organization name..."
                        className="h-9 border-destructive/20 focus:ring-destructive text-sm font-medium bg-background/50"
                      />
                    </div>
                  </CardContent>
                  <CardFooter className="bg-destructive/10 border-t border-destructive/20 px-5 py-2.5">
                    <Button
                      variant="destructive"
                      size="sm"
                      className="h-8 px-5 font-bold flex items-center gap-2 shadow-sm transition-all"
                      disabled={deleteOrgMutation.isPending || deleteConfirm !== activeOrg?.name}
                      onClick={() => deleteOrgMutation.mutate()}
                    >
                      {deleteOrgMutation.isPending ? "Deleting..." : <><Trash2 className="w-3.5 h-3.5" /> Delete Forever</>}
                    </Button>
                  </CardFooter>
                </Card>
              </div>
            )}
          </div>
        )}

        {activeTab === "members" && (
          <div className="space-y-8">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <Card className="bg-muted/30">
                <CardHeader>
                  <CardTitle className="text-sm font-medium">Organization</CardTitle>
                </CardHeader>
                <CardContent>
                  <div>
                    <p className="font-medium">{activeOrg?.name || "Current Organization"}</p>
                    <code className="text-xs break-all text-muted-foreground mt-1 block">{activeOrganizationId}</code>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-muted/30">
                <CardHeader>
                  <CardTitle className="text-sm font-medium">Created On</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground/80 font-medium">
                    {activeOrg?.createdAt 
                      ? new Date(activeOrg.createdAt).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })
                      : new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}
                  </p>
                </CardContent>
              </Card>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              <div className="md:col-span-1 space-y-8">
                <Card className="shadow-sm border-border/40">
                  <CardHeader className="pb-2 pt-4 px-5">
                    <CardTitle className="text-lg flex items-center gap-2">
                      <UserPlus className="w-5 h-5 text-primary" /> 
                      Invite Member
                    </CardTitle>
                    <CardDescription className="text-xs text-muted-foreground">Add colleagues to your organization.</CardDescription>
                  </CardHeader>
                  <form onSubmit={handleSubmitInvite((v) => inviteMutation.mutate(v))}>
                    <CardContent className="space-y-4 px-5 pb-5">
                      <div className="space-y-1.5">
                        <Label htmlFor="email" className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Email Address</Label>
                        <Input
                          id="email"
                          type="email"
                          placeholder="colleague@example.com"
                          {...registerInvite("email")}
                          disabled={!canManage}
                          className={cn("h-9 text-sm", inviteErrors.email ? "border-destructive" : "")}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="role" className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Role</Label>
                        <Controller
                          name="role"
                          control={controlInvite}
                          render={({ field }) => (
                            <Select value={field.value} onValueChange={field.onChange} disabled={!canManage}>
                              <SelectTrigger id="role" className="h-9 text-sm">
                                <SelectValue>
                                  {field.value === "viewer" ? "Viewer" : field.value === "member" ? "Editor" : field.value === "admin" ? "Admin" : undefined}
                                </SelectValue>
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="viewer">Viewer</SelectItem>
                                <SelectItem value="member">Editor</SelectItem>
                                <SelectItem value="admin">Admin</SelectItem>
                              </SelectContent>
                            </Select>
                          )}
                        />
                      </div>
                    </CardContent>
                    <CardFooter className="bg-muted/10 border-t border-border/40 py-2.5 px-5">
                      <Button size="sm" className="h-8 px-5 bg-primary hover:bg-primary/90 shadow-sm transition-all text-xs font-semibold" type="submit" disabled={!canManage || inviteMutation.isPending}>
                        {inviteMutation.isPending ? "Sending..." : "Send Invitation"}
                      </Button>
                    </CardFooter>
                  </form>
                </Card>

                <Card className="shadow-sm border-border/40">
                  <CardHeader className="pb-2 pt-4 px-5">
                    <CardTitle className="text-lg">Pending Invitations</CardTitle>
                    <CardDescription className="text-xs">Manage sent but unaccepted invites.</CardDescription>
                  </CardHeader>
                  <CardContent className="px-5 pb-5">
                    {isLoadingInvites ? (
                      <p className="text-sm text-muted-foreground italic">Loading invitations...</p>
                    ) : pendingInvites.length === 0 ? (
                      <p className="text-sm text-muted-foreground italic">No pending invitations.</p>
                    ) : (
                      <div className="space-y-3">
                        {pendingInvites.map((invite: any) => {
                          const createdAt = new Date(invite.createdAt);
                          const expiresAt = new Date(createdAt.getTime() + 48 * 60 * 60 * 1000);
                          const now = new Date();
                          const diffMs = expiresAt.getTime() - now.getTime();
                          const diffHours = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60)));
                          const diffMins = Math.max(0, Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60)));

                          return (
                            <div key={invite.email} className="flex items-center justify-between p-3 bg-muted/20 rounded-lg border border-border">
                              <div className="flex-1 min-w-0 pr-4">
                                <p className="text-sm font-medium truncate">{invite.email}</p>
                                <div className="flex items-center gap-3 mt-1">
                                  <p className="text-xs text-muted-foreground flex items-center gap-1 capitalize">
                                    <Shield className="w-3 h-3" /> {invite.role}
                                  </p>
                                  <p className="text-xs text-amber-600 font-medium">
                                    {diffHours}h left
                                  </p>
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                {canManage && (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 text-muted-foreground hover:text-red-600"
                                    onClick={() => cancelInviteMutation.mutate(invite.email)}
                                    disabled={cancelInviteMutation.isPending}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>

              <div className="md:col-span-2">
                <Card className="h-full shadow-sm border-border/40 overflow-hidden">
                  <CardHeader className="pb-2 pt-4 px-5">
                    <CardTitle className="text-lg">Active Members</CardTitle>
                    <CardDescription className="text-xs">Manage people who have access to this organization.</CardDescription>
                  </CardHeader>
                  <CardContent className="px-5 pb-5">
                    {isLoadingMembers ? (
                      <div className="flex items-center justify-center p-8 text-muted-foreground italic">
                        <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading members...
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {members.map((m: any) => {
                          const isSelf = m.userId === user?.sub;
                          return (
                            <div key={m.userId} className="flex items-center justify-between p-4 bg-muted/20 hover:bg-accent rounded-xl border border-border transition-colors">
                              <div className="flex items-center gap-4">
                                {m.userPicture ? (
                                  <img
                                    src={m.userPicture}
                                    alt={m.userName || "User"}
                                    className="w-10 h-10 rounded-full border border-border"
                                  />
                                ) : (
                                  <div className="w-10 h-10 rounded-full bg-muted text-muted-foreground flex items-center justify-center font-bold text-lg">
                                    {(m.userName || m.userEmail || "U").charAt(0).toUpperCase()}
                                  </div>
                                )}
                                <div>
                                  <p className="font-semibold text-foreground flex items-center gap-2">
                                    {m.userName || `User ${m.userId.slice(-6)}`}
                                    {isSelf && <span className="text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">You</span>}
                                  </p>
                                  <div className="flex flex-col gap-0.5">
                                    {m.userEmail && <p className="text-xs text-muted-foreground font-medium">{m.userEmail}</p>}
                                    <div className="flex items-center gap-1 mt-0.5">
                                      <Shield className="w-3 h-3 text-muted-foreground" />
                                      {m.isOwner ? (
                                        <span className="text-xs text-muted-foreground capitalize underline decoration-dotted underline-offset-2 decoration-primary/50">Owner</span>
                                      ) : (
                                        <Select
                                          value={m.role}
                                          onValueChange={(newRole) => updateRoleMutation.mutate({ userId: m.userId, role: newRole })}
                                          disabled={!canManage || isSelf || updateRoleMutation.isPending}
                                        >
                                          <SelectTrigger className="h-6 w-auto border-none bg-transparent p-0 text-xs font-medium capitalize focus:ring-0">
                                            <SelectValue>
                                              {m.role === "admin" ? "Admin" : m.role === "member" ? "Member" : m.role === "viewer" ? "Viewer" : undefined}
                                            </SelectValue>
                                          </SelectTrigger>
                                          <SelectContent>
                                            <SelectItem value="admin">Admin</SelectItem>
                                            <SelectItem value="member">Member</SelectItem>
                                            <SelectItem value="viewer">Viewer</SelectItem>
                                          </SelectContent>
                                        </Select>
                                      )}
                                      {updateRoleMutation.isPending && updateRoleMutation.variables?.userId === m.userId && (
                                        <Loader2 className="w-3 h-3 animate-spin text-primary" />
                                      )}
                                    </div>
                                  </div>
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                {!m.isOwner && !isSelf && canManage && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="text-destructive hover:bg-destructive/10 hover:text-destructive transition-colors"
                                    onClick={() => {
                                      setConfirmConfig({
                                        open: true,
                                        title: "Remove Member",
                                        description: `Are you sure you want to remove ${m.userName || m.userEmail} from the organization?`,
                                        variant: "destructive",
                                        onConfirm: () => removeMemberMutation.mutate(m.userId),
                                      });
                                    }}
                                    disabled={removeMemberMutation.isPending}
                                  >
                                    <Trash2 className="w-4 h-4 mr-2" />
                                    Remove
                                  </Button>
                                )}
                                {!m.isOwner && isSelf && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="text-warning hover:bg-warning/10 hover:text-warning transition-colors"
                                    onClick={() => {
                                      setConfirmConfig({
                                        open: true,
                                        title: "Leave Organization",
                                        description: "Are you sure you want to leave this organization?",
                                        variant: "destructive",
                                        onConfirm: () => leaveOrgMutation.mutate(),
                                      });
                                    }}
                                    disabled={leaveOrgMutation.isPending}
                                  >
                                    Leave
                                  </Button>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>
        )}

        {activeTab === "email" && (
          <div className="space-y-8">
            <Card className="shadow-sm border-border/40 overflow-hidden bg-card/50 backdrop-blur-sm">
              <CardHeader className="pb-2 pt-4 px-5">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Mail className="w-5 h-5 text-primary" /> 
                  Email Delivery
                </CardTitle>
                <CardDescription className="text-xs text-muted-foreground">Configure how this organization sends emails.</CardDescription>
              </CardHeader>
              <form onSubmit={handleSubmitEmail((v) => saveEmailMutation.mutate(v))}>
                <CardContent className="space-y-4 px-5 pb-5">
                  {isLoadingEmailSettings ? (
                    <div className="p-8 text-center text-muted-foreground italic">Loading email settings...</div>
                  ) : (
                    <div className="space-y-6">
                      <div className="space-y-4">
                        <div className="grid w-full items-center gap-1.5">
                          <Label htmlFor="provider" className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Email Provider</Label>
                          <Controller
                            name="provider"
                            control={controlEmail}
                            render={({ field }) => (
                              <Select
                                value={field.value}
                                onValueChange={field.onChange}
                                disabled={!canManage}
                              >
                                <SelectTrigger id="provider" className="h-9 text-sm">
                                  <SelectValue>
                                    {field.value === "system" ? "System Default" : field.value === "brevo" ? "Brevo (API)" : field.value === "smtp" ? "Custom SMTP" : undefined}
                                  </SelectValue>
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="system">System Default</SelectItem>
                                  <SelectItem value="brevo">Brevo (API)</SelectItem>
                                  <SelectItem value="smtp">Custom SMTP</SelectItem>
                                </SelectContent>
                              </Select>
                            )}
                          />
                        </div>

                        {watchProvider !== "system" && (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="space-y-1.5">
                              <Label htmlFor="senderName" className="text-[10px] uppercase font-bold text-muted-foreground">Sender Name</Label>
                              <Input
                                id="senderName"
                                {...registerEmail("senderName")}
                                disabled={!canManage}
                                className="h-9 text-sm"
                              />
                            </div>
                            <div className="space-y-1.5">
                              <Label htmlFor="senderEmail" className="text-[10px] uppercase font-bold text-muted-foreground">Sender Email</Label>
                              <Input
                                id="senderEmail"
                                type="email"
                                {...registerEmail("senderEmail")}
                                disabled={!canManage}
                                className="h-9 text-sm"
                              />
                            </div>
                          </div>
                        )}

                        {watchProvider === "brevo" && (
                          <div className="space-y-1.5">
                            <Label htmlFor="apiKey" className="text-[10px] uppercase font-bold text-muted-foreground">Brevo API Key</Label>
                            <Input
                              id="apiKey"
                              type="password"
                              placeholder="xkeysib-..."
                              {...registerEmail("apiKey")}
                              disabled={!canManage}
                              className="h-9 text-sm"
                            />
                          </div>
                        )}

                        {watchProvider === "smtp" && (
                          <div className="space-y-4">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 border-t border-border/30 pt-4">
                              <div className="space-y-1.5">
                                <Label htmlFor="smtpHost" className="text-[10px] uppercase font-bold text-muted-foreground">SMTP Host</Label>
                                <Input id="smtpHost" {...registerEmail("smtpHost")} placeholder="smtp.example.com" className="h-9 text-sm" />
                              </div>
                              <div className="space-y-1.5">
                                <Label htmlFor="smtpPort" className="text-[10px] uppercase font-bold text-muted-foreground">Port</Label>
                                <Input id="smtpPort" type="number" {...registerEmail("smtpPort", { valueAsNumber: true })} placeholder="587" className="h-9 text-sm" />
                              </div>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                              <div className="space-y-1.5">
                                <Label htmlFor="smtpUser" className="text-[10px] uppercase font-bold text-muted-foreground">Username</Label>
                                <Input id="smtpUser" {...registerEmail("smtpUser")} disabled={!canManage} className="h-9 text-sm" />
                              </div>
                              <div className="space-y-1.5">
                                <Label htmlFor="smtpPass" className="text-[10px] uppercase font-bold text-muted-foreground">Password</Label>
                                <Input id="smtpPass" type="password" {...registerEmail("smtpPass")} disabled={!canManage} className="h-9 text-sm" />
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </CardContent>
                {canManage && (
                  <CardFooter className="bg-muted/10 border-t border-border/40 py-2.5 px-5 flex flex-wrap gap-3">
                    <Button size="sm" className="h-8 px-5 bg-primary hover:bg-primary/90 shadow-sm transition-all text-xs font-semibold" type="submit" disabled={saveEmailMutation.isPending || testEmailMutation.isPending}>
                      {saveEmailMutation.isPending ? "Saving..." : <span className="flex items-center gap-2"><Save className="w-3 h-3" /> Save Email Settings</span>}
                    </Button>
                    {watchProvider !== "system" && (
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        className="h-8 px-4 text-xs font-semibold shadow-sm border border-border/60"
                        onClick={handleSubmitEmail((v) => testEmailMutation.mutate(v))}
                        disabled={saveEmailMutation.isPending || testEmailMutation.isPending}
                      >
                        {testEmailMutation.isPending ? "Sending..." : "Send Test Email"}
                      </Button>
                    )}
                  </CardFooter>
                )}
              </form>
            </Card>
          </div>
        )}

        {activeTab === "mcp" && (
          <div className="space-y-8">
            <Card className="shadow-sm border-border/40 overflow-hidden bg-card/50 backdrop-blur-sm">
              <CardHeader className="pb-2 pt-4 px-5 flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Key className="w-5 h-5 text-primary" /> 
                    API Access Keys (MCP)
                  </CardTitle>
                  <CardDescription className="text-xs text-muted-foreground">
                    Create keys to connect external AI agents via the Model Context Protocol.
                  </CardDescription>
                </div>
                {canManage && (
                  <Button size="sm" onClick={() => { resetApiKey(); setShowAddKey(true); }}>
                    <UserPlus className="w-4 h-4 mr-2" /> Add Key
                  </Button>
                )}
              </CardHeader>
              <CardContent className="px-5 pb-5 mt-4">
                {isLoadingKeys ? (
                  <div className="p-12 text-center text-muted-foreground italic">Loading access keys...</div>
                ) : apiKeys.length === 0 ? (
                  <div className="py-12 flex flex-col items-center justify-center text-center space-y-4 border-2 border-dashed rounded-xl border-border/40 bg-muted/5">
                    <div className="w-12 h-12 bg-muted rounded-full flex items-center justify-center">
                      <Key className="w-6 h-6 text-muted-foreground" />
                    </div>
                    <div className="max-w-xs">
                      <p className="text-sm font-semibold">No Keys Found</p>
                      <p className="text-xs text-muted-foreground">Create your first key to enable AI integration for this organization.</p>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-md border border-border/40 overflow-hidden">
                    <Table>
                      <TableHeader className="bg-muted/30">
                        <TableRow>
                          <TableHead className="text-[10px] uppercase font-bold">Label</TableHead>
                          <TableHead className="text-[10px] uppercase font-bold text-center">Role</TableHead>
                          <TableHead className="text-[10px] uppercase font-bold text-center">Expires</TableHead>
                          <TableHead className="text-[10px] uppercase font-bold text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {apiKeys.map((k) => (
                          <TableRow key={k.key} className="hover:bg-muted/10 transition-colors">
                            <TableCell>
                              <div className="text-sm font-semibold">{k.name}</div>
                              <div className="text-[10px] text-muted-foreground tabular-nums">ID: ...{k.key.slice(-8)}</div>
                            </TableCell>
                            <TableCell className="text-center">
                              <Badge variant={k.role === 'admin' ? 'default' : k.role === 'member' ? 'secondary' : 'outline'} className="text-[10px] font-bold uppercase">
                                {k.role}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-xs text-center tabular-nums text-muted-foreground">
                              {k.expiresAt ? new Date(k.expiresAt).toLocaleDateString() : "Never"}
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex justify-end gap-2">
                                <Button 
                                  variant="ghost" 
                                  size="icon" 
                                  className="h-8 w-8"
                                  onClick={() => setShowConfigFor(k)}
                                  title="View Configuration"
                                >
                                  <FileJson className="w-4 h-4" />
                                </Button>
                                <Button 
                                  variant="ghost" 
                                  size="icon" 
                                  className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                                  onClick={() => {
                                    setConfirmConfig({
                                      open: true,
                                      title: "Revoke API Key",
                                      description: `This will immediately revoke access for "${k.name}". This action cannot be undone.`,
                                      variant: "destructive",
                                      onConfirm: () => deleteKeyMutation.mutate(k.key),
                                    });
                                  }}
                                >
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Dialog: Add Key */}
            <Dialog open={showAddKey} onOpenChange={setShowAddKey}>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>Create API Key</DialogTitle>
                  <DialogDescription>
                    Generate a new key to access this organization's tools via MCP.
                  </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmitApiKey((v) => createKeyMutation.mutate(v))}>
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label htmlFor="key-name">Label / Application Name</Label>
                      <Input
                        id="key-name"
                        placeholder="e.g. Claude Desktop, Zapier..."
                        {...registerApiKey("name")}
                      />
                      {apiKeyErrors.name && <p className="text-[10px] text-destructive font-bold uppercase">{apiKeyErrors.name.message}</p>}
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Role</Label>
                        <Controller
                          name="role"
                          control={controlApiKey}
                          render={({ field }) => (
                            <Select onValueChange={field.onChange} defaultValue={field.value}>
                              <SelectTrigger>
                                <SelectValue placeholder="Select Role" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="viewer">Viewer (Read-only)</SelectItem>
                                <SelectItem value="member">Member (Transactions)</SelectItem>
                                <SelectItem value="admin">Admin (Full Access)</SelectItem>
                              </SelectContent>
                            </Select>
                          )}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Expiration</Label>
                        <Controller
                          name="ttlDays"
                          control={controlApiKey}
                          render={({ field }) => (
                            <Select onValueChange={field.onChange} defaultValue={field.value}>
                              <SelectTrigger>
                                <SelectValue placeholder="Expiry" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="7">7 Days</SelectItem>
                                <SelectItem value="30">30 Days</SelectItem>
                                <SelectItem value="90">90 Days</SelectItem>
                                <SelectItem value="never">Never</SelectItem>
                              </SelectContent>
                            </Select>
                          )}
                        />
                      </div>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" type="button" onClick={() => setShowAddKey(false)}>Cancel</Button>
                    <Button type="submit" disabled={createKeyMutation.isPending}>
                      {createKeyMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                      Generate Key
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>

            {/* Dialog: Reveal Key (One-time) */}
            <Dialog open={!!newKeyData} onOpenChange={(open) => !open && setNewKeyData(null)}>
              <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <Shield className="w-5 h-5 text-primary" /> Key Created Successfully
                  </DialogTitle>
                  <DialogDescription className="text-destructive font-bold">
                    WARNING: This key will only be shown ONCE. Please copy and store it securely.
                  </DialogDescription>
                </DialogHeader>
                <div className="p-4 bg-muted border border-border rounded-lg space-y-4">
                  <div className="flex items-center gap-2">
                    <Input
                      value={newKeyData?.fullKey || ""}
                      readOnly
                      className="bg-background font-mono text-sm"
                    />
                    <Button
                      size="icon"
                      variant="outline"
                      className="shrink-0"
                      onClick={() => {
                        navigator.clipboard.writeText(newKeyData.fullKey);
                        setCopied(true);
                        setTimeout(() => setCopied(false), 2000);
                        toast.success("API Key copied");
                      }}
                    >
                      {copied ? <Check className="w-4 h-4 text-primary" /> : <Copy className="w-4 h-4" />}
                    </Button>
                  </div>
                </div>
                <DialogFooter>
                  <Button onClick={() => setNewKeyData(null)}>I have saved the key</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            {/* Dialog: Config Viewer */}
            <Dialog open={!!showConfigFor} onOpenChange={(open) => !open && setShowConfigFor(null)}>
              <DialogContent className="sm:max-w-xl">
                <DialogHeader>
                  <DialogTitle>MCP Server Configuration</DialogTitle>
                  <DialogDescription>
                    Copy this configuration for use with your MCP client (e.g. Claude Desktop).
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="relative">
                    <pre className="p-4 bg-neutral-900 text-neutral-100 rounded-lg text-xs overflow-x-auto tabular-nums">
                      {JSON.stringify({
                        mcpServers: {
                          [`${slugify(activeOrg?.name || "sulfur")}-${slugify(showConfigFor?.name || "agent")}`]: {
                            url: `${typeof window !== 'undefined' ? window.location.origin : ''}/.netlify/functions/mcp`,
                            transport: "http",
                            headers: {
                              "x-mcp-key": "YOUR_SECRET_KEY_HERE"
                            }
                          }
                        }
                      }, null, 2)}
                    </pre>
                    <p className="text-[10px] text-muted-foreground mt-2 italic px-1">
                      Note: Replace <code>YOUR_SECRET_KEY_HERE</code> with the secret key generated for "{showConfigFor?.name}".
                    </p>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setShowConfigFor(null)}>Close</Button>
                  <Button 
                    onClick={() => {
                      const config = {
                        mcpServers: {
                          [`${slugify(activeOrg?.name || "sulfur")}-${slugify(showConfigFor?.name || "agent")}`]: {
                            url: `${window.location.origin}/.netlify/functions/mcp`,
                            transport: "http",
                            headers: {
                              "x-mcp-key": "YOUR_SECRET_KEY_HERE"
                            }
                          }
                        }
                      };
                      navigator.clipboard.writeText(JSON.stringify(config, null, 2));
                      toast.success("Template copied!");
                    }}
                  >
                    Copy Template
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        )}

        {activeTab === "storage" && (
          <div className="space-y-6">
            <Card className="shadow-sm border-border/40 overflow-hidden bg-card/50 backdrop-blur-sm">
              <CardHeader className="pb-2 pt-4 px-5">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-lg">Receipt Configuration</CardTitle>
                    <CardDescription className="text-xs">
                      Receipt storage is always enabled for all transactions.
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-6 px-5 pb-5">
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Storage Provider</Label>
                    <Select
                      value={storageProvider}
                      onValueChange={(v: any) => setStorageProvider(v)}
                      disabled={!canManage}
                    >
                      <SelectTrigger className="w-full max-w-md">
                        <SelectValue>
                          {storageProvider === "system" && "System Default"}
                          {storageProvider === "s3" && "Custom S3 Storage"}
                          {storageProvider === "cloudinary" && "Custom Cloudinary"}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="system">System Default</SelectItem>
                        <SelectItem value="s3">Custom S3 Storage</SelectItem>
                        <SelectItem value="cloudinary">Custom Cloudinary</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {storageProvider !== "system" && (
                    <div className="space-y-1.5 animate-in fade-in slide-in-from-top-1">
                      <Label htmlFor="custom-folder" className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Storage Path / Prefix</Label>
                      <Input
                        id="custom-folder"
                        value={customFolder}
                        onChange={(e) => setCustomFolder(e.target.value)}
                        placeholder="e.g. receipts/2024"
                        disabled={!canManage}
                        className="max-w-md"
                      />
                      <p className="text-[10px] text-muted-foreground">Optional. Files will be organized under this path.</p>
                    </div>
                  )}

                  {storageProvider === "s3" && (
                    <div className="pt-4 border-t border-border/30 grid grid-cols-1 md:grid-cols-2 gap-4 animate-in fade-in slide-in-from-top-2">
                      <div className="space-y-1.5">
                        <Label className="text-[10px] uppercase font-bold text-muted-foreground">Endpoint</Label>
                        <Input
                          value={s3Settings.endpoint}
                          onChange={(e) => setS3Settings({ ...s3Settings, endpoint: e.target.value })}
                          placeholder="https://..."
                          className="h-9 text-sm"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-[10px] uppercase font-bold text-muted-foreground">Region</Label>
                        <Input
                          value={s3Settings.region}
                          onChange={(e) => setS3Settings({ ...s3Settings, region: e.target.value })}
                          placeholder="us-east-1"
                          className="h-9 text-sm"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-[10px] uppercase font-bold text-muted-foreground">Access Key ID</Label>
                        <Input
                          value={s3Settings.accessKeyId}
                          onChange={(e) => setS3Settings({ ...s3Settings, accessKeyId: e.target.value })}
                          placeholder="..."
                          className="h-9 text-sm"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-[10px] uppercase font-bold text-muted-foreground">Secret Access Key</Label>
                        <Input
                          type="password"
                          value={s3Settings.secretAccessKey}
                          onChange={(e) => setS3Settings({ ...s3Settings, secretAccessKey: e.target.value })}
                          placeholder="..."
                          className="h-9 text-sm"
                        />
                      </div>
                      <div className="space-y-1.5 md:col-span-2">
                        <Label className="text-[10px] uppercase font-bold text-muted-foreground">Bucket Name</Label>
                        <Input
                          value={s3Settings.bucketName}
                          onChange={(e) => setS3Settings({ ...s3Settings, bucketName: e.target.value })}
                          className="h-9 text-sm max-w-md"
                        />
                      </div>
                    </div>
                  )}

                  {storageProvider === "cloudinary" && (
                    <div className="pt-4 border-t border-border/30 grid grid-cols-1 md:grid-cols-2 gap-4 animate-in fade-in slide-in-from-top-2">
                      <div className="space-y-1.5">
                        <Label className="text-[10px] uppercase font-bold text-muted-foreground">Cloud Name</Label>
                        <Input
                          value={cloudinarySettings.cloudName}
                          onChange={(e) => setCloudinarySettings({ ...cloudinarySettings, cloudName: e.target.value })}
                          className="h-9 text-sm"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-[10px] uppercase font-bold text-muted-foreground">API Key</Label>
                        <Input
                          value={cloudinarySettings.apiKey}
                          onChange={(e) => setCloudinarySettings({ ...cloudinarySettings, apiKey: e.target.value })}
                          className="h-9 text-sm"
                        />
                      </div>
                      <div className="space-y-1.5 md:col-span-2">
                        <Label className="text-[10px] uppercase font-bold text-muted-foreground">API Secret</Label>
                        <Input
                          type="password"
                          value={cloudinarySettings.apiSecret}
                          onChange={(e) => setCloudinarySettings({ ...cloudinarySettings, apiSecret: e.target.value })}
                          className="h-9 text-sm max-w-md"
                        />
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
              {canManage && (
                <CardFooter className="bg-muted/10 border-t border-border/40 py-2.5 px-5">
                  <Button
                    size="sm"
                    className="h-8 px-5 bg-primary hover:bg-primary/90 shadow-sm transition-all"
                    disabled={saveStorageSettingsMutation.isPending}
                    onClick={() => saveStorageSettingsMutation.mutate({
                      settings: {
                        provider: storageProvider,
                        customFolder,
                        s3: storageProvider === "s3" ? s3Settings : undefined,
                        cloudinary: storageProvider === "cloudinary" ? cloudinarySettings : undefined,
                      }
                    })}
                  >
                    {saveStorageSettingsMutation.isPending ? "Saving..." : <span className="flex items-center gap-2 text-xs font-semibold"><Save className="w-3 h-3" /> Save Storage Settings</span>}
                  </Button>
                </CardFooter>
              )}
            </Card>
          </div>
        )}

        {activeTab === "ai" && (
          <div className="space-y-8">
            <Card className="shadow-lg border-border">
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Sparkles className="w-5 h-5 text-primary" /> AI Assistant Settings</CardTitle>
                <CardDescription>
                  Configure the built-in AI chatbot and conversational tools.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {isLoadingAiSettings ? (
                  <div className="p-8 text-center text-muted-foreground italic">Loading AI settings...</div>
                ) : (
                  <form onSubmit={handleSubmitAi((v) => saveAiMutation.mutate(v))} className="space-y-6">
                    <div className="space-y-4">
                      <div className="grid w-full items-center gap-1.5">
                        <Label htmlFor="aiProvider">AI Provider</Label>
                        <Controller
                          name="provider"
                          control={controlAi}
                          render={({ field }) => (
                            <Select
                              value={field.value}
                              onValueChange={field.onChange}
                              disabled={!canManage}
                            >
                              <SelectTrigger id="aiProvider">
                                <SelectValue placeholder="Select Provider" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="system">System Default</SelectItem>
                                <SelectItem value="google">Google Gemini</SelectItem>
                                <SelectItem value="openai">OpenAI (Compatible)</SelectItem>
                                <SelectItem value="openrouter">OpenRouter</SelectItem>
                              </SelectContent>
                            </Select>
                          )}
                        />
                      </div>

                      {watchAiProvider !== "system" && (
                        <div className="space-y-4 pt-2 border-t border-border mt-4">
                          <div className="grid gap-1.5">
                            <Label htmlFor="aiApiKey">API Key</Label>
                            <Input
                              id="aiApiKey"
                              type="password"
                              placeholder="sk-..."
                              {...registerAi("apiKey")}
                              disabled={!canManage}
                            />
                            <p className="text-[10px] text-muted-foreground">Your key is stored securely and never exposed to the client in plain text.</p>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="grid gap-1.5">
                              <Label htmlFor="aiModel">Model Name</Label>
                              <Input
                                id="aiModel"
                                {...registerAi("model")}
                                placeholder="Enter model name..."
                                disabled={!canManage}
                              />
                            </div>
                            {(watchAiProvider === "openai" || watchAiProvider === "openrouter") && (
                              <div className="grid gap-1.5">
                                <Label htmlFor="aiBaseUrl">Base URL (Optional)</Label>
                                <Input
                                  id="aiBaseUrl"
                                  {...registerAi("baseUrl")}
                                  placeholder={watchAiProvider === "openrouter" ? "https://openrouter.ai/api/v1" : "https://api.openai.com/v1"}
                                  disabled={!canManage}
                                />
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {watchAiProvider === "system" && (
                        <div className="p-3 sm:p-4 rounded-lg bg-primary/5 border border-primary/10 flex items-start gap-2 sm:gap-3">
                          <Bot className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                          <div>
                            <p className="text-sm font-semibold text-primary">System Default Active</p>
                            <p className="text-xs text-muted-foreground leading-relaxed mt-1">
                              Using the system-wide configuration. Individual organizations can bring their own keys to unlock higher rate limits and specific models.
                            </p>
                          </div>
                        </div>
                      )}

                      <div className="space-y-4 pt-6 mt-6 border-t border-border/60">
                        <div className="flex items-center gap-2 mb-2">
                          <Bot className="w-5 h-5 text-primary" />
                          <div>
                            <h3 className="text-sm font-semibold">Identity & Personality</h3>
                            <p className="text-[10px] text-muted-foreground">Standardized using AIEOS (AI Entity Object Specification)</p>
                          </div>
                        </div>
                        <div className="grid gap-1.5">
                          <div className="flex items-center justify-between">
                            <Label htmlFor="aiPersonality" className="text-xs font-bold uppercase tracking-tight text-muted-foreground/80">Soul (AIEOS Document)</Label>
                            <span className="text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded-full font-mono">INTEGRATED OVERLAY</span>
                          </div>
                          <Textarea
                            id="aiPersonality"
                            {...registerAi("personality")}
                            placeholder="Optional. Define specific traits, identity, or tone (e.g. 'Highly formal, speaks in third-person, emphasizes audit trails')."
                            className="min-h-[120px] text-sm resize-none"
                            disabled={!canManage}
                          />
                          <p className="text-[10px] text-muted-foreground leading-relaxed">
                            This personality will be layered over the default world-class financial expert behavior. If empty, the assistant defaults to standard professional conduct.
                          </p>
                        </div>
                      </div>
                    </div>

                    {canManage && (
                      <CardFooter className="bg-muted/10 border-t border-border/40 py-2.5 px-5">
                        <Button type="submit" size="sm" disabled={saveAiMutation.isPending} className="h-8 px-5 bg-primary hover:bg-primary/90 shadow-sm transition-all">
                          {saveAiMutation.isPending ? (
                            <>
                              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                              Saving...
                            </>
                          ) : (
                            <>
                              <Save className="w-3 h-4 mr-2" />
                              Save AI Settings
                            </>
                          )}
                        </Button>
                      </CardFooter>
                    )}
                  </form>
                )}
              </CardContent>
            </Card>

            <Card className="border-destructive/20 bg-destructive/[0.02]">
              <CardHeader>
                <CardTitle className="text-destructive flex items-center gap-2 truncate"><Trash2 className="w-5 h-5" /> Danger Zone</CardTitle>
                <CardDescription>
                  Actions here are irreversible. Manage your organization's data with care.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 rounded-xl border border-destructive/20 bg-background">
                  <div>
                    <p className="font-bold text-foreground">Clear Chat History</p>
                    <p className="text-xs text-muted-foreground">Permanently delete all AI conversation history for this organization.</p>
                  </div>
                  <Button
                    variant="destructive"
                    size="sm"
                    disabled={!isOwner}
                    onClick={() => {
                      setConfirmConfig({
                        open: true,
                        title: "Clear All Chat History",
                        description: "This will permanently delete all messages and tool execution logs for all users in this organization. This action cannot be undone.",
                        variant: "destructive",
                        onConfirm: async () => {
                          const res = await fetch(`/api/ai/history?orgId=${activeOrganizationId}`, { method: "DELETE" });
                          if (res.ok) {
                            toast.success("Chat history cleared. AI will start fresh on next message.");
                            queryClient.invalidateQueries({ queryKey: ["chat-history", activeOrganizationId] });
                          } else {
                            toast.error(await res.text());
                          }
                        }
                      });
                    }}
                  >
                    Clear History
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {activeTab === "data" && (
          <div className="space-y-8">
            <div className="grid gap-8">
              <Card className="shadow-sm border-border/40 overflow-hidden bg-card/50 backdrop-blur-sm">
                <CardHeader className="pb-2 pt-4 px-5">
                  <div className="flex items-center gap-2 text-primary mb-1">
                    <FileSpreadsheet className="w-5 h-5" />
                    <span className="text-[10px] font-bold uppercase tracking-widest opacity-80">Interoperability</span>
                  </div>
                  <CardTitle className="text-lg">CSV Data Management</CardTitle>
                  <CardDescription className="text-xs text-muted-foreground">
                    Export your ledger to Excel or import from other tools.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6 px-5 pb-5">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-4 p-4 bg-muted/50 rounded-xl border border-border/50">
                      <div>
                        <h4 className="font-semibold text-sm flex items-center gap-2">
                          <Upload className="w-4 h-4 text-muted-foreground" />
                          Import from CSV
                        </h4>
                        <p className="text-xs text-muted-foreground mt-1">Upload your ledger entries from a formatted CSV file.</p>
                      </div>
                      <div className="flex flex-col gap-2">
                        <Input
                          type="file"
                          id="csv-upload"
                          className="hidden"
                          accept=".csv"
                          onChange={async (e) => {
                            const file = e.target.files?.[0];
                            if (!file) return;
                            setIsImportingCsv(true);
                            const reader = new FileReader();
                            reader.onload = async (evt) => {
                              const csvContent = evt.target?.result as string;
                              try {
                                const records = parseCSV(csvContent);
                                if (records.length === 0) {
                                  toast.error("No records found in CSV.");
                                  return;
                                }
                                toast.info(`Parsing ${records.length} records...`);
                                const accountNames = Array.from(new Set(records.flatMap((r: any) => [r["From (Source)"], r["To (Destination)"]]).filter(Boolean)));
                                await fetch("/api/admin/ensure-accounts", {
                                  method: "POST",
                                  headers: { "Content-Type": "application/json" },
                                  body: JSON.stringify({ accountNames })
                                });
                                for (let i = 0; i < records.length; i++) {
                                  await fetch("/api/admin/import-entry", {
                                    method: "POST",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({
                                      date: records[i]["Date"],
                                      description: records[i]["Description"],
                                      amount: records[i]["Amount"],
                                      from: records[i]["From (Source)"],
                                      to: records[i]["To (Destination)"],
                                      notes: records[i]["Notes"]
                                    })
                                  });
                                }
                                toast.success("CSV Import complete!");
                                setTimeout(() => window.location.reload(), 1000);
                              } catch (err: any) {
                                toast.error(`Import error: ${err.message}`);
                              } finally {
                                setIsImportingCsv(false);
                              }
                            };
                            reader.readAsText(file);
                          }}
                        />
                        <Button
                          variant="outline"
                          className="w-full justify-start h-12"
                          disabled={isImportingCsv}
                          onClick={() => document.getElementById("csv-upload")?.click()}
                        >
                          {isImportingCsv ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
                          {isImportingCsv ? "Importing..." : "Choose CSV File"}
                        </Button>
                        <a href="/sample-journals.csv" download className="text-[10px] text-primary hover:underline flex items-center gap-1 font-medium pl-1">
                          <Download className="w-3 h-3" /> Download Sample Template
                        </a>
                      </div>
                    </div>

                    <div className="space-y-4 p-4 bg-muted/50 rounded-xl border border-border/50">
                      <div>
                        <h4 className="font-semibold text-sm flex items-center gap-2">
                          <Download className="w-4 h-4 text-muted-foreground" />
                          Export to CSV
                        </h4>
                        <p className="text-xs text-muted-foreground mt-1">Download entries in a spreadsheet-compatible format.</p>
                      </div>
                      <Button
                        variant="outline"
                        className="w-full justify-start h-12"
                        disabled={isExportingCsv}
                        onClick={async () => {
                          try {
                            setIsExportingCsv(true);
                            const res = await fetch("/api/admin/export?format=csv", {
                              headers: { "x-org-id": activeOrganizationId! }
                            });
                            if (!res.ok) throw new Error("Export failed");
                            const blob = await res.blob();
                            const url = URL.createObjectURL(blob);
                            const a = document.createElement("a");
                            a.href = url;
                            a.download = `ledger-export-${activeOrg?.name || "org"}-${new Date().toISOString().split('T')[0]}.csv`;
                            document.body.appendChild(a);
                            a.click();
                            document.body.removeChild(a);
                            URL.revokeObjectURL(url);
                            toast.success("CSV Downloaded!");
                          } catch (err: any) {
                            toast.error(`Export failed: ${err.message}`);
                          } finally {
                            setIsExportingCsv(false);
                          }
                        }}
                      >
                        {isExportingCsv ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <FileSpreadsheet className="w-4 h-4 mr-2" />}
                        {isExportingCsv ? "Generating..." : "Download CSV Spreadsheet"}
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="shadow-sm border-border/40 overflow-hidden bg-card/50 backdrop-blur-sm">
                <CardHeader className="pb-2 pt-4 px-5">
                  <div className="flex items-center gap-2 text-primary mb-1">
                    <FileJson className="w-5 h-5" />
                    <span className="text-[10px] font-bold uppercase tracking-widest opacity-80">Backups & Migration</span>
                  </div>
                  <CardTitle className="text-lg">JSON Data Management</CardTitle>
                  <CardDescription className="text-xs text-muted-foreground">
                    Lossless backups for secure archival or organization transfer.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6 px-5 pb-5">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-4 p-4 bg-muted/50 rounded-xl border border-border/50">
                      <div>
                        <h4 className="font-semibold text-sm flex items-center gap-2 text-foreground">
                          <RotateCcw className="w-4 h-4 text-primary" />
                          Restore JSON Backup
                        </h4>
                        <p className="text-xs text-muted-foreground mt-1">Reconstruct your accounts and history from a JSON file.</p>
                        <div className="mt-3 p-3 bg-destructive/10 border border-destructive/20 rounded-lg flex items-start gap-2">
                          <AlertCircle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
                          <p className="text-xs text-destructive/80 font-medium leading-relaxed">
                            Warning: Importing data via JSON will wipe out everything including activity logs, except the organization itself.
                          </p>
                        </div>
                      </div>
                      <Input
                        type="file"
                        id="json-import"
                        className="hidden"
                        accept=".json"
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          setIsImportingJson(true);
                          const reader = new FileReader();
                          reader.onload = async (evt) => {
                            try {
                              const data = JSON.parse(evt.target?.result as string);
                              const res = await fetch("/api/admin/import", {
                                method: "POST",
                                headers: { "Content-Type": "application/json", "x-org-id": activeOrganizationId! },
                                body: JSON.stringify(data)
                              });
                              if (!res.ok) throw new Error("Restore failed");
                              const result = await res.json();
                              toast.success(result.message);
                              setTimeout(() => window.location.reload(), 1000);
                            } catch (err: any) {
                              toast.error(`Restore failed: ${err.message}`);
                            } finally {
                              setIsImportingJson(false);
                              if (document.getElementById("json-import")) {
                                (document.getElementById("json-import") as HTMLInputElement).value = '';
                              }
                            }
                          };
                          reader.readAsText(file);
                        }}
                      />
                      <Button
                        variant="secondary"
                        className="w-full justify-start h-12 bg-card border-warning/20 text-warning hover:bg-destructive/10 hover:border-destructive/30 hover:text-destructive transition-colors"
                        disabled={isImportingJson}
                        onClick={() => {
                          setConfirmConfig({
                            open: true,
                            title: "Destructive Action",
                            description: "Importing data via JSON will wipe out everything including activity logs, except the organization itself. Are you sure you want to proceed?",
                            variant: "destructive",
                            onConfirm: () => document.getElementById("json-import")?.click(),
                          });
                        }}
                      >
                        {isImportingJson ? <Loader2 className="w-4 h-4 mr-2 animate-spin text-primary" /> : <Upload className="w-4 h-4 mr-2" />}
                        {isImportingJson ? "Restoring..." : "Restore from JSON File"}
                      </Button>
                    </div>

                    <div className="space-y-4 p-4 bg-muted/50 rounded-xl border border-border/50">
                      <div>
                        <h4 className="font-semibold text-sm flex items-center gap-2 text-foreground">
                          <Download className="w-4 h-4 text-primary" />
                          Generate JSON Backup
                        </h4>
                        <p className="text-xs text-muted-foreground mt-1">Export a complete, structured snapshot of your ledger.</p>
                      </div>
                      <Button
                        variant="outline"
                        className="w-full justify-start h-12 bg-card border-border hover:bg-accent"
                        disabled={isExportingJson}
                        onClick={async () => {
                          try {
                            setIsExportingJson(true);
                            const res = await fetch("/api/admin/export?format=json", {
                              headers: { "x-org-id": activeOrganizationId! }
                            });
                            const data = await res.json();
                            const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
                            const url = URL.createObjectURL(blob);
                            const a = document.createElement("a");
                            a.href = url;
                            a.download = `ledger-backup-${activeOrg?.name || "org"}-${new Date().toISOString().split('T')[0]}.json`;
                            document.body.appendChild(a);
                            a.click();
                            document.body.removeChild(a);
                            URL.revokeObjectURL(url);
                            toast.success("Full Backup Generated!");
                          } catch (err: any) {
                            toast.error(`Backup failed: ${err.message}`);
                          } finally {
                            setIsExportingJson(false);
                          }
                        }}
                      >
                        {isExportingJson ? <Loader2 className="w-4 h-4 mr-2 animate-spin text-primary" /> : <FileJson className="w-4 h-4 mr-2 text-primary" />}
                        {isExportingJson ? "Generating..." : "Download Complete Backup"}
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="shadow-sm border-destructive/20 overflow-hidden bg-destructive/5">
                <CardHeader className="pb-2 pt-4 px-5 text-destructive">
                  <div className="flex items-center gap-2 mb-1">
                    <AlertCircle className="w-5 h-5" />
                    <span className="text-[10px] font-bold uppercase tracking-widest opacity-80">Danger Zone</span>
                  </div>
                  <CardTitle className="text-lg">Ledger Erasure</CardTitle>
                  <CardDescription className="text-xs text-destructive/70">Permanently clear all ledger data. This action is non-reversible.</CardDescription>
                </CardHeader>
                <CardFooter className="bg-destructive/10 border-t border-destructive/20 py-3 px-5">
                  <Button
                    variant="destructive"
                    className="h-12 px-8"
                    onClick={() => {
                      setConfirmConfig({
                        open: true,
                        title: "Clear All Ledger Data",
                        description: "This will permanently delete all accounts and journal entries in this organization. This cannot be undone.",
                        variant: "destructive",
                        onConfirm: async () => {
                          try {
                            const res = await fetch("/api/admin/clear-data", { method: "POST" });
                            if (res.ok) {
                              toast.success("Data cleared successfully.");
                              setTimeout(() => window.location.reload(), 1000);
                            } else {
                              const error = await res.json();
                              toast.error(`Error: ${error.error}`);
                            }
                          } catch (err) {
                            toast.error("An unexpected error occurred.");
                          }
                        },
                      });
                    }}
                  >
                    Clear All Data
                  </Button>
                </CardFooter>
              </Card>
            </div>
          </div>
        )}
      </div>

      {confirmConfig && (
        <AlertDialog
          open={confirmConfig.open}
          onOpenChange={(open) => !open && setConfirmConfig(null)}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{confirmConfig.title}</AlertDialogTitle>
              <AlertDialogDescription>{confirmConfig.description}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                variant={confirmConfig.variant || "default"}
                onClick={() => {
                  confirmConfig.onConfirm();
                  setConfirmConfig(null);
                }}
              >
                Continue
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </main>
  );
}

