"use client";

import { useState, useEffect, useMemo } from "react";
import { useUser } from "@auth0/nextjs-auth0/client";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import Link from "next/link";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useMutation, useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { JournalEntrySchema, JournalEntryFormValues, JournalEntryFormInput } from "@/lib/schemas";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { ChevronsUpDown, Check, Pencil, Trash2, MoreVertical, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
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

interface SearchableSelectProps {
  options: { id: string; name: string }[];
  value: string;
  onValueChange: (value: string) => void;
  placeholder: string;
  error?: boolean;
}

function SearchableSelect({ options, value, onValueChange, placeholder, error }: SearchableSelectProps) {
  const [open, setOpen] = useState(false);
  const selectedOption = options.find((opt) => opt.id === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        role="combobox"
        aria-expanded={open}
        className={cn(
          "flex w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
          !selectedOption && "text-neutral-500",
          error && "border-red-500"
        )}
      >
        {selectedOption ? selectedOption.name : placeholder}
        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
        <Command>
          <CommandInput placeholder={`Search ${placeholder.toLowerCase()}...`} />
          <CommandList>
            <CommandEmpty>No account found.</CommandEmpty>
            <CommandGroup>
              {options.map((option) => (
                <CommandItem
                  key={option.id}
                  value={option.name}
                  onSelect={() => {
                    onValueChange(option.id === value ? "" : option.id);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      value === option.id ? "opacity-100" : "opacity-0"
                    )}
                  />
                  {option.name}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export default function JournalsPage() {
  const { user, isLoading: isUserLoading } = useUser();
  const { activeOrganizationId, permissions, isOwner, isLoading: isOrgLoading } = useOrganization();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [filterDate, setFilterDate] = useState<string>("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [oldDate, setOldDate] = useState<string | null>(null);

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
  }), []);

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

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors },
  } = useForm<JournalEntryFormInput>({
    resolver: zodResolver(JournalEntrySchema),
    defaultValues: initialFormValues,
  });

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
      reset(initialFormValues);
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
      reset(initialFormValues);
      setEditingId(null);
      setOldDate(null);
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

  const onSubmit = (values: any) => {
    if (editingId) {
      patchMutation.mutate({
        ...values,
        id: editingId,
        oldDate: oldDate,
      });
    } else {
      postMutation.mutate(values as JournalEntryFormValues);
    }
  };

  const handleEdit = (jnl: JournalEntry) => {
    const debitLine = jnl.lines?.find((l: any) => l.amount > 0);
    const creditLine = jnl.lines?.find((l: any) => l.amount < 0);
    
    setEditingId(jnl.id);
    setOldDate(jnl.date);
    
    reset({
      date: jnl.date.slice(0, 10),
      description: jnl.description,
      notes: jnl.notes || "",
      amount: (Math.abs(debitLine?.amount || 0) / 100).toString(),
      fromAccountId: creditLine?.accountId || "",
      toAccountId: debitLine?.accountId || "",
      tags: (jnl.tags || []).join(", "),
    });

    window.scrollTo({ top: 0, behavior: "smooth" });
    toast.info("Editing transaction...");
  };

  const cancelEdit = () => {
    setEditingId(null);
    setOldDate(null);
    reset(initialFormValues);
  };

  const handleDelete = (id: string, date: string) => {
    setConfirmConfig({
      open: true,
      title: "Delete Journal Entry",
      description: "Are you sure you want to delete this journal entry? This will also create an audit log.",
      onConfirm: () => deleteMutation.mutate({ id, date }),
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
        <h1 className="text-2xl font-bold">Journals</h1>
      </div>

      {canCreate && (
        <Card className="mb-8 font-sans border-blue-100 shadow-sm">
          <CardHeader>
            <CardTitle className="text-xl flex items-center gap-2">
              {editingId ? (
                <>
                  <Pencil className="h-5 w-5 text-blue-500" />
                  Edit Transaction
                </>
              ) : (
                "Record Transaction"
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-6">
              <div className="flex flex-col md:flex-row gap-4">
                <div className="grid w-full md:w-[150px] items-center gap-1.5">
                  <Label htmlFor="date">Date</Label>
                  <Input 
                    id="date" 
                    type="date" 
                    {...register("date")} 
                    className={errors.date ? "border-red-500" : ""}
                  />
                </div>
                <div className="grid flex-1 items-center gap-1.5">
                  <Label htmlFor="description">Description</Label>
                  <Input 
                    id="description" 
                    {...register("description")} 
                    placeholder="Transaction description..." 
                    className={errors.description ? "border-red-500" : ""}
                  />
                </div>
              </div>

              <div className="flex flex-col md:flex-row gap-4">
                <div className="grid flex-1 items-center gap-1.5">
                  <Label htmlFor="fromAccountId">From Account (Credit)</Label>
                  <Controller
                    name="fromAccountId"
                    control={control}
                    render={({ field }) => (
                      <SearchableSelect
                        options={accounts}
                        value={field.value}
                        onValueChange={field.onChange}
                        placeholder="Select Credit Account"
                        error={!!errors.fromAccountId}
                      />
                    )}
                  />
                </div>
                <div className="grid flex-1 items-center gap-1.5">
                  <Label htmlFor="toAccountId">To Account (Debit)</Label>
                  <Controller
                    name="toAccountId"
                    control={control}
                    render={({ field }) => (
                      <SearchableSelect
                        options={accounts}
                        value={field.value}
                        onValueChange={field.onChange}
                        placeholder="Select Debit Account"
                        error={!!errors.toAccountId}
                      />
                    )}
                  />
                </div>
              </div>

              <div className="flex flex-col md:flex-row gap-4">
                <div className="grid w-full md:w-[150px] items-center gap-1.5">
                  <Label htmlFor="amount">Amount</Label>
                  <Input 
                    type="number" 
                    step="0.01" 
                    min="0.01" 
                    id="amount" 
                    {...register("amount")} 
                    placeholder="0.00" 
                    className={errors.amount ? "border-red-500" : ""}
                  />
                </div>
                <div className="grid flex-1 items-center gap-1.5">
                  <Label htmlFor="notes">Notes (Optional)</Label>
                  <Input 
                    id="notes" 
                    {...register("notes")} 
                    placeholder="Additional details..." 
                  />
                </div>
              </div>

              <div className="flex gap-4">
                <div className="grid flex-1 items-center gap-1.5">
                  <Label htmlFor="tags">Tags (Optional, comma-separated)</Label>
                  <Input 
                    id="tags" 
                    {...register("tags")} 
                    placeholder="e.g. marketing, software, monthly" 
                  />
                </div>
              </div>

               <div className="flex gap-3">
                <Button type="submit" className="flex-1" disabled={postMutation.isPending || patchMutation.isPending}>
                  {editingId 
                    ? (patchMutation.isPending ? "Updating..." : "Update Journal") 
                    : (postMutation.isPending ? "Posting..." : "Post Journal")
                  }
                </Button>
                {editingId && (
                  <Button type="button" variant="outline" onClick={cancelEdit}>
                    Cancel
                  </Button>
                )}
              </div>

              {Object.keys(errors).length > 0 && (
                 <div className="text-red-500 text-sm flex flex-col gap-1">
                    {Object.values(errors).map((err, i) => (
                      <p key={i}>{typeof err?.message === 'string' ? err.message : 'Invalid input'}</p>
                    ))}
                 </div>
              )}
            </form>
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

                      // jnl.date is stored as a full UTC ISO string (e.g. "2026-03-21T22:58:37.000Z").
                      // Slicing to YYYY-MM-DD and appending T00:00:00 forces local-midnight parsing,
                      // so the displayed date always matches what the user selected.
                      const datePart = jnl.date.slice(0, 10);
                      const dateObj = new Date(`${datePart}T00:00:00`);
                      const displayDate = dateObj.toLocaleDateString(undefined, {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric'
                      });
                      const displayTime = dateObj.toLocaleTimeString(undefined, {
                        hour: '2-digit',
                        minute: '2-digit'
                      });

                      return (
                        <TableRow key={jnl.id}>
                          <TableCell className="font-medium" suppressHydrationWarning>
                            <div className="flex flex-col">
                              <span>{displayDate}</span>
                              <span className="text-[10px] text-neutral-400 font-mono">{displayTime}</span>
                            </div>
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
                                <DropdownMenuTrigger 
                                  render={<Button variant="ghost" size="icon" className="h-8 w-8" />}
                                >
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
                        <TableCell colSpan={7} className="text-center py-4 text-neutral-500">No journals found</TableCell>
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
                variant="destructive" 
                onClick={() => {
                  confirmConfig.onConfirm();
                  setConfirmConfig(null);
                }}
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
