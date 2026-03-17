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
import { JournalEntrySchema, JournalEntryFormValues } from "@/lib/schemas";
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
  } = useForm<JournalEntryFormValues>({
    resolver: zodResolver(JournalEntrySchema),
    defaultValues: {
      date: new Date().toISOString().slice(0, 10),
      description: "",
      notes: "",
      amount: "",
      fromAccountId: "",
      toAccountId: "",
    },
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
      reset();
      queryClient.invalidateQueries({ queryKey: ["journals"] });
      toast.success("Journal entry recorded successfully");
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

  const onSubmit = (values: JournalEntryFormValues) => {
    postMutation.mutate(values);
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
        <Card className="mb-8 font-sans">
          <CardHeader>
            <CardTitle>Record Transaction</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-6">
              <div className="flex gap-4">
                <div className="grid w-[150px] items-center gap-1.5">
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

              <div className="flex gap-4">
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

              <div className="flex gap-4">
                <div className="grid w-[150px] items-center gap-1.5">
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

              <Button type="submit" disabled={postMutation.isPending}>
                {postMutation.isPending ? "Posting..." : "Post Journal"}
              </Button>

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
              <Table>
                <thead>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>From Account</TableHead>
                    <TableHead>To Account</TableHead>
                    <TableHead>Notes</TableHead>
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

                    const [year, month, day] = jnl.date.split('-').map(Number);
                    const displayDate = new Date(year, month - 1, day).toLocaleDateString(undefined, {
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric'
                    });

                    return (
                      <TableRow key={jnl.id}>
                        <TableCell className="font-medium" suppressHydrationWarning>
                          {displayDate}
                        </TableCell>
                        <TableCell>{jnl.description}</TableCell>
                        <TableCell>৳{amountDisp}</TableCell>
                        <TableCell>{fromAcc}</TableCell>
                        <TableCell>{toAcc}</TableCell>
                        <TableCell className="text-xs text-neutral-500">{jnl.notes || "-"}</TableCell>
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
                                  <DropdownMenuItem onClick={() => toast.info("Edit feature is coming soon!")}>
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
