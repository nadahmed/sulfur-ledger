"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useOrganization } from "@/context/OrganizationContext";
import { useState, useMemo } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Plus, Trash2, RotateCw, AlertCircle, ArrowRightLeft, Calendar as CalendarIcon } from "lucide-react";
import { DatePicker } from "@/components/ui/date-picker";
import { useForm, Controller } from "react-hook-form";
import Link from "next/link";
import { zodResolver } from "@hookform/resolvers/zod";
import { SearchableSelect } from "@/components/accounts/SearchableSelect";
import { TagSelector } from "@/components/journals/TagSelector";
import { RecurringEntrySchema, RecurringEntryFormValues, RecurringEntryFormInput } from "@/lib/schemas";
import { format, parseISO } from "date-fns";
import { cn, formatCurrency } from "@/lib/utils";
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

export default function RecurringPage() {
  const { activeOrganizationId, organizations, isOwner, permissions } = useOrganization();
  const activeOrg = organizations.find(o => o.id === activeOrganizationId);
  const queryClient = useQueryClient();
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const canManage = isOwner || permissions.includes("create:journals");

  // Fetch Recurring Entries
  const { data: entries = [], isLoading } = useQuery({
    queryKey: ["recurring", activeOrganizationId],
    queryFn: async () => {
      const res = await fetch("/api/recurring");
      if (!res.ok) throw new Error("Failed to fetch recurring entries");
      return res.json();
    },
    enabled: !!activeOrganizationId,
  });

  // Fetch Accounts for dropdowns
  const { data: accountsData } = useQuery({
    queryKey: ["accounts", activeOrganizationId],
    queryFn: async () => {
      const res = await fetch("/api/accounts?pageSize=1000");
      if (!res.ok) throw new Error("Failed to fetch accounts");
      return res.json();
    },
    enabled: !!activeOrganizationId,
  });
  const accounts = accountsData?.data || [];

  const todayLocal = useMemo(() => {
    const now = new Date();
    return format(now, "yyyy-MM-dd");
  }, []);

  const form = useForm<RecurringEntryFormInput>({
    resolver: zodResolver(RecurringEntrySchema),
    defaultValues: {
      description: "",
      amount: "",
      fromAccountId: "",
      toAccountId: "",
      frequency: "monthly",
      interval: 1,
      startDate: todayLocal,
      isActive: true,
      tags: [],
    },
  });

  const handleSwap = () => {
    const from = form.getValues("fromAccountId");
    const to = form.getValues("toAccountId");
    form.setValue("fromAccountId", to);
    form.setValue("toAccountId", from);
  };

  const createMutation = useMutation({
    mutationFn: async (values: RecurringEntryFormInput) => {
      const res = await fetch("/api/recurring", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to create recurring entry");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["recurring"] });
      form.reset({
        description: "",
        amount: "",
        fromAccountId: "",
        toAccountId: "",
        frequency: "monthly",
        interval: 1,
        startDate: todayLocal,
        isActive: true,
        tags: [],
      });
      toast.success("Recurring entry created");
    },
    onError: (err: any) => {
      toast.error(err.message);
    }
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      const res = await fetch("/api/recurring", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, isActive }),
      });
      if (!res.ok) throw new Error("Failed to update status");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["recurring"] });
      toast.success("Status updated");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/recurring?id=${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete entry");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["recurring"] });
      toast.success("Recurring entry deleted");
      setDeleteConfirmId(null);
    },
  });

  const onSubmit = (values: RecurringEntryFormInput) => {
    createMutation.mutate(values);
  };

  const getAccountName = (id: string) => accounts.find((a: any) => a.id === id)?.name || id;

  const formatAmount = (amountPaisa: number) => {
    return formatCurrency(
      amountPaisa / 100,
      activeOrg?.currencySymbol,
      activeOrg?.currencyPosition,
      activeOrg?.currencyHasSpace,
      activeOrg?.thousandSeparator,
      activeOrg?.decimalSeparator,
      activeOrg?.grouping as any,
      activeOrg?.decimalPlaces
    );
  };

  if (isLoading) return <div className="p-8 text-center text-muted-foreground">Loading recurring entries...</div>;

  if (!activeOrganizationId && !isLoading) {
    return <div className="p-8 text-center text-muted-foreground">No organization selected. Please go to <Link href="/app/onboarding" className="underline font-bold text-primary">Onboarding</Link></div>;
  }

  return (
    <div className="w-full max-w-screen-2xl p-4 md:p-8 space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight">Recurring Entries</h1>
        <p className="text-muted-foreground">Schedule automatic journal entries for regular transactions.</p>
      </div>

      {canManage && (
        <Card className="border-border shadow-sm overflow-hidden group">
          <div className="h-1 bg-primary/20 group-hover:bg-primary transition-colors" />
          <CardHeader>
            <CardTitle className="text-xl flex items-center gap-2">
              <Plus className="w-5 h-5 text-primary" /> Create New Schedule
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <div className="flex flex-col md:flex-row gap-4">
                <div className="grid w-full md:w-[150px] items-center gap-1.5">
                  <Label htmlFor="amount" className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Amount ({activeOrg?.currencySymbol || "$"})</Label>
                  <Input 
                    id="amount" 
                    {...form.register("amount")} 
                    placeholder="1500.00" 
                    type="number" 
                    step="0.01" 
                    className="h-10" 
                    onWheel={(e) => e.currentTarget.blur()}
                  />
                  {form.formState.errors.amount && <p className="text-xs text-destructive font-medium">{form.formState.errors.amount.message}</p>}
                </div>

                <div className="flex-1 grid items-center gap-1.5">
                  <Label htmlFor="description">Description</Label>
                  <Input id="description" {...form.register("description")} placeholder="Monthly Office Rent" className="h-10" />
                  {form.formState.errors.description && <p className="text-xs text-destructive font-medium mt-1">{form.formState.errors.description.message}</p>}
                </div>
              </div>

              <div className="flex flex-col md:flex-row items-center md:items-end gap-2 md:gap-4">
                <div className="flex-1 grid items-center gap-1.5 w-full">
                  <Label>From Account (Credit)</Label>
                  <Controller
                    name="fromAccountId"
                    control={form.control}
                    render={({ field }) => (
                      <SearchableSelect
                        options={accounts}
                        value={field.value}
                        onValueChange={field.onChange}
                        placeholder="Select Account"
                        error={!!form.formState.errors.fromAccountId}
                      />
                    )}
                  />
                </div>

                <Button 
                  type="button" 
                  variant="ghost" 
                  size="icon" 
                  onClick={handleSwap}
                  className="mt-2 md:mt-0 md:mb-0.5 shrink-0"
                  title="Swap Accounts"
                >
                  <ArrowRightLeft className="h-4 w-4 rotate-90 md:rotate-0 text-muted-foreground" />
                </Button>

                <div className="flex-1 grid items-center gap-1.5 w-full">
                  <Label>To Account (Debit)</Label>
                  <Controller
                    name="toAccountId"
                    control={form.control}
                    render={({ field }) => (
                      <SearchableSelect
                        options={accounts}
                        value={field.value}
                        onValueChange={field.onChange}
                        placeholder="Select Account"
                        error={!!form.formState.errors.toAccountId}
                      />
                    )}
                  />
                </div>
              </div>

              <div className="flex flex-col md:flex-row justify-between gap-4">
                <div className="grid w-full md:w-[200px] items-center gap-1.5">
                  <Label>Frequency</Label>
                  <Controller
                    name="frequency"
                    control={form.control}
                    render={({ field }) => (
                      <Select onValueChange={field.onChange} value={field.value}>
                        <SelectTrigger className="h-10">
                          <SelectValue placeholder="Frequency">
                            {field.value ? field.value.charAt(0).toUpperCase() + field.value.slice(1) : undefined}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="daily">Daily</SelectItem>
                          <SelectItem value="weekly">Weekly</SelectItem>
                          <SelectItem value="monthly">Monthly</SelectItem>
                          <SelectItem value="yearly">Yearly</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                  />
                </div>

                <div className="grid w-full md:w-[200px] items-center gap-1.5">
                  <Label>Repeat Every</Label>
                  <div className="flex items-center gap-2">
                    <Input type="number" {...form.register("interval", { valueAsNumber: true })} className="h-10 w-full" />
                    <span className="text-sm text-muted-foreground capitalize whitespace-nowrap">
                      {{
                        daily: "Day",
                        weekly: "Week",
                        monthly: "Month",
                        yearly: "Year",
                      }[form.watch("frequency") as "daily" | "weekly" | "monthly" | "yearly"]}(s)
                    </span>
                  </div>
                </div>

                <div className="grid w-full md:w-[200px] items-center gap-1.5">
                  <Label htmlFor="startDate">Start Date</Label>
                  <Controller
                    name="startDate"
                    control={form.control}
                    render={({ field }) => (
                      <DatePicker
                        date={field.value ? parseISO(field.value) : undefined}
                        setDate={(d) => field.onChange(d ? format(d, "yyyy-MM-dd") : "")}
                        className="h-10 w-full"
                        placeholder="Select start date"
                      />
                    )}
                  />
                  {form.formState.errors.startDate && <p className="text-xs text-destructive font-medium">{form.formState.errors.startDate.message}</p>}
                </div>
              </div>

              <div className="grid items-center gap-1.5">
                <Label>Tags</Label>
                <Controller
                  name="tags"
                  control={form.control}
                  render={({ field }) => (
                    <TagSelector
                      value={field.value as string[] || []}
                      onChange={field.onChange}
                    />
                  )}
                />
              </div>

              <div className="pt-2">
                <Button className="h-11 w-full font-semibold shadow-sm" type="submit" disabled={createMutation.isPending}>
                  {createMutation.isPending ? "Creating..." : "Schedule Entry"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <Card className="border-border shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <CardTitle className="text-xl font-bold flex items-center gap-2">
            <RotateCw className="w-5 h-5 text-muted-foreground" /> Active Schedules
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader className="bg-muted/30">
                <TableRow>
                  <TableHead className="pl-6 py-4">Description</TableHead>
                  <TableHead className="py-4">Amount</TableHead>
                  <TableHead className="py-4">Accounts</TableHead>
                  <TableHead className="py-4">Schedule</TableHead>
                  <TableHead className="py-4">Next Process</TableHead>
                  <TableHead className="py-4">Status</TableHead>
                  <TableHead className="pr-6 py-4 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="h-40 text-center text-muted-foreground">
                      <div className="flex flex-col items-center gap-2">
                        <RotateCw className="w-8 h-8 opacity-20" />
                        <p>No recurring entries scheduled yet.</p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  entries.map((entry: any) => (
                    <TableRow key={entry.id} className="transition-colors group">
                      <TableCell className="pl-6 py-4 font-medium">{entry.description}</TableCell>
                      <TableCell className="py-4 font-semibold text-primary">{formatAmount(entry.amount)}</TableCell>
                      <TableCell className="py-4">
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] uppercase font-bold text-muted-foreground w-8">From</span>
                            <span className="text-sm text-foreground/80 truncate max-w-[120px]">{getAccountName(entry.fromAccountId)}</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] uppercase font-bold text-muted-foreground w-8">To</span>
                            <span className="text-sm text-foreground/80 truncate max-w-[120px]">{getAccountName(entry.toAccountId)}</span>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="py-4">
                        <div className="flex items-center gap-1.5 text-sm">
                          <span className="capitalize font-medium">
                            {entry.interval > 1 
                              ? `Every ${entry.interval} ${
                                {
                                  daily: "Days",
                                  weekly: "Weeks",
                                  monthly: "Months",
                                  yearly: "Years",
                                }[entry.frequency as "daily" | "weekly" | "monthly" | "yearly"]
                              }`
                              : `Every ${
                                {
                                  daily: "Day",
                                  weekly: "Week",
                                  monthly: "Month",
                                  yearly: "Year",
                                }[entry.frequency as "daily" | "weekly" | "monthly" | "yearly"]
                              }`
                            }
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="py-4">
                        <div className="flex flex-col">
                          <span className="text-sm font-medium">
                            {entry.nextProcessDate ? format(parseISO(entry.nextProcessDate), "MMM d, yyyy") : "N/A"}
                          </span>
                          {entry.lastProcessedDate && (
                            <span className="text-[10px] text-muted-foreground">Last: {format(parseISO(entry.lastProcessedDate), "MMM d")}</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="py-4">
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={entry.isActive}
                            onCheckedChange={(checked) => toggleMutation.mutate({ id: entry.id, isActive: checked })}
                            disabled={!canManage}
                            className="data-[state=checked]:bg-primary"
                          />
                          <span className={`text-[10px] font-bold uppercase tracking-wider ${entry.isActive ? 'text-primary' : 'text-muted-foreground'}`}>
                            {entry.isActive ? 'Active' : 'Paused'}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="pr-6 py-4 text-right">
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10 opacity-0 group-hover:opacity-100 transition-all"
                          onClick={() => setDeleteConfirmId(entry.id)} 
                          disabled={!canManage}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <AlertDialog open={!!deleteConfirmId} onOpenChange={() => setDeleteConfirmId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <div className="flex items-center gap-2 text-destructive mb-2">
              <AlertCircle className="w-5 h-5" />
              <AlertDialogTitle>Permanent Deletion</AlertDialogTitle>
            </div>
            <AlertDialogDescription>
              This will permanently delete this recurring schedule. No future transactions will be automatically created from this plan. Existing journal entries will not be affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90 text-destructive-foreground font-bold"
              onClick={() => deleteConfirmId && deleteMutation.mutate(deleteConfirmId)}
            >
              Delete Schedule
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
