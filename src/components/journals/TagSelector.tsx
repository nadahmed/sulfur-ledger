"use client";

import { useState, useEffect, useCallback } from "react";
import { Check, Plus, X, Tag as TagIcon, Palette } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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

interface Tag {
  id: string;
  name: string;
  color: string;
  description?: string;
}

interface TagSelectorProps {
  value: string[]; // Tag IDs
  onChange: (value: string[]) => void;
}

const PREDEFINED_COLORS = [
  "#ef4444", "#f97316", "#f59e0b", "#eab308", "#84cc16", "#22c55e",
  "#10b981", "#06b6d4", "#0ea5e9", "#3b82f6", "#6366f1", "#8b5cf6",
  "#a855f7", "#d946ef", "#ec4899", "#f43f5e", "#71717a", "#4b5563"
];

export function TagSelector({ value = [], onChange }: TagSelectorProps) {
  const [open, setOpen] = useState(false);
  const [tags, setTags] = useState<Tag[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [newTagName, setNewTagName] = useState("");
  const [newTagColor, setNewTagColor] = useState(PREDEFINED_COLORS[0]);

  const fetchTags = useCallback(async () => {
    try {
      const res = await fetch("/api/tags");
      if (res.ok) {
        const data = await res.ok ? await res.json() : [];
        setTags(data);
      }
    } catch (err) {
      console.error("Failed to fetch tags", err);
    }
  }, []);

  useEffect(() => {
    fetchTags();
  }, [fetchTags]);

  const handleSelect = (tagId: string) => {
    const newValue = value.includes(tagId)
      ? value.filter((id) => id !== tagId)
      : [...value, tagId];
    onChange(newValue);
  };

  const selectedTags = tags.filter((t) => value.includes(t.id));

  const handleCreateTag = async () => {
    if (!newTagName.trim()) return;

    try {
      const res = await fetch("/api/tags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newTagName, color: newTagColor }),
      });

      if (res.ok) {
        const newTag = await res.json();
        setTags([...tags, newTag]);
        handleSelect(newTag.id);
        setIsCreating(false);
        setNewTagName("");
        setSearchTerm("");
      }
    } catch (err) {
      console.error("Failed to create tag", err);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-1.5 min-h-[32px]">
        {selectedTags.length > 0 ? (
          selectedTags.map((tag) => (
            <Badge
              key={tag.id}
              style={{ backgroundColor: tag.color, color: "#fff", border: "none" }}
              className="flex items-center gap-1 pr-1"
            >
              {tag.name}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleSelect(tag.id);
                }}
                className="hover:bg-white/20 rounded-full p-0.5"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))
        ) : (
          <span className="text-sm text-neutral-500 italic">No tags selected</span>
        )}
      </div>

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          role="combobox"
          className="w-full h-8 justify-start text-neutral-500 font-normal border rounded-md px-3 flex items-center hover:bg-neutral-50 transition-colors"
        >
          <Plus className="mr-2 h-4 w-4" />
          Add tag...
        </PopoverTrigger>
        <PopoverContent className="w-[300px] p-0" align="start">
          <Command>
            <CommandInput 
              placeholder="Search or create tag..." 
              value={searchTerm}
              onValueChange={setSearchTerm}
            />
            <CommandList>
              <CommandEmpty>
                {searchTerm.trim().length > 0 ? (
                  <div className="p-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-full justify-start gap-2 text-primary"
                      onClick={() => {
                        setNewTagName(searchTerm);
                        setIsCreating(true);
                        setOpen(false);
                      }}
                    >
                      <Plus className="h-4 w-4" />
                      Create "{searchTerm}"
                    </Button>
                  </div>
                ) : (
                  <div className="p-4 text-center text-sm text-neutral-500 italic">
                    Type to find or create tags...
                  </div>
                )}
              </CommandEmpty>
              <CommandGroup>
                {tags.map((tag) => (
                  <CommandItem
                    key={tag.id}
                    value={tag.name}
                    onSelect={() => handleSelect(tag.id)}
                  >
                    <div
                      className="w-3 h-3 rounded-full mr-2"
                      style={{ backgroundColor: tag.color }}
                    />
                    <span className="flex-1">{tag.name}</span>
                    {value.includes(tag.id) && <Check className="h-4 w-4" />}
                  </CommandItem>
                ))}
              </CommandGroup>
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
                    <button
                      key={color}
                      type="button"
                      className={cn(
                        "w-8 h-8 rounded-full border-2 transition-transform hover:scale-110",
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
