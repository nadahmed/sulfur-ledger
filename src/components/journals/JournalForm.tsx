"use client";

import { useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { JournalEntrySchema, JournalEntryFormInput } from "@/lib/schemas";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AccountSelector } from "@/components/accounts/AccountSelector";
import { ArrowRightLeft, Calendar as CalendarIcon } from "lucide-react";
import { TagSelector } from "@/components/journals/TagSelector";
import { DatePicker } from "@/components/ui/date-picker";
import { parseISO, format } from "date-fns";

interface Account {
  id: string;
  name: string;
}

interface JournalFormProps {
  accounts: Account[];
  initialValues: JournalEntryFormInput;
  onSubmit: (values: any) => Promise<void> | void;
  onCancel?: () => void;
  isPending: boolean;
  submitLabel: string;
  onSuccess?: () => void;
  activeOrganizationId?: string | null;
}

export function JournalForm({
  accounts,
  initialValues,
  onSubmit,
  onCancel,
  isPending,
  submitLabel,
  onSuccess,
  activeOrganizationId,
}: JournalFormProps) {
  const {
    register,
    handleSubmit,
    control,
    setValue,
    watch,
    reset,
    formState: { errors },
  } = useForm<JournalEntryFormInput>({
    resolver: zodResolver(JournalEntrySchema),
    defaultValues: initialValues,
  });

  const fromAccountId = watch("fromAccountId");
  const toAccountId = watch("toAccountId");

  const handleSwap = () => {
    setValue("fromAccountId", toAccountId);
    setValue("toAccountId", fromAccountId);
  };

  const onSubmitWithReset = async (values: JournalEntryFormInput) => {
    try {
      await onSubmit(values);
      reset({
        ...initialValues,
        date: values.date,
      });
      if (onSuccess) onSuccess();
    } catch (err) {
      // Error handled by parent
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmitWithReset)} className="flex flex-col gap-6">
      <div className="flex flex-col md:flex-row gap-4">
        <div className="grid w-full md:w-[170px] items-center gap-1.5">
          <Label htmlFor="date">Date</Label>
          <Controller
            name="date"
            control={control}
            render={({ field }) => (
              <DatePicker
                date={field.value ? parseISO(field.value) : undefined}
                setDate={(d) => field.onChange(d ? format(d, "yyyy-MM-dd") : "")}
                className={cn("w-full h-10", errors.date && "border-red-500")}
                placeholder="Select date"
              />
            )}
          />
          {errors.date && <p className="text-xs text-destructive font-medium mt-1">{errors.date.message}</p>}
        </div>
        <div className="grid w-full md:w-[150px] items-center gap-1.5">
          <Label htmlFor="amount">Amount</Label>
          <Input
            type="number"
            step="0.01"
            min="0.01"
            id="amount"
            {...register("amount")}
            placeholder="0.00"
            aria-invalid={!!errors.amount}
            className="h-10"
            onWheel={(e) => e.currentTarget.blur()}
          />
          {errors.amount && <p className="text-xs text-destructive font-medium mt-1">{errors.amount.message}</p>}
        </div>
        <div className="grid flex-1 items-center gap-1.5">
          <Label htmlFor="description">Description</Label>
          <Input
            id="description"
            {...register("description")}
            placeholder="Transaction description..."
            aria-invalid={!!errors.description}
            className="h-10"
          />
          {errors.description && <p className="text-xs text-destructive font-medium mt-1">{errors.description.message}</p>}
        </div>
      </div>

      <div className="flex flex-col md:flex-row items-center md:items-end gap-2 md:gap-4">
        <div className="grid w-full flex-1 items-center gap-1.5">
          <Label htmlFor="fromAccountId">From Account (Credit)</Label>
          <Controller
            name="fromAccountId"
            control={control}
            render={({ field }) => (
              <AccountSelector
                options={accounts}
                value={field.value}
                onValueChange={field.onChange}
                placeholder="Select Credit Account"
                error={!!errors.fromAccountId}
              />
            )}
          />
          {errors.fromAccountId && <p className="text-xs text-destructive font-medium mt-1">{errors.fromAccountId.message}</p>}
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

        <div className="grid w-full flex-1 items-center gap-1.5">
          <Label htmlFor="toAccountId">To Account (Debit)</Label>
          <Controller
            name="toAccountId"
            control={control}
            render={({ field }) => (
              <AccountSelector
                options={accounts}
                value={field.value}
                onValueChange={field.onChange}
                placeholder="Select Debit Account"
                error={!!errors.toAccountId}
              />
            )}
          />
          {errors.toAccountId && <p className="text-xs text-destructive font-medium mt-1">{errors.toAccountId.message}</p>}
        </div>
      </div>

      <div className="flex gap-4">
        <div className="grid flex-1 items-center gap-1.5">
          <Label htmlFor="tags">Tags</Label>
          <Controller
            name="tags"
            control={control}
            render={({ field }) => (
              <TagSelector
                value={field.value as string[] || []}
                onChange={field.onChange}
                activeOrganizationId={activeOrganizationId}
              />
            )}
          />
        </div>
      </div>

      <div className="flex gap-3">
        <Button type="submit" className="flex-1" disabled={isPending}>
          {isPending ? "Processing..." : submitLabel}
        </Button>
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        )}
      </div>

      {Object.keys(errors).length > 0 && (
        <div className="bg-destructive/10 border border-destructive/20 p-4 rounded-lg">
          <p className="text-sm font-semibold text-destructive mb-2">
            Please fix the following errors:
          </p>
          <ul className="list-disc pl-5 text-xs text-destructive/90 space-y-1">
            {Object.values(errors).map((error: any, i) => (
              <li key={i}>{error.message}</li>
            ))}
          </ul>
        </div>
      )}
    </form>
  );
}
