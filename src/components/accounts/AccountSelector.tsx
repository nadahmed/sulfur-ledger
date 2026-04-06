"use client";

import { useState } from "react";
import { SearchableSelect } from "./SearchableSelect";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useOrganization } from "@/context/OrganizationContext";

interface Option {
  id: string;
  name: string;
}

interface AccountSelectorProps {
  options: Option[];
  value: string;
  onValueChange: (value: string) => void;
  placeholder: string;
  error?: boolean;
  disabled?: boolean;
  className?: string;
}

const CATEGORIES = [
  { label: "Asset", value: "asset" },
  { label: "Liability", value: "liability" },
  { label: "Equity", value: "equity" },
  { label: "Income", value: "income" },
  { label: "Expense", value: "expense" },
];

export function AccountSelector({
  options,
  value,
  onValueChange,
  placeholder,
  error,
  disabled,
  className,
}: AccountSelectorProps) {
  const { activeOrganizationId } = useOrganization();
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [category, setCategory] = useState<string>("asset");

  const createAccountMutation = useMutation({
    mutationFn: async (data: { name: string; category: string }) => {
      const res = await fetch("/api/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to create account");
      }
      return res.json();
    },
    onSuccess: (newAccount) => {
      queryClient.invalidateQueries({ queryKey: ["accounts", activeOrganizationId] });
      toast.success(`Account "${newAccount.name}" created successfully`);
      onValueChange(newAccount.id);
      setIsDialogOpen(false);
    },
    onError: (error: any) => {
      toast.error(error.message);
    },
  });

  const handleCreateTrigger = (name: string) => {
    setNewName(name);
    setIsDialogOpen(true);
  };

  const handleConfirmCreate = () => {
    if (!newName.trim() || !category) return;
    createAccountMutation.mutate({ name: newName, category });
  };

  return (
    <>
      <SearchableSelect
        options={options}
        value={value}
        onValueChange={onValueChange}
        placeholder={placeholder}
        error={error}
        disabled={disabled}
        className={className}
        onCreate={handleCreateTrigger}
      />

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Create New Account</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="account-name" className="text-right">
                Name
              </Label>
              <Input
                id="account-name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="col-span-3"
                placeholder="Checking, Salary, etc."
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="account-category" className="text-right">
                Category
              </Label>
              <div className="col-span-3">
                <Select value={category} onValueChange={(val) => val && setCategory(val)}>
                  <SelectTrigger id="account-category">
                    <SelectValue placeholder="Select category">
                      {CATEGORIES.find((c) => c.value === category)?.label}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((cat) => (
                      <SelectItem key={cat.value} value={cat.value}>
                        {cat.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsDialogOpen(false)}
              disabled={createAccountMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={handleConfirmCreate}
              disabled={!newName.trim() || createAccountMutation.isPending}
            >
              {createAccountMutation.isPending ? "Creating..." : "Create Account"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
