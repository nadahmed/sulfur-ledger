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

interface Account {
  id: string;
  name: string;
  category: string;
  status: "active" | "archived";
  createdAt: string;
}

export default function AccountsPage() {
  const { user, isLoading: isUserLoading } = useUser();
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

  const isLoading = isUserLoading || isOrgLoading;

  useEffect(() => {
    if (!isLoading && user && !activeOrganizationId) {
      router.push("/onboarding");
    }
  }, [user, activeOrganizationId, isLoading, router]);

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
    enabled: !!activeOrganizationId && !!user && canRead,
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

  const handleDelete = (id: string, name: string) => {
    setConfirmConfig({
      open: true,
      title: "Confirm Deletion",
      description: `Are you sure you want to archive ${name}? This will hide it from active lists.`,
      actionLabel: "Archive",
      variant: "destructive",
      onConfirm: () => deleteMutation.mutate(id),
    });
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

  if (!user) {
    return (
      <div className="p-8 text-center">
        <p className="mb-4">Please log in to view this page.</p>
        <Link href="/auth/login">
          <Button>Log In</Button>
        </Link>
      </div>
    );
  }

  if (!activeOrganizationId) {
    return <div className="p-8 text-center">Redirecting to setup...</div>;
  }

  return (
    <div className="w-full max-w-screen-2xl p-4 md:p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Chart of Accounts</h1>
      </div>

      {canManage && (
        <Card className="mb-8 font-sans">
          <CardHeader>
            <CardTitle>Create Account</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col sm:flex-row gap-4 items-end flex-wrap">
              <div className="grid w-full sm:max-w-xs items-center gap-1.5">
                <Label htmlFor="name">Account Name</Label>
                <Input 
                  id="name" 
                  {...register("name")} 
                  placeholder="e.g. Main Checking" 
                  className={errors.name ? "border-red-500" : ""}
                />
              </div>
              <div className="grid w-full sm:max-w-xs items-center gap-1.5">
                <Label htmlFor="category">Category</Label>
                <Controller
                  name="category"
                  control={control}
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger id="category">
                        <SelectValue placeholder="Select Category" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="asset">Asset</SelectItem>
                        <SelectItem value="liability">Liability</SelectItem>
                        <SelectItem value="equity">Equity</SelectItem>
                        <SelectItem value="income">Income</SelectItem>
                        <SelectItem value="expense">Expense</SelectItem>
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
              <div className="text-red-500 mt-4 text-sm flex flex-col gap-1">
                {errors.name && <p>{errors.name.message}</p>}
                {errors.category && <p>{errors.category.message}</p>}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <CardTitle>Accounts</CardTitle>
          <div className="flex flex-col sm:flex-row items-center gap-4 w-full md:w-auto">
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
                  <SelectValue placeholder="All Categories" />
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
                  />
                  <Label htmlFor="show-archived" className="text-sm">Archived</Label>
                </>
              ) : (
                <div className="w-24 h-6 bg-neutral-100 animate-pulse rounded-full" />
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
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Created</TableHead>
                  {canManage && <TableHead className="w-[100px] text-right">Actions</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {accounts.map((acc) => (
                  <TableRow key={acc.id} className={acc.status === "archived" ? "opacity-50 line-through" : ""}>
                    <TableCell className="font-medium">
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
                    <TableCell className="capitalize">{acc.category}</TableCell>
                    <TableCell>{new Date(acc.createdAt).toLocaleDateString()}</TableCell>
                    {canManage && (
                      <TableCell className="text-right">
                        {acc.status === "archived" ? (
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            onClick={() => handleUnarchive(acc.id, acc.name)}
                            disabled={unarchiveMutation.isPending}
                          >
                            <ArchiveRestore className="h-4 w-4 text-neutral-500 hover:text-green-500" />
                          </Button>
                        ) : (
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            onClick={() => handleDelete(acc.id, acc.name)}
                            disabled={deleteMutation.isPending}
                          >
                            <Trash2 className="h-4 w-4 text-neutral-500 hover:text-red-500" />
                          </Button>
                        )}
                      </TableCell>
                    )}
                  </TableRow>
                ))}
                {accounts.length === 0 && !isFetchingAccounts && (
                  <TableRow>
                    <TableCell colSpan={canManage ? 4 : 3} className="text-center py-4 text-neutral-500">No accounts created</TableCell>
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
            <div className="p-8 text-center text-red-500">
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
