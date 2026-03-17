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
import { Trash2, ArchiveRestore, AlertCircle } from "lucide-react";
import Link from "next/link";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AccountSchema, AccountFormValues } from "@/lib/schemas";
import { Header } from "@/components/Header";
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

  const { data: accounts = [], isLoading: isFetchingAccounts } = useQuery<Account[]>({
    queryKey: ["accounts", activeOrganizationId, showArchived],
    queryFn: async () => {
      const url = showArchived ? "/api/accounts?includeArchived=true" : "/api/accounts";
      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed to fetch accounts");
      return res.json();
    },
    enabled: !!activeOrganizationId && !!user && canRead,
  });

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
    <div className="max-w-4xl mx-auto p-8">
      <Header title="Chart of Accounts" showBack />

      {canManage && (
        <Card className="mb-8 font-sans">
          <CardHeader>
            <CardTitle>Create Account</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit(onSubmit)} className="flex gap-4 items-end flex-wrap">
              <div className="grid w-full max-w-xs items-center gap-1.5">
                <Label htmlFor="name">Account Name</Label>
                <Input 
                  id="name" 
                  {...register("name")} 
                  placeholder="e.g. Main Checking" 
                  className={errors.name ? "border-red-500" : ""}
                />
              </div>
              <div className="grid w-full max-w-xs items-center gap-1.5">
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
              <Button type="submit" disabled={createMutation.isPending}>
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
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Accounts</CardTitle>
          <div className="flex items-center space-x-2">
            {mounted ? (
              <>
                <Switch 
                  id="show-archived" 
                  checked={showArchived}
                  onCheckedChange={setShowArchived}
                />
                <Label htmlFor="show-archived">Show Archived</Label>
              </>
            ) : (
              <div className="w-24 h-6 bg-neutral-100 animate-pulse rounded-full" />
            )}
          </div>
        </CardHeader>
        <CardContent>
          {isFetchingAccounts ? (
            <div className="text-center py-4">Loading accounts...</div>
          ) : (
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
                    <TableCell className="font-medium">{acc.name}</TableCell>
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
