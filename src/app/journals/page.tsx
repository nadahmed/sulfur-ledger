"use client";

import { useState, useEffect, useMemo } from "react";
import { useUser } from "@auth0/nextjs-auth0/client";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import Link from "next/link";
import { useQuery, useMutation, useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { JournalEntryFormValues } from "@/lib/schemas";
import { Pencil, Trash2, MoreVertical } from "lucide-react";
import { useOrganization } from "@/context/OrganizationContext";
import { useRouter } from "next/navigation";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { JournalForm } from "@/components/journals/JournalForm";

interface JournalEntry {
  id: string;
  date: string;
  description: string;
  notes?: string;
  tags?: string[];
  createdAt: string;
  lines: { accountId: string; amount: number; date: string }[];
}

interface Account {
  id: string;
  name: string;
}

export default function JournalsPage() {
  const { user, isLoading: isUserLoading } = useUser();
  const { activeOrganizationId, permissions, isOwner, isLoading: isOrgLoading } = useOrganization();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [filterDate, setFilterDate] = useState<string>("");
  
  // Edit Dialog State
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<JournalEntry | null>(null);

  const [confirmConfig, setConfirmConfig] = useState<{
    open: boolean;
    title: string;
    description: string;
    onConfirm: () => void;
  } | null>(null);

  const isLoading = isUserLoading || isOrgLoading;

  useEffect(() => {
    if (!isLoading && user && !activeOrganizationId) {
      router.push("/onboarding");
    }
  }, [user, activeOrganizationId, isLoading, router]);

  const canRead = isOwner || permissions.includes("read:journals");
  const canCreate = isOwner || permissions.includes("create:journals");
  const canUpdate = isOwner || permissions.includes("update:journals");
  const canDelete = isOwner || permissions.includes("delete:journals");

  const { data: accountResponse } = useQuery<{ data: Account[] }>({
    queryKey: ["accounts", activeOrganizationId],
    queryFn: async () => {
      const res = await fetch("/api/accounts?pageSize=1000", { headers: { "x-org-id": activeOrganizationId! } });
      if (!res.ok) throw new Error("Failed to fetch accounts");
      return res.json();
    },
    enabled: !!activeOrganizationId && canRead,
  });

  const accounts = accountResponse?.data || [];
  
  const todayLocal = useMemo(() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }, []);

  const initialFormValues = useMemo(() => ({
    date: todayLocal,
    description: "",
    notes: "",
    amount: "",
    fromAccountId: "",
    toAccountId: "",
    tags: "" as any,
  }), [todayLocal]);

  const {
    data: journalData,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading: isFetchingJournals,
  } = useInfiniteQuery({
    queryKey: ["journals", activeOrganizationId, filterDate],
    queryFn: async ({ pageParam }) => {
      let url = "/api/journals?limit=10";
      if (pageParam) url += `&cursor=${encodeURIComponent(pageParam)}`;
      if (filterDate) url += `&date=${encodeURIComponent(filterDate)}`;

      const res = await fetch(url, { headers: { "x-org-id": activeOrganizationId! } });
      if (!res.ok) throw new Error("Failed to fetch journals");
      return res.json();
    },
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    enabled: !!activeOrganizationId && canRead,
    initialPageParam: undefined as string | undefined,
  });

  const journals = useMemo(() => {
    return journalData?.pages.flatMap((page) => page.data) || [];
  }, [journalData]);

  const postMutation = useMutation({
    mutationFn: async (values: JournalEntryFormValues) => {
      const res = await fetch("/api/journals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to post journal entry");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["journals"] });
      toast.success("Journal entry recorded successfully");
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const patchMutation = useMutation({
    mutationFn: async (values: any) => {
      const res = await fetch("/api/journals", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to update journal entry");
      }
      return res.json();
    },
    onSuccess: () => {
      setEditingEntry(null);
      setIsEditDialogOpen(false);
      queryClient.invalidateQueries({ queryKey: ["journals"] });
      toast.success("Journal entry updated successfully");
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async ({ id, date }: { id: string; date: string }) => {
      const res = await fetch(`/api/journals?id=${id}&date=${date}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to delete journal entry");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["journals"] });
      toast.success("Journal entry deleted successfully");
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const handleEdit = (jnl: JournalEntry) => {
    setEditingEntry(jnl);
    setIsEditDialogOpen(true);
  };

  const handleDelete = (id: string, date: string) => {
    setConfirmConfig({
      open: true,
      title: "Delete Journal Entry",
      description: "Are you sure you want to delete this journal entry? This will also create an audit log.",
      onConfirm: () => deleteMutation.mutate({ id, date }),
    });
  };

  const editingInitialValues = useMemo(() => {
    if (!editingEntry) return null;
    const debitLine = editingEntry.lines?.find((l: any) => l.amount > 0);
    const creditLine = editingEntry.lines?.find((l: any) => l.amount < 0);
    
    return {
      date: editingEntry.date.slice(0, 10),
      description: editingEntry.description,
      notes: editingEntry.notes || "",
      amount: (Math.abs(debitLine?.amount || 0) / 100).toString(),
      fromAccountId: creditLine?.accountId || "",
      toAccountId: debitLine?.accountId || "",
      tags: (editingEntry.tags || []).join(", "),
    };
  }, [editingEntry]);

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
        <h1 className="text-2xl font-bold">Journals</h1>
      </div>

      {canCreate && (
        <Card className="mb-8 font-sans border-blue-100 shadow-sm">
          <CardHeader>
            <CardTitle className="text-xl flex items-center gap-2">
              Record Transaction
            </CardTitle>
          </CardHeader>
          <CardContent>
            <JournalForm
              key="create-form"
              accounts={accounts}
              initialValues={initialFormValues}
              onSubmit={(values) => postMutation.mutate(values as JournalEntryFormValues)}
              isPending={postMutation.isPending}
              submitLabel="Post Journal"
            />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-7">
          <CardTitle>Recent Journals</CardTitle>
          <div className="flex items-center gap-2">
            <Label htmlFor="filter-date" className="text-sm font-medium">Filter by Date:</Label>
            <Input 
              id="filter-date" 
              type="date" 
              className="w-40 h-9" 
              value={filterDate}
              onChange={(e) => setFilterDate(e.target.value)}
            />
            {filterDate && (
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={() => setFilterDate("")}
              >
                Clear
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {!canRead ? (
            <div className="p-8 text-center text-red-500">
              You do not have permission to view journal entries.
            </div>
          ) : isFetchingJournals && !journals.length ? (
            <div className="p-8 text-center">Loading journals...</div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <thead>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>From Account</TableHead>
                      <TableHead>To Account</TableHead>
                      <TableHead>Notes</TableHead>
                      <TableHead>Tags</TableHead>
                      {(canUpdate || canDelete) && <TableHead className="w-[50px]"></TableHead>}
                    </TableRow>
                  </thead>
                  <TableBody>
                    {journals.map((jnl) => {
                      const debitLine = jnl.lines?.find((l: any) => l.amount > 0);
                      const creditLine = jnl.lines?.find((l: any) => l.amount < 0);
                      const fromAcc = accounts.find(a => a.id === creditLine?.accountId)?.name || "Loading...";
                      const toAcc = accounts.find(a => a.id === debitLine?.accountId)?.name || "Loading...";
                      const amountDisp = debitLine ? (debitLine.amount / 100).toFixed(2) : "0.00";

                      const datePart = jnl.date.slice(0, 10);
                      const dateObj = new Date(`${datePart}T00:00:00`);
                      const displayDate = dateObj.toLocaleDateString(undefined, {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric'
                      });

                      return (
                        <TableRow key={jnl.id}>
                          <TableCell className="font-medium" suppressHydrationWarning>
                            {displayDate}
                          </TableCell>
                          <TableCell className="max-w-[200px] break-words whitespace-normal">{jnl.description}</TableCell>
                          <TableCell>৳{amountDisp}</TableCell>
                          <TableCell>{fromAcc}</TableCell>
                          <TableCell>{toAcc}</TableCell>
                          <TableCell className="max-w-[180px] break-words whitespace-normal text-xs text-neutral-500">{jnl.notes || "-"}</TableCell>
                          <TableCell className="max-w-[180px]">
                            <div className="flex flex-wrap gap-1">
                              {jnl.tags && jnl.tags.length > 0 ? (
                                jnl.tags.map((tag: string, idx: number) => (
                                  <span 
                                    key={idx} 
                                    className="inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700 ring-1 ring-inset ring-blue-700/10"
                                  >
                                    {tag}
                                  </span>
                                ))
                              ) : (
                                <span className="text-neutral-400">-</span>
                              )}
                            </div>
                          </TableCell>
                          {(canUpdate || canDelete) && (
                            <TableCell>
                              <DropdownMenu>
                                <DropdownMenuTrigger render={<Button variant="ghost" size="icon" className="h-8 w-8" />}>
                                  <MoreVertical className="h-4 w-4" />
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  {canUpdate && (
                                    <DropdownMenuItem onClick={() => handleEdit(jnl)}>
                                      <Pencil className="mr-2 h-4 w-4" /> Edit
                                    </DropdownMenuItem>
                                  )}
                                  {canDelete && (
                                    <DropdownMenuItem 
                                      variant="destructive"
                                      onClick={() => handleDelete(jnl.id, jnl.date)}
                                    >
                                      <Trash2 className="mr-2 h-4 w-4" /> Delete
                                    </DropdownMenuItem>
                                  )}
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </TableCell>
                          )}
                        </TableRow>
                      );
                    })}
                    {journals.length === 0 && !isFetchingJournals && (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center py-4 text-neutral-500">No journals found</TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
                
              {hasNextPage && (
                <div className="mt-4 flex justify-center">
                  <Button 
                    variant="outline" 
                    onClick={() => fetchNextPage()} 
                    disabled={isFetchingNextPage}
                  >
                    {isFetchingNextPage ? "Loading..." : "Load More"}
                  </Button>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>Edit Transaction</DialogTitle>
          </DialogHeader>
          {editingInitialValues && (
            <JournalForm
              key={`edit-form-${editingEntry?.id}`}
              accounts={accounts}
              initialValues={editingInitialValues}
              onSubmit={(values) => patchMutation.mutate({
                ...values,
                id: editingEntry?.id,
                oldDate: editingEntry?.date,
              })}
              onCancel={() => setIsEditDialogOpen(false)}
              isPending={patchMutation.isPending}
              submitLabel="Update Journal"
            />
          )}
        </DialogContent>
      </Dialog>

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
                onClick={() => {
                  confirmConfig.onConfirm();
                  setConfirmConfig(null);
                }}
                className="bg-red-600 hover:bg-red-700"
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
}
