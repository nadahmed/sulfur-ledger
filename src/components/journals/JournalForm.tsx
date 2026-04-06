"use client";

import { useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { JournalEntrySchema, JournalEntryFormInput } from "@/lib/schemas";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/accounts/SearchableSelect";
import { ArrowRightLeft } from "lucide-react";
import { TagSelector } from "@/components/journals/TagSelector";

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
}

export function JournalForm({
  accounts,
  initialValues,
  onSubmit,
  onCancel,
  isPending,
  submitLabel,
  onSuccess,
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
      reset(initialValues);
      if (onSuccess) onSuccess();
    } catch (err) {
      // Error handled by parent
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmitWithReset)} className="flex flex-col gap-6">
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
          <Label htmlFor="description">Description</Label>
          <Input
            id="description"
            {...register("description")}
            placeholder="Transaction description..."
            className={errors.description ? "border-red-500" : ""}
          />
        </div>
      </div>

      <div className="flex flex-col md:flex-row items-center md:items-end gap-2 md:gap-4">
        <div className="grid w-full flex-1 items-center gap-1.5">
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

        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={handleSwap}
          className="mt-2 md:mt-0 md:mb-0.5 shrink-0"
          title="Swap Accounts"
        >
          <ArrowRightLeft className="h-4 w-4 rotate-90 md:rotate-0 text-neutral-500" />
        </Button>

        <div className="grid w-full flex-1 items-center gap-1.5">
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
        <div className="grid flex-1 items-center gap-1.5">
          <Label htmlFor="tags">Tags</Label>
          <Controller
            name="tags"
            control={control}
            render={({ field }) => (
              <TagSelector
                value={field.value as string[] || []}
                onChange={field.onChange}
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
        <div className="text-red-500 text-sm flex flex-col gap-1">
          {Object.values(errors).map((err, i) => (
            <p key={i}>{typeof err?.message === 'string' ? err.message : 'Invalid input'}</p>
          ))}
        </div>
      )}
    </form>
  );
}
