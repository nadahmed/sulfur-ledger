"use client";

import { useRouter } from "next/navigation";
import { useUser } from "@auth0/nextjs-auth0/client";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Trash2, ArchiveRestore, AlertCircle, Pencil } from "lucide-react";
import Link from "next/link";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AccountSchema, AccountFormValues } from "@/lib/schemas";
import { useOrganization } from "@/context/OrganizationContext";
import { useState, useEffect } from "react";
import { toast } from "sonner";
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
import { cn } from "@/lib/utils";

interface Account {
  id: string;
  name: string;
  category: string;
  status: "active" | "archived";
  createdAt: string;
}

export default function AccountsPage() {
  const { user } = useUser();
  const { activeOrganizationId, permissions, isOwner, isLoading: isOrgLoading } = useOrganization();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [showArchived, setShowArchived] = useState(false);
  const [mounted, setMounted] = useState(false);

  const [confirmConfig, setConfirmConfig] = useState<{
    open: boolean;
    title: string;
    description: string;
    onConfirm: () => void;
    actionLabel?: string;
    variant?: "default" | "destructive";
  } | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  const isLoading = isOrgLoading;

  useEffect(() => {
    if (!isLoading && activeOrganizationId === null) {
      router.push("/app/onboarding");
    }
  }, [activeOrganizationId, isLoading, router]);

  useEffect(() => {
    setMounted(true);
  }, []);

  const canRead = isOwner || permissions.includes("read:accounts");
  const canManage = isOwner || permissions.includes("manage:accounts");

  const [page, setPage] = useState(1);
  const [pageSize] = useState(10);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");

  useEffect(() => {
    setPage(1);
  }, [showArchived, search, categoryFilter]);

  const { data: response, isLoading: isFetchingAccounts } = useQuery<{
    data: Account[],
    meta: { total: number, page: number, pageSize: number, totalPages: number }
  }>({
    queryKey: ["accounts", activeOrganizationId, showArchived, page, pageSize, search, categoryFilter],
    queryFn: async () => {
      const url = new URL("/api/accounts", window.location.origin);
      if (showArchived) url.searchParams.set("includeArchived", "true");
      url.searchParams.set("page", page.toString());
      url.searchParams.set("pageSize", pageSize.toString());
      if (search) url.searchParams.set("search", search);
      if (categoryFilter !== "all") url.searchParams.set("category", categoryFilter);

      const res = await fetch(url.toString());
      if (!res.ok) throw new Error("Failed to fetch accounts");
      return res.json();
    },
    enabled: !!activeOrganizationId && canRead,
  });

  const accounts = response?.data || [];
  const meta = response?.meta;

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors },
  } = useForm<AccountFormValues>({
    resolver: zodResolver(AccountSchema),
    defaultValues: {
      name: "",
      category: "asset",
    },
  });

  const createMutation = useMutation({
    mutationFn: async (values: AccountFormValues) => {
      const res = await fetch("/api/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to create account");
      }
      return res.json();
    },
    onSuccess: () => {
      reset();
      queryClient.invalidateQueries({ queryKey: ["accounts"] });
      toast.success("Account created successfully");
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/accounts?id=${id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to delete account");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["accounts"] });
      toast.success("Account archived successfully");
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const unarchiveMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/accounts?id=${id}&action=unarchive`, {
        method: "PATCH",
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to unarchive account");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["accounts"] });
      toast.success("Account unarchived successfully");
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const updateNameMutation = useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      const res = await fetch(`/api/accounts?id=${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to update account name");
      }
      return res.json();
    },
    onSuccess: () => {
      setEditingId(null);
      queryClient.invalidateQueries({ queryKey: ["accounts"] });
      toast.success("Account name updated successfully");
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const onSubmit = (values: AccountFormValues) => {
    createMutation.mutate(values);
  };

  const handleDelete = async (id: string, name: string) => {
    try {
      const res = await fetch(`/api/recurring?accountId=${id}`);
      if (!res.ok) throw new Error("Failed to check dependencies");
      const recurringEntries = await res.json();
      
      const hasRecurring = recurringEntries && recurringEntries.length > 0;
      
      setConfirmConfig({
        open: true,
        title: hasRecurring ? "Warning: Recurring Entries Linked" : "Confirm Deletion",
        description: hasRecurring 
          ? `Are you sure you want to archive ${name}? This account is used in ${recurringEntries.length} recurring entry schedule(s). ARCHIVING WILL PERMANENTLY DELETE THESE SCHEDULES.`
          : `Are you sure you want to archive ${name}? This will hide it from active lists.`,
        actionLabel: hasRecurring ? "Delete Schedules & Archive" : "Archive",
        variant: "destructive",
        onConfirm: () => deleteMutation.mutate(id),
      });
    } catch (err) {
      // Fallback to basic warning if check fails
      setConfirmConfig({
        open: true,
        title: "Confirm Deletion",
        description: `Are you sure you want to archive ${name}? This will hide it from active lists.`,
        actionLabel: "Archive",
        variant: "destructive",
        onConfirm: () => deleteMutation.mutate(id),
      });
    }
  };

  const handleUnarchive = (id: string, name: string) => {
    setConfirmConfig({
      open: true,
      title: "Confirm Unarchive",
      description: `Are you sure you want to unarchive ${name}?`,
      actionLabel: "Unarchive",
      variant: "default",
      onConfirm: () => unarchiveMutation.mutate(id),
    });
  };

  if (isLoading) return <div className="p-8 text-center">Loading...</div>;

  if (!activeOrganizationId && !isOrgLoading) {
    return <div className="p-8 text-center">No organization selected. Please go to <Link href="/app/onboarding" className="underline">Onboarding</Link></div>;
  }

  return (
    <div className="w-full max-w-screen-2xl p-4 md:p-6 min-h-screen">
      <div className="mb-4">
        <h1 className="text-xl font-bold">Chart of Accounts</h1>
      </div>

      {canManage && (
        <Card className="mb-4 font-sans border-border shadow-sm">
          <CardHeader className="py-3 px-4">
            <CardTitle className="text-lg">Create Account</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col sm:flex-row gap-3 items-end flex-wrap">
              <div className="grid w-full sm:max-w-xs items-center gap-1">
                <Label htmlFor="name" className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Account Name</Label>
                <Input
                  id="name"
                  {...register("name")}
                  placeholder="e.g. Main Checking"
                  className={cn("h-9 text-sm", errors.name ? "border-destructive" : "")}
                />
              </div>
              <div className="grid w-full sm:max-w-xs items-center gap-1">
                <Label htmlFor="category" className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Category</Label>
                <Controller
                  name="category"
                  control={control}
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger id="category" className="capitalize h-9 text-sm">
                        <SelectValue placeholder="Select Category" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="asset" className="text-xs">Asset</SelectItem>
                        <SelectItem value="liability" className="text-xs">Liability</SelectItem>
                        <SelectItem value="equity" className="text-xs">Equity</SelectItem>
                        <SelectItem value="income" className="text-xs">Income</SelectItem>
                        <SelectItem value="expense" className="text-xs">Expense</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
              <Button type="submit" className="w-full sm:w-auto" disabled={createMutation.isPending}>
                {createMutation.isPending ? "Creating..." : "Create"}
              </Button>
            </form>
            {(errors.name || errors.category) && (
              <div className="text-destructive mt-4 text-sm flex flex-col gap-1">
                {errors.name && <p>{errors.name.message}</p>}
                {errors.category && <p>{errors.category.message}</p>}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Card className="shadow-sm border-border">
        <CardHeader className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3 p-4">
          <CardTitle className="text-lg">Accounts</CardTitle>
          <div className="flex flex-col sm:flex-row items-center gap-3 w-full md:w-auto">
            <div className="flex items-center space-x-2 w-full sm:w-auto">
              <Input
                placeholder="Search accounts..."
                className="h-9 w-full sm:w-[200px]"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="w-full sm:w-auto">
              <Select value={categoryFilter} onValueChange={(val) => setCategoryFilter(val || "all")}>
                <SelectTrigger className="h-9 w-full sm:w-[150px]">
                  <SelectValue placeholder="All Categories">
                    {categoryFilter === "all" ? "All Categories" : categoryFilter.charAt(0).toUpperCase() + categoryFilter.slice(1)}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  <SelectItem value="asset">Asset</SelectItem>
                  <SelectItem value="liability">Liability</SelectItem>
                  <SelectItem value="equity">Equity</SelectItem>
                  <SelectItem value="income">Income</SelectItem>
                  <SelectItem value="expense">Expense</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center space-x-2 shrink-0">
              {mounted ? (
                <>
                  <Switch
                    id="show-archived"
                    checked={showArchived}
                    onCheckedChange={setShowArchived}
                    className="scale-75"
                  />
                  <Label htmlFor="show-archived" className="text-xs text-muted-foreground uppercase font-bold">Archived</Label>
                </>
              ) : (
                <div className="w-24 h-6 bg-muted animate-pulse rounded-full" />
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isFetchingAccounts ? (
            <div className="text-center py-4">Loading accounts...</div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/30">
                    <TableHead className="h-8 text-xs">Name</TableHead>
                    <TableHead className="h-8 text-xs">Category</TableHead>
                    <TableHead className="h-8 text-xs">Created</TableHead>
                    {canManage && <TableHead className="w-[80px] text-right h-8 text-xs">Actions</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {accounts.map((acc) => (
                    <TableRow key={acc.id} className={cn("group hover:bg-muted/10 transition-colors", acc.status === "archived" ? "opacity-40 italic" : "")}>
                      <TableCell className="font-medium text-xs py-2">
                        {editingId === acc.id ? (
                          <div className="flex items-center gap-2">
                            <Input
                              value={editName}
                              onChange={(e) => setEditName(e.target.value)}
                              className="h-8 py-1"
                              onKeyDown={(e) => {
                                if (e.key === "Enter") updateNameMutation.mutate({ id: acc.id, name: editName });
                                if (e.key === "Escape") setEditingId(null);
                              }}
                              autoFocus
                            />
                            <Button
                              size="sm"
                              className="h-7 px-2"
                              onClick={() => updateNameMutation.mutate({ id: acc.id, name: editName })}
                              disabled={updateNameMutation.isPending}
                            >
                              Save
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 px-2"
                              onClick={() => setEditingId(null)}
                            >
                              Cancel
                            </Button>
                          </div>
                        ) : (
                          <div className="group flex items-center gap-2">
                            <span>{acc.name}</span>
                            {canManage && acc.status === "active" && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                                onClick={() => {
                                  setEditingId(acc.id);
                                  setEditName(acc.name);
                                }}
                              >
                                <Pencil className="h-3 w-3" />
                              </Button>
                            )}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="capitalize text-xs py-2">{acc.category}</TableCell>
                      <TableCell className="text-[10px] text-muted-foreground py-2">{new Date(acc.createdAt).toLocaleDateString()}</TableCell>
                      {canManage && (
                        <TableCell className="text-right py-1">
                          {acc.status === "archived" ? (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleUnarchive(acc.id, acc.name)}
                              disabled={unarchiveMutation.isPending}
                            >
                              <ArchiveRestore className="h-4 w-4 text-muted-foreground hover:text-primary" />
                            </Button>
                          ) : (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleDelete(acc.id, acc.name)}
                              disabled={deleteMutation.isPending}
                            >
                              <Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" />
                            </Button>
                          )}
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                  {accounts.length === 0 && !isFetchingAccounts && (
                    <TableRow>
                      <TableCell colSpan={canManage ? 4 : 3} className="text-center py-4 text-muted-foreground">No accounts created</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          )}
          {meta && meta.totalPages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <div className="text-sm text-muted-foreground">
                Showing {accounts.length} of {meta.total} accounts
              </div>
              <div className="flex items-center space-x-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                >
                  Previous
                </Button>
                <div className="text-sm font-medium">
                  Page {page} of {meta.totalPages}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(p => Math.min(meta.totalPages, p + 1))}
                  disabled={page === meta.totalPages}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
          {!canRead && !isFetchingAccounts && (
            <div className="p-8 text-center text-destructive">
              You do not have permission to view account details.
            </div>
          )}
        </CardContent>
      </Card>

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
                variant={confirmConfig.variant}
                onClick={() => {
                  confirmConfig.onConfirm();
                  setConfirmConfig(null);
                }}
              >
                {confirmConfig.actionLabel || "Continue"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
}
