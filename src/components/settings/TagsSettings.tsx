"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Edit2, Trash2, Plus, Palette, Loader2, Tag as TagIcon, Search, MoreHorizontal } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

interface Tag {
  id: string;
  name: string;
  color: string;
  description?: string;
}

const PREDEFINED_COLORS = [
  "#ef4444", "#f97316", "#f59e0b", "#eab308", "#84cc16", "#22c55e",
  "#10b981", "#06b6d4", "#0ea5e9", "#3b82f6", "#6366f1", "#8b5cf6",
  "#a855f7", "#d946ef", "#ec4899", "#f43f5e", "#71717a", "#4b5563"
];

interface TagsSettingsProps {
  orgId: string;
  canManage: boolean;
}

export function TagsSettings({ orgId, canManage }: TagsSettingsProps) {
  const queryClient = useQueryClient();
  const [editingTag, setEditingTag] = useState<Tag | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  
  const [tagName, setTagName] = useState("");
  const [tagColor, setTagColor] = useState(PREDEFINED_COLORS[0]);
  const [tagDesc, setTagDesc] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 10;

  const { data: tags = [], isLoading } = useQuery<Tag[]>({
    queryKey: ["tags", orgId],
    queryFn: async () => {
      const res = await fetch("/api/tags");
      if (!res.ok) throw new Error("Failed to fetch tags");
      return res.json();
    },
  });

  const createTagMutation = useMutation({
    mutationFn: async (newTag: { name: string; color: string; description?: string }) => {
      const res = await fetch("/api/tags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newTag),
      });
      if (!res.ok) throw new Error("Failed to create tag");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tags", orgId] });
      toast.success("Tag created successfully");
      setIsCreating(false);
      resetForm();
    },
    onError: (err: any) => toast.error(err.message),
  });

  const updateTagMutation = useMutation({
    mutationFn: async (updatedTag: { id: string; name: string; color: string; description?: string }) => {
      const res = await fetch(`/api/tags/${updatedTag.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updatedTag),
      });
      if (!res.ok) throw new Error("Failed to update tag");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tags", orgId] });
      toast.success("Tag updated successfully");
      setEditingTag(null);
      resetForm();
    },
    onError: (err: any) => toast.error(err.message),
  });

  const deleteTagMutation = useMutation({
    mutationFn: async (tagId: string) => {
      const res = await fetch(`/api/tags/${tagId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete tag");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tags", orgId] });
      toast.success("Tag deleted successfully");
    },
    onError: (err: any) => toast.error(err.message),
  });

  const resetForm = () => {
    setTagName("");
    setTagColor(PREDEFINED_COLORS[0]);
    setTagDesc("");
  };

  const handleEdit = (tag: Tag) => {
    setEditingTag(tag);
    setTagName(tag.name);
    setTagColor(tag.color);
    setTagDesc(tag.description || "");
  };

  const handleSave = () => {
    if (!tagName.trim()) return;
    
    if (editingTag) {
      updateTagMutation.mutate({
        id: editingTag.id,
        name: tagName,
        color: tagColor,
        description: tagDesc,
      });
    } else {
      createTagMutation.mutate({
        name: tagName,
        color: tagColor,
        description: tagDesc,
      });
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-12 text-neutral-500">
        <Loader2 className="w-6 h-6 animate-spin mr-2" />
        Loading tags...
      </div>
    );
  }

  const filteredTags = tags.filter(t => 
    t.name.toLowerCase().includes(search.toLowerCase()) || 
    (t.description || "").toLowerCase().includes(search.toLowerCase())
  );

  const totalPages = Math.ceil(filteredTags.length / pageSize);
  const paginatedTags = filteredTags.slice((page - 1) * pageSize, page * pageSize);

  const handleSearchChange = (val: string) => {
    setSearch(val);
    setPage(1);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input 
              placeholder="Search tags..." 
              value={search}
              onChange={(e) => handleSearchChange(e.target.value)}
              className="pl-9 h-10 border-border shadow-sm"
            />
          </div>
        </div>
        {canManage && (
          <Button onClick={() => { resetForm(); setIsCreating(true); }} className="gap-2 h-10 px-6 shadow-sm">
            <Plus className="w-4 h-4" /> Create Tag
          </Button>
        )}
      </div>

      <div className="rounded-xl border border-border bg-card overflow-hidden shadow-sm">
        <Table>
          <TableHeader className="bg-muted/30">
            <TableRow>
              <TableHead className="w-[200px]">Tag</TableHead>
              <TableHead>Description</TableHead>
              {canManage && <TableHead className="w-[100px] text-right">Actions</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredTags.length === 0 ? (
              <TableRow>
                <TableCell colSpan={canManage ? 3 : 2} className="h-32 text-center text-neutral-500 italic">
                  {search ? "No tags match your search." : "No tags created yet."}
                </TableCell>
              </TableRow>
            ) : (
              paginatedTags.map((tag) => (
                <TableRow key={tag.id} className="group transition-colors">
                  <TableCell>
                    <Badge 
                      style={{ backgroundColor: tag.color, color: "#fff", border: "none" }}
                      className="text-xs font-medium px-2.5 py-0.5 shadow-sm"
                    >
                      {tag.name}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-foreground/80 text-sm">
                    {tag.description || <span className="text-muted-foreground/50">No description</span>}
                  </TableCell>
                  {canManage && (
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-8 w-8 text-muted-foreground hover:text-primary"
                          onClick={() => handleEdit(tag)}
                        >
                          <Edit2 className="h-3.5 w-3.5" />
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-8 w-8 text-muted-foreground hover:text-red-500"
                          onClick={() => {
                            if (confirm(`Are you sure you want to delete the tag "${tag.name}"?`)) {
                              deleteTagMutation.mutate(tag.id);
                            }
                          }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between px-2 py-4 border-t border-border bg-muted/20 rounded-xl">
          <div className="text-sm text-muted-foreground">
            Showing <span className="font-medium text-foreground">{paginatedTags.length}</span> of <span className="font-medium text-foreground">{filteredTags.length}</span> tags
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-8"
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
            >
              Previous
            </Button>
            <div className="text-sm font-medium px-2">
              Page {page} of {totalPages}
            </div>
            <Button
              variant="outline"
              size="sm"
              className="h-8"
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
            >
              Next
            </Button>
          </div>
        </div>
      )}

      <Dialog open={isCreating || !!editingTag} onOpenChange={(open) => {
        if (!open) {
          setIsCreating(false);
          setEditingTag(null);
        }
      }}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>{editingTag ? "Edit Tag" : "Create New Tag"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="tag-name">Name</Label>
              <Input
                id="tag-name"
                value={tagName}
                onChange={(e) => setTagName(e.target.value)}
                placeholder="Marketing, Project X, etc."
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tag-desc">Description (Optional)</Label>
              <Input
                id="tag-desc"
                value={tagDesc}
                onChange={(e) => setTagDesc(e.target.value)}
                placeholder="Brief description of when to use this tag..."
              />
            </div>
            <div className="space-y-3">
              <Label>Color</Label>
              <div className="flex flex-col gap-3">
                <div className="grid grid-cols-6 gap-2">
                  {PREDEFINED_COLORS.map((color) => (
                    <button
                      key={color}
                      type="button"
                      className={cn(
                        "w-8 h-8 rounded-full border-2 transition-transform hover:scale-110",
                        tagColor === color ? "border-white ring-2 ring-primary ring-offset-2" : "border-transparent"
                      )}
                      style={{ backgroundColor: color }}
                      onClick={() => setTagColor(color)}
                    />
                  ))}
                </div>
                <div className="flex items-center gap-2 mt-2">
                  <Label htmlFor="custom-color-settings" className="text-xs whitespace-nowrap">Custom Color:</Label>
                  <Input
                    id="custom-color-settings"
                    type="color"
                    value={tagColor}
                    onChange={(e) => setTagColor(e.target.value)}
                    className="w-12 h-8 p-1 cursor-pointer"
                  />
                  <span className="text-xs font-mono uppercase">{tagColor}</span>
                </div>
              </div>
            </div>
            <div className="flex justify-center pt-4 border-t">
               <div className="text-center">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2 font-bold">Preview</p>
                  <Badge
                    style={{ backgroundColor: tagColor, color: "#fff", border: "none" }}
                    className="px-4 py-1 text-sm font-medium"
                  >
                    {tagName || "Tag Name"}
                  </Badge>
               </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setIsCreating(false); setEditingTag(null); }}>
              Cancel
            </Button>
            <Button 
              onClick={handleSave} 
              disabled={!tagName.trim() || createTagMutation.isPending || updateTagMutation.isPending}
            >
              {(createTagMutation.isPending || updateTagMutation.isPending) ? "Saving..." : "Save Tag"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
