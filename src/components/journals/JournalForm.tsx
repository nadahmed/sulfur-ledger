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
import { parseISO, format } from "date-fns";
import { DatePicker } from "@/components/ui/date-picker";
import { TagSelector } from "@/components/journals/TagSelector";
import { ArrowRightLeft, FileUp, Paperclip, X, Loader2, FileIcon, ImageIcon } from "lucide-react";
import { toast } from "sonner";

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

  const [isUploading, setIsUploading] = useState(false);
  const [uploadedReceipt, setUploadedReceipt] = useState<any>(initialValues.receipt || undefined);

  const fromAccountId = watch("fromAccountId");
  const toAccountId = watch("toAccountId");

  const handleSwap = () => {
    setValue("fromAccountId", toAccountId);
    setValue("toAccountId", fromAccountId);
  };

  const onSubmitWithReset = async (values: JournalEntryFormInput) => {
    try {
      await onSubmit({ ...values, receipt: uploadedReceipt });
      reset({
        ...initialValues,
        date: values.date,
      });
      setUploadedReceipt(undefined);
      if (onSuccess) onSuccess();
    } catch (err) {
      // Error handled by parent
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      toast.error("File size must be less than 5MB");
      return;
    }

    try {
      setIsUploading(true);

      // 1. Get presigned URL
      const res = await fetch(`/api/receipts/presigned-url?orgId=${activeOrganizationId}&fileName=${encodeURIComponent(file.name)}&contentType=${encodeURIComponent(file.type)}`);
      if (!res.ok) throw new Error("Failed to get upload URL");
      const { url, fields, fullKey, provider } = await res.json();

      // 2. Upload to S3/Cloudinary
      if (provider === "s3") {
        const uploadRes = await fetch(url, {
          method: "PUT",
          body: file,
          headers: { "Content-Type": file.type }
        });

        if (!uploadRes.ok) {
          const errorText = await uploadRes.text();
          console.error("Upload failed:", errorText);
          throw new Error(`Upload failed to S3: ${uploadRes.statusText}`);
        }
      } else {
        // Cloudinary signed upload
        const formData = new FormData();
        Object.entries(fields).forEach(([k, v]) => formData.append(k, v as string));
        formData.append("file", file);

        const uploadRes = await fetch(url, {
          method: "POST",
          body: formData,
        });
        if (!uploadRes.ok) throw new Error("Upload failed to Cloudinary");
      }

      setUploadedReceipt({
        key: fullKey,
        provider,
        contentType: file.type
      });
      toast.success("Receipt uploaded!");
    } catch (err: any) {
      toast.error(`Upload error: ${err.message}`);
    } finally {
      setIsUploading(false);
      // Reset input
      e.target.value = "";
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

      {activeOrganizationId && (
        <div className="space-y-2">
          <Label className="text-sm font-medium flex items-center gap-2">
            <Paperclip className="w-4 h-4 text-muted-foreground" />
            Receipt (Image or PDF)
          </Label>
          <div className="flex flex-col gap-3">
            {uploadedReceipt ? (
              <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg border border-border animate-in fade-in zoom-in-95 duration-200">
                <div className="flex items-center gap-3 overflow-hidden">
                  <div className="w-10 h-10 flex items-center justify-center bg-card rounded-md border border-border/50 shrink-0">
                    {uploadedReceipt.contentType?.includes("image") ? (
                      <ImageIcon className="w-5 h-5 text-primary/70" />
                    ) : (
                      <FileIcon className="w-5 h-5 text-primary/70" />
                    )}
                  </div>
                  <div className="flex flex-col min-w-0">
                    <span className="text-sm font-semibold truncate max-w-[200px] sm:max-w-[400px]">
                      {uploadedReceipt.key.split("/").pop()}
                    </span>
                    <span className="text-[10px] text-muted-foreground uppercase tracking-tight">
                      Stored via {uploadedReceipt.provider}
                    </span>
                  </div>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                  onClick={() => setUploadedReceipt(undefined)}
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            ) : (
              <div className="relative">
                <Input
                  type="file"
                  id="receipt-upload"
                  className="hidden"
                  accept="image/*,application/pdf"
                  onChange={handleFileUpload}
                  disabled={isUploading}
                />
                <Button
                  type="button"
                  variant="outline"
                  className="w-full h-12 border-dashed border-2 hover:border-primary/50 hover:bg-primary/5 transition-all group"
                  onClick={() => document.getElementById("receipt-upload")?.click()}
                  disabled={isUploading}
                >
                  {isUploading ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin text-primary" />
                  ) : (
                    <FileUp className="w-4 h-4 mr-2 text-muted-foreground group-hover:text-primary transition-colors" />
                  )}
                  {isUploading ? "Uploading..." : "Click to select Receipt (Max 5MB)"}
                </Button>
              </div>
            )}
          </div>
        </div>
      )}

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
