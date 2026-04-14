"use client";

import { useState } from "react";
import { Check, Plus, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

interface Tag {
  id: string;
  name: string;
  color: string;
  description?: string;
}

interface TagSelectorProps {
  value: string[]; // Tag IDs
  onChange: (value: string[]) => void;
  activeOrganizationId?: string | null;
  className?: string;
  buttonClassName?: string;
}

const PREDEFINED_COLORS = [
  "#ef4444", "#f97316", "#f59e0b", "#eab308", "#84cc16", "#22c55e",
  "#10b981", "#06b6d4", "#0ea5e9", "#3b82f6", "#6366f1", "#8b5cf6",
  "#a855f7", "#d946ef", "#ec4899", "#f43f5e", "#71717a", "#4b5563"
];

export function TagSelector({ value = [], onChange, activeOrganizationId, className, buttonClassName }: TagSelectorProps) {
  const [open, setOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [newTagName, setNewTagName] = useState("");
  const [newTagColor, setNewTagColor] = useState(PREDEFINED_COLORS[0]);

  const queryClient = useQueryClient();

  const { data: tags = [] } = useQuery<Tag[]>({
    queryKey: ["tags", activeOrganizationId],
    queryFn: async () => {
      const res = await fetch("/api/tags", {
        headers: { "x-org-id": activeOrganizationId || "" }
      });
      if (!res.ok) throw new Error("Failed to fetch tags");
      return res.json();
    },
    enabled: !!activeOrganizationId,
  });

  const createTagMutation = useMutation({
    mutationFn: async (newTag: { name: string; color: string }) => {
      const res = await fetch("/api/tags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newTag),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to create tag");
      }
      return res.json();
    },
    onSuccess: (newTag) => {
      queryClient.invalidateQueries({ queryKey: ["tags", activeOrganizationId] });
      handleSelect(newTag.id);
      setIsCreating(false);
      setNewTagName("");
      setSearchTerm("");
    },
  });

  const handleSelect = (tagId: string) => {
    const newValue = value.includes(tagId)
      ? value.filter((id) => id !== tagId)
      : [...value, tagId];
    onChange(newValue);
  };

  const selectedTags = tags.filter((t) => value.includes(t.id));

  const handleCreateTag = async () => {
    if (!newTagName.trim()) return;
    createTagMutation.mutate({ name: newTagName, color: newTagColor });
  };

  const exactMatch = tags.some(t => t.name.toLowerCase() === searchTerm.toLowerCase());
  const showCreate = searchTerm.trim().length >= 2 && searchTerm.trim().length <= 100 && !exactMatch;

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          className={cn(
            buttonVariants({ variant: "outline", size: "default" }),
            "w-full justify-start text-muted-foreground font-normal border-border h-9 text-xs py-0 px-2",
            buttonClassName
          )}
        >
          <div className="flex items-center gap-1 overflow-hidden">
            <Plus className="mr-1 h-3 w-3 shrink-0" />
            {selectedTags.length > 0 ? (
              <div className="flex items-center gap-1 overflow-hidden">
                {selectedTags.slice(0, 2).map((tag) => (
                  <Badge
                    key={tag.id}
                    style={{ backgroundColor: tag.color, color: "#fff", border: "none" }}
                    className="h-5 px-1.5 text-[10px] whitespace-nowrap"
                  >
                    {tag.name}
                  </Badge>
                ))}
                {selectedTags.length > 2 && (
                  <span className="text-[10px] text-muted-foreground">
                    +{selectedTags.length - 2}
                  </span>
                )}
              </div>
            ) : (
              <span>Add tags...</span>
            )}
          </div>
        </PopoverTrigger>
        <PopoverContent className="w-[300px] p-0" align="start">
          <Command shouldFilter={false}>
            <CommandInput 
              placeholder="Search or create tag..." 
              value={searchTerm}
              onValueChange={setSearchTerm}
            />
            <CommandList>
              {searchTerm && !tags.some(t => t.name.toLowerCase().includes(searchTerm.toLowerCase())) && (
                <CommandEmpty>No tags found.</CommandEmpty>
              )}
              
              {showCreate && (
                <CommandGroup heading="New Tag">
                  <CommandItem
                    onSelect={() => {
                      setNewTagName(searchTerm);
                      setIsCreating(true);
                      setOpen(false);
                    }}
                    className="flex items-center gap-2 text-primary font-medium cursor-pointer"
                  >
                    <Plus className="h-4 w-4" />
                    <span>Create "{searchTerm}"</span>
                  </CommandItem>
                </CommandGroup>
              )}

              {tags.filter(t => t.name.toLowerCase().includes(searchTerm.toLowerCase())).length > 0 && (
                <CommandGroup heading="Existing Tags">
                  {tags
                    .filter(t => t.name.toLowerCase().includes(searchTerm.toLowerCase()))
                    .map((tag) => (
                      <CommandItem
                        key={tag.id}
                        value={tag.id}
                        onSelect={() => handleSelect(tag.id)}
                        className="flex items-center gap-2 cursor-pointer"
                      >
                        <div
                          className="w-3 h-3 rounded-full shrink-0"
                          style={{ backgroundColor: tag.color }}
                        />
                        <span className="flex-1 truncate">{tag.name}</span>
                        {value.includes(tag.id) && (
                          <Check className="h-4 w-4 text-primary shrink-0" />
                        )}
                      </CommandItem>
                    ))}
                </CommandGroup>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      <Dialog open={isCreating} onOpenChange={setIsCreating}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Create New Tag</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="name" className="text-right">
                Name
              </Label>
              <Input
                id="name"
                value={newTagName}
                onChange={(e) => setNewTagName(e.target.value)}
                className="col-span-3"
                placeholder="Marketing, Project X, etc."
              />
            </div>
            <div className="grid grid-cols-4 items-start gap-4">
              <Label className="text-right pt-2">Color</Label>
              <div className="col-span-3 flex flex-col gap-3">
                <div className="grid grid-cols-6 gap-2">
                  {PREDEFINED_COLORS.map((color) => (
                    <Button
                      key={color}
                      type="button"
                      variant="outline"
                      size="icon-xs"
                      className={cn(
                        "w-8 h-8 rounded-full border-2 transition-transform hover:scale-110 p-0",
                        newTagColor === color ? "border-white ring-2 ring-primary ring-offset-2" : "border-transparent"
                      )}
                      style={{ backgroundColor: color }}
                      onClick={() => setNewTagColor(color)}
                    />
                  ))}
                </div>
                <div className="flex items-center gap-2 mt-2">
                  <Label htmlFor="custom-color" className="text-xs whitespace-nowrap">Custom Color:</Label>
                  <Input
                    id="custom-color"
                    type="color"
                    value={newTagColor}
                    onChange={(e) => setNewTagColor(e.target.value)}
                    className="w-12 h-8 p-1 cursor-pointer"
                  />
                  <span className="text-xs font-mono uppercase">{newTagColor}</span>
                </div>
              </div>
            </div>
            <div className="flex justify-center pt-2">
              <Badge
                style={{ backgroundColor: newTagColor, color: "#fff", border: "none" }}
                className="px-4 py-1 text-sm font-medium"
              >
                Preview: {newTagName || "Tag Name"}
              </Badge>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreating(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateTag} disabled={!newTagName.trim()}>
              Create Tag
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
