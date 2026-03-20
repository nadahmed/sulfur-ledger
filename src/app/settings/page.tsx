"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@auth0/nextjs-auth0/client";
import { useOrganization } from "@/context/OrganizationContext";
import { toast } from "sonner";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertCircle, Save, UserPlus, Shield, Mail, Trash2, Loader2, Key, Copy, Check, RotateCcw } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
  OrganizationSchema, 
  OrganizationFormValues, 
  InvitationSchema, 
  InvitationFormValues, 
  EmailSettingsSchema, 
  EmailSettingsFormValues,
  McpSettingsFormValues,
  McpSettingsSchema
} from "@/lib/schemas";

const parseCSVLine = (line: string) => {
  const result = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"' && line[i+1] === '"') {
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
  const queryClient = useQueryClient();

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
  const isLoading = isUserLoading || isOrgLoading;

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

  const { data: mcpSettings, isLoading: isLoadingMcpSettings } = useQuery<McpSettingsFormValues>({
    queryKey: ["mcp-settings", activeOrganizationId],
    queryFn: async () => {
      const res = await fetch(`/api/organizations/mcp-settings?orgId=${activeOrganizationId}`);
      if (!res.ok) throw new Error("Failed to fetch MCP settings");
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
      router.push("/onboarding");
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
    mutationFn: async (values: OrganizationFormValues) => {
      const res = await fetch("/api/organizations", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: activeOrganizationId, name: values.name }),
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
      router.push("/onboarding");
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

  const generateMcpKeyMutation = useMutation({
    mutationFn: async (ttlDays: string) => {
      const res = await fetch("/api/organizations/mcp-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orgId: activeOrganizationId, ttlDays }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Failed to generate key");
      return res.json();
    },
    onSuccess: () => {
      toast.success("MCP API Key generated!");
      queryClient.invalidateQueries({ queryKey: ["mcp-settings"] });
    },
    onError: (err: any) => toast.error(err.message),
  });

  const deleteMcpKeyMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/organizations/mcp-settings?orgId=${activeOrganizationId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error((await res.json()).error || "Failed to delete key");
    },
    onSuccess: () => {
      toast.success("MCP API Key deleted!");
      queryClient.invalidateQueries({ queryKey: ["mcp-settings"] });
    },
    onError: (err: any) => toast.error(err.message),
  });

  const {
    register: registerOrg,
    handleSubmit: handleSubmitOrg,
    formState: { isDirty: isOrgDirty },
    setValue: setOrgValue,
  } = useForm<OrganizationFormValues>({
    resolver: zodResolver(OrganizationSchema),
    defaultValues: { name: activeOrg?.name || "" },
  });

  useEffect(() => {
    if (activeOrg) setOrgValue("name", activeOrg.name);
  }, [activeOrg, setOrgValue]);

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
    defaultValues: emailSettings || { provider: "none", senderEmail: "", senderName: "Sulfur Ledger" },
  });

  const {
    handleSubmit: handleSubmitMcp,
    control: controlMcp,
    watch: watchMcp,
  } = useForm<McpSettingsFormValues>({
    resolver: zodResolver(McpSettingsSchema),
    defaultValues: { ttlDays: "30" },
  });

  const watchMcpTtl = watchMcp("ttlDays");
  const [copied, setCopied] = useState(false);

  const watchProvider = watchEmail("provider");

  useEffect(() => {
    if (emailSettings) {
      Object.entries(emailSettings).forEach(([key, value]) => {
        setEmailValue(key as any, value);
      });
    }
  }, [emailSettings, setEmailValue]);

  if (isLoading) return <div className="p-8 text-center text-neutral-500">Loading settings...</div>;

  if (!activeOrganizationId) {
    return <div className="p-8 text-center">Redirecting to setup...</div>;
  }

  return (
    <main className="max-w-screen-2xl p-4 md:p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Settings</h1>
      </div>

      <Tabs defaultValue="general" className="mt-8">
        <TabsList className="mb-8">
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="members">Members</TabsTrigger>
          <TabsTrigger value="email">Email Delivery</TabsTrigger>
          <TabsTrigger value="mcp">MCP Server</TabsTrigger>
          <TabsTrigger value="data">Data Management</TabsTrigger>
        </TabsList>

        <TabsContent value="general" className="space-y-8 mt-6">
          <Card className="shadow-lg border-neutral-200">
            <form onSubmit={handleSubmitOrg((v) => updateOrgMutation.mutate(v))}>
              <CardHeader>
                <CardTitle>Organization Details</CardTitle>
                <CardDescription>Manage your organization's general information.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="org-name">Organization Name</Label>
                  <Input
                    id="org-name"
                    {...registerOrg("name")}
                    disabled={!canManage}
                  />
                </div>
              </CardContent>
              {canManage && (
                <CardFooter className="bg-neutral-50 border-t border-neutral-100 rounded-b-lg">
                  <Button type="submit" disabled={updateOrgMutation.isPending || !isOrgDirty}>
                    {updateOrgMutation.isPending ? "Saving..." : <span className="flex items-center gap-2"><Save className="w-4 h-4" /> Save Changes</span>}
                  </Button>
                </CardFooter>
              )}
            </form>
          </Card>

          {!isOwner && (
            <Card className="shadow-lg border-neutral-200">
              <CardHeader>
                <CardTitle className="text-amber-600 flex items-center gap-2">Leave Organization</CardTitle>
                <CardDescription>You will lose access to this organization and all its data.</CardDescription>
              </CardHeader>
              <CardFooter className="bg-amber-50 border-t border-amber-100 rounded-b-lg">
                <Button 
                  variant="outline" 
                  className="border-amber-200 text-amber-700 hover:bg-amber-100"
                  onClick={() => {
                    setConfirmConfig({
                      open: true,
                      title: "Leave Organization",
                      description: "Are you sure you want to leave this organization? You will lose access to all its data.",
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
            <Card className="shadow-lg border-red-200">
              <CardHeader>
                <CardTitle className="text-red-600 flex items-center gap-2"><AlertCircle className="w-5 h-5" /> Danger Zone</CardTitle>
                <CardDescription>Permanently delete this organization and everything in it.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-neutral-600">Please type <strong>"{activeOrg?.name}"</strong> to confirm.</p>
                <Input
                  value={deleteConfirm}
                  onChange={(e) => setDeleteConfirm(e.target.value)}
                  placeholder="Type name to confirm"
                  className="max-w-md border-red-200"
                />
              </CardContent>
              <CardFooter className="bg-red-50 border-t border-red-100 rounded-b-lg">
                <Button 
                  variant="destructive" 
                  disabled={deleteOrgMutation.isPending || deleteConfirm !== activeOrg?.name} 
                  onClick={() => deleteOrgMutation.mutate()}
                >
                  {deleteOrgMutation.isPending ? "Deleting..." : <span className="flex items-center gap-2"><Trash2 className="w-4 h-4" /> Delete Organization</span>}
                </Button>
              </CardFooter>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="members" className="space-y-8 mt-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            <Card className="bg-neutral-50/50">
              <CardHeader>
                <CardTitle className="text-sm font-medium">Owner</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-4">
                  <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-bold">
                    {members?.find((m: any) => m.role === "owner")?.name?.[0] || "O"}
                  </div>
                  <div>
                    <p className="font-medium">{members?.find((m: any) => m.role === "owner")?.name || "N/A"}</p>
                    <p className="text-xs text-muted-foreground">{members?.find((m: any) => m.role === "owner")?.email || ""}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-neutral-50/50">
              <CardHeader>
                <CardTitle className="text-sm font-medium">Organization ID</CardTitle>
              </CardHeader>
              <CardContent>
                <code className="text-xs break-all text-neutral-500">{activeOrganizationId}</code>
              </CardContent>
            </Card>

            <Card className="bg-neutral-50/50 md:col-span-2 lg:col-span-1">
              <CardHeader>
                <CardTitle className="text-sm font-medium">Created On</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-neutral-600">
                  {new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}
                </p>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="md:col-span-1 space-y-8">
              <Card>
                <CardHeader><CardTitle className="flex items-center gap-2"><UserPlus className="w-5 h-5" /> Invite Member</CardTitle>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleSubmitInvite((v) => inviteMutation.mutate(v))} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="email">Email Address</Label>
                      <Input 
                        id="email" 
                        type="email" 
                        placeholder="colleague@example.com" 
                        {...registerInvite("email")}
                        disabled={!canManage}
                        className={inviteErrors.email ? "border-red-500" : ""}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="role">Role</Label>
                      <Controller
                        name="role"
                        control={controlInvite}
                        render={({ field }) => (
                          <Select value={field.value} onValueChange={field.onChange} disabled={!canManage}>
                            <SelectTrigger id="role"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="viewer">Viewer</SelectItem>
                              <SelectItem value="member">Editor</SelectItem>
                              <SelectItem value="admin">Admin</SelectItem>
                            </SelectContent>
                          </Select>
                        )}
                      />
                    </div>
                    <Button className="w-full" type="submit" disabled={!canManage || inviteMutation.isPending}>
                      {inviteMutation.isPending ? "Sending..." : "Send Invitation"}
                    </Button>
                  </form>
                </CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle>Pending Invitations</CardTitle></CardHeader>
                <CardContent>
                  {isLoadingInvites ? (
                    <p className="text-sm text-neutral-500 italic">Loading invitations...</p>
                  ) : pendingInvites.length === 0 ? (
                    <p className="text-sm text-neutral-500 italic">No pending invitations.</p>
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
                          <div key={invite.email} className="flex items-center justify-between p-3 bg-neutral-50 rounded-lg border border-neutral-100">
                            <div className="flex-1 min-w-0 pr-4">
                              <p className="text-sm font-medium truncate">{invite.email}</p>
                              <div className="flex items-center gap-3 mt-1">
                                <p className="text-xs text-neutral-500 flex items-center gap-1 capitalize">
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
                                  className="h-8 w-8 text-neutral-400 hover:text-red-600"
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
              <Card className="h-full shadow-lg">
                <CardHeader>
                  <CardTitle>Active Members</CardTitle>
                  <CardDescription>Manage the people who have access to this organization.</CardDescription>
                </CardHeader>
                <CardContent>
                  {isLoadingMembers ? (
                    <div className="flex items-center justify-center p-8 text-neutral-500 italic">
                      <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading members...
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {members.map((m: any) => {
                        const isSelf = m.userId === user?.sub;
                        return (
                          <div key={m.userId} className="flex items-center justify-between p-4 bg-neutral-50 hover:bg-neutral-100/50 rounded-xl border border-neutral-100 transition-colors">
                            <div className="flex items-center gap-4">
                              {m.userPicture ? (
                                <img 
                                  src={m.userPicture} 
                                  alt={m.userName || "User"} 
                                  className="w-10 h-10 rounded-full border border-neutral-200"
                                />
                              ) : (
                                <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-bold text-lg">
                                  {(m.userName || m.userEmail || "U").charAt(0).toUpperCase()}
                                </div>
                              )}
                              <div>
                                <p className="font-semibold text-neutral-800 flex items-center gap-2">
                                  {m.userName || `User ${m.userId.slice(-6)}`}
                                  {isSelf && <span className="text-[10px] bg-blue-100 text-blue-600 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">You</span>}
                                </p>
                                <div className="flex flex-col gap-0.5">
                                  {m.userEmail && <p className="text-xs text-neutral-500 font-medium">{m.userEmail}</p>}
                                  <div className="flex items-center gap-1 mt-0.5">
                                    <Shield className="w-3 h-3 text-neutral-400" />
                                    {m.isOwner ? (
                                      <span className="text-xs text-neutral-500 capitalize underline decoration-dotted underline-offset-2 decoration-blue-500/50">Owner</span>
                                    ) : (
                                      <Select
                                        value={m.role}
                                        onValueChange={(newRole) => updateRoleMutation.mutate({ userId: m.userId, role: newRole })}
                                        disabled={!canManage || isSelf || updateRoleMutation.isPending}
                                      >
                                        <SelectTrigger className="h-6 w-auto border-none bg-transparent p-0 text-xs font-medium capitalize focus:ring-0">
                                          <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                          <SelectItem value="admin">Admin</SelectItem>
                                          <SelectItem value="member">Member</SelectItem>
                                          <SelectItem value="viewer">Viewer</SelectItem>
                                        </SelectContent>
                                      </Select>
                                    )}
                                    {updateRoleMutation.isPending && updateRoleMutation.variables?.userId === m.userId && (
                                      <Loader2 className="w-3 h-3 animate-spin text-blue-500" />
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
                                  className="text-red-500 hover:bg-red-50 hover:text-red-600 transition-colors"
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
                                  className="text-amber-600 hover:bg-amber-50 hover:text-amber-700 transition-colors"
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
        </TabsContent>

        <TabsContent value="email" className="space-y-8 mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Mail className="w-5 h-5" /> Email Delivery</CardTitle>
              <CardDescription>Configure how this organization sends emails.</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoadingEmailSettings ? (
                <div className="p-8 text-center text-neutral-500 italic">Loading email settings...</div>
              ) : (
                <form onSubmit={handleSubmitEmail((v) => saveEmailMutation.mutate(v))} className="space-y-6">
                  <div className="space-y-4">
                    <div className="grid w-full items-center gap-1.5">
                      <Label htmlFor="provider">Email Provider</Label>
                      <Controller
                        name="provider"
                        control={controlEmail}
                        render={({ field }) => (
                          <Select 
                            value={field.value} 
                            onValueChange={field.onChange}
                            disabled={!canManage}
                          >
                            <SelectTrigger id="provider"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">None (Disabled)</SelectItem>
                              <SelectItem value="brevo">Brevo (API)</SelectItem>
                              <SelectItem value="smtp">Custom SMTP</SelectItem>
                            </SelectContent>
                          </Select>
                        )}
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="grid gap-1.5">
                        <Label htmlFor="senderName">Sender Name</Label>
                        <Input 
                          id="senderName" 
                          {...registerEmail("senderName")}
                          disabled={!canManage}
                        />
                      </div>
                      <div className="grid gap-1.5">
                        <Label htmlFor="senderEmail">Sender Email</Label>
                        <Input 
                          id="senderEmail" 
                          type="email"
                          {...registerEmail("senderEmail")}
                          disabled={!canManage}
                        />
                      </div>
                    </div>

                    {watchProvider === "brevo" && (
                      <div className="space-y-1.5">
                        <Label htmlFor="apiKey">Brevo API Key</Label>
                        <Input 
                          id="apiKey" 
                          type="password"
                          placeholder="xkeysib-..."
                          {...registerEmail("apiKey")}
                          disabled={!canManage}
                        />
                      </div>
                    )}

                    {watchProvider === "smtp" && (
                      <div className="space-y-4">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div className="grid gap-1.5">
                            <Label htmlFor="smtpHost">SMTP Host</Label>
                            <Input id="smtpHost" {...registerEmail("smtpHost")} placeholder="smtp.example.com" />
                          </div>
                          <div className="grid gap-1.5">
                            <Label htmlFor="smtpPort">Port</Label>
                            <Input id="smtpPort" type="number" {...registerEmail("smtpPort", { valueAsNumber: true })} placeholder="587" />
                          </div>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div className="grid gap-1.5">
                            <Label htmlFor="smtpUser">Username</Label>
                            <Input id="smtpUser" {...registerEmail("smtpUser")} disabled={!canManage} />
                          </div>
                          <div className="grid gap-1.5">
                            <Label htmlFor="smtpPass">Password</Label>
                            <Input id="smtpPass" type="password" {...registerEmail("smtpPass")} disabled={!canManage} />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {canManage && (
                    <div className="flex gap-4">
                      <Button type="submit" disabled={saveEmailMutation.isPending || testEmailMutation.isPending}>
                        {saveEmailMutation.isPending ? "Saving..." : "Save Email Settings"}
                      </Button>
                      <Button 
                        type="button" 
                        variant="secondary" 
                        onClick={handleSubmitEmail((v) => testEmailMutation.mutate(v))}
                        disabled={saveEmailMutation.isPending || testEmailMutation.isPending || watchProvider === "none"}
                      >
                        {testEmailMutation.isPending ? "Sending..." : "Send Test Email"}
                      </Button>
                    </div>
                  )}
                </form>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="mcp" className="space-y-8 mt-6">
          <Card className="shadow-lg border-neutral-200">
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Key className="w-5 h-5" /> MCP Server Integration</CardTitle>
              <CardDescription>
                Expose your ledger tools to AI agents using the Model Context Protocol (MCP).
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {isLoadingMcpSettings ? (
                <div className="p-8 text-center text-neutral-500 italic">Loading MCP settings...</div>
              ) : mcpSettings?.mcpApiKey ? (
                <div className="space-y-6">
                  <div className="p-4 bg-blue-50 border border-blue-100 rounded-lg">
                    <h3 className="text-sm font-semibold text-blue-900 mb-2">Your MCP API Key</h3>
                    <div className="flex items-center gap-2">
                      <Input 
                        value={mcpSettings.mcpApiKey} 
                        readOnly 
                        type="password"
                        className="bg-white font-mono text-xs"
                      />
                      <Button 
                        size="icon" 
                        variant="outline" 
                        className="shrink-0"
                        onClick={() => {
                          navigator.clipboard.writeText(mcpSettings.mcpApiKey!);
                          setCopied(true);
                          setTimeout(() => setCopied(false), 2000);
                          toast.success("API Key copied to clipboard");
                        }}
                      >
                        {copied ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
                      </Button>
                    </div>
                    {mcpSettings.mcpApiKeyExpiresAt && (
                      <p className="text-xs text-blue-700 mt-2">
                        Expires on: {new Date(mcpSettings.mcpApiKeyExpiresAt).toLocaleDateString()}
                      </p>
                    )}
                  </div>

                  <div className="space-y-3">
                    <Label>Claude Desktop Configuration</Label>
                    <div className="relative">
                      <pre className="p-4 bg-neutral-900 text-neutral-100 rounded-lg text-xs overflow-x-auto">
{`{
  "mcpServers": {
    "sulfur-ledger": {
      "command": "npx",
      "args": ["-y", "-p", "@thefoot/mcp-stdio-http-bridge", "mcp-bridge", "--url", "${typeof window !== 'undefined' ? window.location.origin : ''}/api/mcp"],
      "env": {
        "x-mcp-key": "${mcpSettings.mcpApiKey}"
      }
    }
  }
}`}
                      </pre>
                      <Button 
                        size="sm" 
                        variant="secondary" 
                        className="absolute top-2 right-2 h-7 text-[10px]"
                        onClick={() => {
                          const config = {
                            mcpServers: {
                              "sulfur-ledger": {
                                command: "npx",
                                args: ["-y", "-p", "@thefoot/mcp-stdio-http-bridge", "mcp-bridge", "--url", `${window.location.origin}/api/mcp`],
                                env: {
                                  "x-mcp-key": mcpSettings.mcpApiKey
                                }
                              }
                            }
                          };
                          navigator.clipboard.writeText(JSON.stringify(config, null, 2));
                          toast.success("Configuration copied!");
                        }}
                      >
                        Copy JSON
                      </Button>
                    </div>
                    <p className="text-xs text-neutral-500">
                      Add this snippet to your <code>claude_desktop_config.json</code> to enable AI access to this organization's data.
                    </p>
                  </div>

                  {canManage && (
                    <div className="pt-4 border-t flex items-center justify-between">
                      <p className="text-sm text-neutral-600">Need a new key? Regenerating will invalidate the current one.</p>
                      <div className="flex gap-2">
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => {
                            setConfirmConfig({
                              open: true,
                              title: "Revoke MCP Key",
                              description: "This will immediately disable AI access for this organization. Are you sure?",
                              variant: "destructive",
                              onConfirm: () => deleteMcpKeyMutation.mutate(),
                            });
                          }}
                        >
                          <Trash2 className="w-4 h-4 mr-2" /> Revoke
                        </Button>
                        <Button 
                          variant="secondary" 
                          size="sm"
                          onClick={() => generateMcpKeyMutation.mutate(watchMcpTtl || "30")}
                        >
                          <RotateCcw className="w-4 h-4 mr-2" /> Regenerate
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="py-12 flex flex-col items-center justify-center text-center space-y-6">
                  <div className="w-16 h-16 bg-neutral-100 rounded-full flex items-center justify-center">
                    <Key className="w-8 h-8 text-neutral-400" />
                  </div>
                  <div className="max-w-md">
                    <h3 className="text-lg font-semibold">No MCP Key Generated</h3>
                    <p className="text-neutral-500 text-sm mt-2">
                      Enable AI tools for this organization. Generate a secure API key to connect Claude or other MCP-compatible agents.
                    </p>
                  </div>
                  {canManage && (
                    <div className="flex flex-col items-center gap-4 w-full max-w-xs">
                      <div className="w-full text-left space-y-2">
                        <Label>Key Expiration (TTL)</Label>
                        <Controller
                          name="ttlDays"
                          control={controlMcp}
                          render={({ field }) => (
                            <Select value={field.value} onValueChange={field.onChange}>
                              <SelectTrigger><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="30">30 Days</SelectItem>
                                <SelectItem value="60">60 Days</SelectItem>
                                <SelectItem value="90">90 Days</SelectItem>
                                <SelectItem value="never">Never Expires</SelectItem>
                              </SelectContent>
                            </Select>
                          )}
                        />
                      </div>
                      <Button 
                        className="w-full" 
                        onClick={() => generateMcpKeyMutation.mutate(watchMcpTtl || "30")}
                        disabled={generateMcpKeyMutation.isPending}
                      >
                        {generateMcpKeyMutation.isPending ? "Generating..." : "Generate MCP API Key"}
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="data" className="space-y-8 mt-6">
          <Card className="shadow-lg border-neutral-200">
            <CardHeader>
              <CardTitle>Import & Export</CardTitle>
              <CardDescription>Import journal entries from a CSV file or download a sample template.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex flex-wrap gap-4">
                <div className="relative">
                  <input
                    type="file"
                    id="csv-upload"
                    className="hidden"
                    accept=".csv"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;

                      const reader = new FileReader();
                      reader.onload = async (evt) => {
                        const csvContent = evt.target?.result as string;
                        try {
                          const records = parseCSV(csvContent);
                          if (records.length === 0) {
                            toast.error("No records found in CSV.");
                            return;
                          }

                          toast.info("Importing entries...");

                          const accountNames = Array.from(new Set(records.flatMap((r: any) => [r["From (Source)"], r["To (Destination)"]]).filter(Boolean)));
                          await fetch("/api/admin/ensure-accounts", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ accountNames })
                          });

                          for (let i = 0; i < records.length; i++) {
                            const record = records[i];
                            const res = await fetch("/api/admin/import-entry", {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({
                                date: record["Date"],
                                description: record["Description"],
                                amount: record["Amount"],
                                from: record["From (Source)"],
                                to: record["To (Destination)"],
                                notes: record["Notes"]
                              })
                            });

                            if (!res.ok) {
                              const err = await res.json();
                              throw new Error(err.error || "Failed to import entry");
                            }
                          }

                          toast.success("Import complete!");
                          setTimeout(() => window.location.reload(), 1500);

                        } catch (err: any) {
                          toast.error(`Import error: ${err.message}`);
                        }
                      };
                      reader.readAsText(file);
                    }}
                  />
                  <Button 
                    variant="outline" 
                    onClick={() => document.getElementById("csv-upload")?.click()}
                  >
                    Import Journals from CSV
                  </Button>
                </div>

                <a href="/sample-journals.csv" download>
                  <Button variant="ghost">
                    Download Sample CSV
                  </Button>
                </a>
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-lg border-red-200">
            <CardHeader>
              <CardTitle className="text-red-600 flex items-center gap-2 font-semibold">Ledger Reset</CardTitle>
              <CardDescription>Permanently clear all ledger data (accounts and journals). This action is non-reversible.</CardDescription>
            </CardHeader>
            <CardFooter className="bg-red-50 border-t border-red-100 rounded-b-lg">
              <Button 
                variant="destructive" 
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
        </TabsContent>
      </Tabs>

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

