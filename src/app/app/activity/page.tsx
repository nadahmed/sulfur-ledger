"use client";

import React, { useEffect, useState, useCallback } from "react";
import { useOrganization } from "@/context/OrganizationContext";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { format, parseISO } from "date-fns";
import { 
  History, 
  CheckCircle2, 
  XCircle, 
  User, 
  Bot, 
  Activity, 
  Search, 
  FilterX, 
  Globe, 
  Monitor,
  Loader2,
  RefreshCw,
  ChevronRight,
  ChevronDown,
  Database,
  Download,
  Terminal
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

interface ActivityLog {
  id: string;
  type: "mcp" | "ui";
  toolName?: string;
  action?: string;
  entityType?: string;
  entityId?: string;
  input?: string;
  details?: string;
  changes?: Record<string, { old: any; new: any }>;
  data?: any;
  status?: "success" | "error";
  error?: string;
  timestamp: string;
  userName?: string;
  ipAddress?: string;
  userAgent?: string;
}

export default function ActivityPage() {
  const { activeOrganizationId } = useOrganization();
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  // Filters
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<string>("all");
  const [filterUser, setFilterUser] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");

  const fetchLogs = useCallback(async (isLoadMore = false) => {
    if (!activeOrganizationId) return;
    
    if (isLoadMore && !nextCursor) return;

    if (!isLoadMore) setLoading(true);
    else setRefreshing(true);

    try {
      const params = new URLSearchParams({
        orgId: activeOrganizationId,
        limit: "20",
      });

      if (isLoadMore && nextCursor) params.append("cursor", nextCursor);
      if (search) params.append("search", search);
      if (filterType !== "all") params.append("type", filterType);
      if (filterUser !== "all") params.append("userId", filterUser);
      if (dateFrom) params.append("from", dateFrom);
      if (dateTo) params.append("to", dateTo);

      const res = await fetch(`/api/activity?${params.toString()}`);
      const data = await res.json();

      if (isLoadMore) {
        setLogs(prev => [...prev, ...data.logs]);
      } else {
        setLogs(data.logs);
      }
      setNextCursor(data.nextCursor);
    } catch (err) {
      console.error("Failed to fetch logs:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [activeOrganizationId, search, filterType, filterUser, dateFrom, dateTo, nextCursor]);

  useEffect(() => {
    fetchLogs(false);
  }, [activeOrganizationId, search, filterType, filterUser, dateFrom, dateTo]);

  const toggleRow = (id: string) => {
    const newExpanded = new Set(expandedRows);
    if (newExpanded.has(id)) newExpanded.delete(id);
    else newExpanded.add(id);
    setExpandedRows(newExpanded);
  };

  const renderStatus = (log: ActivityLog) => {
    if (log.type === "mcp") {
      if (log.status === "success") {
        return (
          <Badge className="gap-1 bg-green-500/10 text-green-600 border-green-500/20">
            <CheckCircle2 className="size-3" /> Success
          </Badge>
        );
      }
      return (
        <Badge variant="destructive" className="gap-1 bg-destructive/10 text-destructive border-destructive/20">
          <XCircle className="size-3" /> Error
        </Badge>
      );
    }
    return (
      <Badge variant="secondary" className="gap-1 bg-blue-500/10 text-blue-600 border-blue-500/20">
        <Activity className="size-3" /> Recorded
      </Badge>
    );
  };

  const renderAction = (log: ActivityLog) => {
    if (log.type === "mcp") {
      return (
        <div className="flex items-center gap-2">
          <code className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-mono text-primary font-bold uppercase tracking-tight">
            {log.toolName}
          </code>
        </div>
      );
    }

    if (log.action === "export") {
        return (
          <div className="flex flex-col">
            <span className="text-xs font-bold uppercase tracking-wide text-blue-600 flex items-center gap-1.5">
              <Download className="size-3" /> Exported Data
            </span>
            <span className="text-[10px] text-muted-foreground mt-0.5">
              {log.details}
            </span>
          </div>
        );
    }
    
    const actionLabel = log.action ? log.action.charAt(0).toUpperCase() + log.action.slice(1) : "";
    
    return (
      <div className="flex flex-col">
        <span className="text-xs font-bold uppercase tracking-wide text-foreground/80">
          {actionLabel} {log.entityType}
        </span>
        <div className="mt-1 space-y-1">
          {log.changes ? (
            Object.entries(log.changes).map(([field, delta]) => (
              <div key={field} className="text-[10px] flex items-center gap-1.5 leading-none">
                <span className="font-bold text-muted-foreground uppercase">{field}:</span>
                <span className="text-red-500/80 line-through decoration-red-500/30">{String(delta.old)}</span>
                <ChevronRight className="size-2.5 text-muted-foreground/40" />
                <span className="text-green-600 font-bold">{String(delta.new)}</span>
              </div>
            ))
          ) : (
            <span className="text-[10px] text-muted-foreground truncate max-w-[200px]" title={log.details}>
              {log.details}
            </span>
          )}
        </div>
      </div>
    );
  };

  const parseUserAgent = (ua?: string) => {
    if (!ua) return "Unknown Device";
    if (ua.includes("iPhone")) return "iPhone";
    if (ua.includes("Android")) return "Android";
    if (ua.includes("Macintosh")) return "Mac";
    if (ua.includes("Windows")) return "Windows";
    if (ua.includes("Linux")) return "Linux";
    return "Desktop";
  };

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6 min-h-screen bg-muted/10 pb-24">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-foreground">Activity Trail</h1>
          <p className="text-xs text-muted-foreground font-medium">Detailed audit logs and secure event tracking for your organization.</p>
        </div>
        <Button 
          variant="outline" 
          size="sm" 
          className="gap-2 font-bold uppercase text-[10px] h-8 px-4 bg-card shadow-sm border-border/60 hover:bg-accent"
          onClick={() => fetchLogs(false)}
          disabled={loading || refreshing}
        >
          {refreshing ? <Loader2 className="size-3 animate-spin" /> : <RefreshCw className="size-3" />}
          Refresh Trace
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Sidebar Filters */}
        {/* Sidebar Filters */}
        <div className="lg:col-span-1 space-y-4">
          <Card className="shadow-sm border-border/40 overflow-hidden bg-card/50 backdrop-blur-sm">
            <CardHeader className="pb-2 pt-4 px-5">
              <CardTitle className="text-sm font-bold uppercase tracking-widest flex items-center gap-2">
                <Search className="size-4 text-primary" /> 
                Refine Trace
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 px-5 pb-5">
              <div className="space-y-1.5">
                <Label className="text-[10px] uppercase font-black text-muted-foreground/80 tracking-widest leading-none">Global Search</Label>
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/60" />
                  <Input 
                    placeholder="Search logs..." 
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    className="pl-9 h-9 text-xs border-muted/30 bg-background/50 focus-visible:ring-primary/20 shadow-sm"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-[10px] uppercase font-black text-muted-foreground/80 tracking-widest leading-none">Who</Label>
                <Select value={filterUser} onValueChange={(val) => setFilterUser(val || "all")}>
                  <SelectTrigger className="h-9 text-xs bg-background/50 border-muted/30 shadow-sm">
                    <SelectValue placeholder="All Performers" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all" className="text-xs">All Performers</SelectItem>
                    <SelectItem value="system" className="text-xs">System/AI</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-[10px] uppercase font-black text-muted-foreground/80 tracking-widest leading-none">What</Label>
                <Select value={filterType} onValueChange={(val) => setFilterType(val || "all")}>
                  <SelectTrigger className="h-9 text-xs bg-background/50 border-muted/30 shadow-sm">
                    <SelectValue placeholder="All Types" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all" className="text-xs">All Activities</SelectItem>
                    <SelectItem value="ui" className="text-xs">User Mutations</SelectItem>
                    <SelectItem value="mcp" className="text-xs">AI Agent Actions</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-1 gap-4 pt-1">
                <div className="space-y-1.5">
                  <Label className="text-[10px] uppercase font-black text-muted-foreground/80 tracking-widest leading-none">From Date</Label>
                  <DatePicker
                    date={dateFrom ? parseISO(dateFrom) : undefined}
                    setDate={(d) => setDateFrom(d ? format(d, "yyyy-MM-dd") : "")}
                    className="w-full h-9 text-xs bg-background/50 border-muted/30 shadow-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[10px] uppercase font-black text-muted-foreground/80 tracking-widest leading-none">To Date</Label>
                  <DatePicker
                    date={dateTo ? parseISO(dateTo) : undefined}
                    setDate={(d) => setDateTo(d ? format(d, "yyyy-MM-dd") : "")}
                    className="w-full h-9 text-xs bg-background/50 border-muted/30 shadow-sm"
                  />
                </div>
              </div>

              <Button 
                variant="ghost" 
                className="w-full h-8 text-[10px] font-bold uppercase tracking-widest text-muted-foreground hover:text-primary transition-colors mt-2"
                onClick={() => {
                  setSearch(""); setFilterUser("all"); setFilterType("all"); setDateFrom(""); setDateTo("");
                }}
              >
                <FilterX className="size-3 mr-2" /> Reset Filters
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Audit Feed */}
        <div className="lg:col-span-3 space-y-4">
          <Card className="shadow-sm border-border/40 overflow-hidden bg-card/50 backdrop-blur-sm">
            <div className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/10 border-none hover:bg-muted/10">
                    <TableHead className="w-[180px] h-10 text-[10px] uppercase tracking-widest font-bold text-muted-foreground/70">Timestamp</TableHead>
                    <TableHead className="h-10 text-[10px] uppercase tracking-widest font-bold text-muted-foreground/70">Action</TableHead>
                    <TableHead className="h-10 text-[10px] uppercase tracking-widest font-bold text-muted-foreground/70">Performer</TableHead>
                    <TableHead className="h-10 text-[10px] uppercase tracking-widest font-bold text-muted-foreground/70">Context</TableHead>
                    <TableHead className="h-10 text-[10px] uppercase tracking-widest font-bold text-muted-foreground/70 text-right pr-6">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow className="hover:bg-transparent">
                      <TableCell colSpan={5} className="h-64 text-center">
                        <div className="flex flex-col items-center gap-2 text-muted-foreground">
                          <Loader2 className="size-8 animate-spin text-primary/40" />
                          <span className="text-xs font-bold uppercase tracking-widest animate-pulse">Syncing...</span>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : logs.length === 0 ? (
                    <TableRow className="hover:bg-transparent">
                      <TableCell colSpan={5} className="h-64 text-center">
                        <div className="flex flex-col items-center gap-2 text-muted-foreground">
                          <History className="size-8 text-muted-foreground/20" />
                          <span className="text-xs font-bold uppercase tracking-widest">No activities recorded.</span>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : (
                    logs.map((log) => {
                      const isExpanded = expandedRows.has(log.id);
                      const hasDetails = !!(log.changes || log.data || log.input || log.error);
                      
                      return (
                        <React.Fragment key={log.id}>
                          <TableRow 
                            className={cn(
                                "transition-all duration-200 border-muted/10 hover:bg-muted/5 group cursor-pointer",
                                isExpanded && "bg-muted/5"
                            )}
                            onClick={() => hasDetails && toggleRow(log.id)}
                          >
                            <TableCell className="py-4">
                              <div className="flex items-center gap-3">
                                {hasDetails ? (
                                    isExpanded ? <ChevronDown className="size-3 text-primary" /> : <ChevronRight className="size-3 text-muted-foreground/40 group-hover:text-primary transition-colors" />
                                ) : (
                                    <div className="size-3" />
                                )}
                                <div className="flex flex-col">
                                  <span className="text-xs font-black tracking-tight text-foreground/90 leading-tight">
                                    {format(new Date(log.timestamp), "MMM dd, yyyy")}
                                  </span>
                                  <span className="text-[10px] font-bold text-muted-foreground/70">
                                    {format(new Date(log.timestamp), "HH:mm:ss")}
                                  </span>
                                </div>
                              </div>
                            </TableCell>
                            <TableCell className="py-4">
                              {renderAction(log)}
                            </TableCell>
                            <TableCell className="py-4">
                              <div className="flex flex-col gap-0.5">
                                <div className="flex items-center gap-1.5">
                                  {log.type === "mcp" ? (
                                    <Bot className="size-3 text-primary" />
                                  ) : (
                                    <User className="size-3 text-foreground/60" />
                                  )}
                                  <span className="text-xs font-bold text-foreground/80">{log.userName || "Unknown"}</span>
                                </div>
                                <span className="text-[10px] text-muted-foreground font-medium pl-4">
                                  {log.type === "mcp" ? "AI Agent" : "User"}
                                </span>
                              </div>
                            </TableCell>
                            <TableCell className="py-4">
                              <div className="flex flex-col gap-1">
                                <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground font-bold uppercase tracking-tighter">
                                  <Globe className="size-2.5" /> {log.ipAddress || "::1"}
                                </div>
                                <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground font-bold uppercase tracking-tighter">
                                  <Monitor className="size-2.5" /> {parseUserAgent(log.userAgent)}
                                </div>
                              </div>
                            </TableCell>
                            <TableCell className="py-4 text-right pr-6">
                              {renderStatus(log)}
                            </TableCell>
                          </TableRow>
                          {isExpanded && (
                            <TableRow className="bg-muted/5 border-none">
                              <TableCell colSpan={5} className="p-0 border-none">
                                <div className="px-12 py-3 pb-6 border-b border-muted/10">
                                  <div className="bg-background/80 rounded-lg p-4 border border-muted/20 shadow-inner">
                                    <div className="flex items-center gap-2 mb-3">
                                        <Database className="size-3 text-primary" />
                                        <span className="text-[10px] font-black uppercase tracking-widest text-foreground/60">Technical Payloads</span>
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        {/* MCP Specific */}
                                        {log.type === "mcp" && log.input && (
                                            <div className="space-y-1.5">
                                                <div className="flex items-center gap-1.5 text-[9px] font-bold uppercase text-muted-foreground/60">
                                                    <Terminal className="size-2.5" /> Input Parameters
                                                </div>
                                                <pre className="text-[10px] p-2 bg-muted/20 rounded border border-muted/10 overflow-x-auto font-mono text-muted-foreground">
                                                    {log.input}
                                                </pre>
                                            </div>
                                        )}
                                        {log.error && (
                                            <div className="space-y-1.5">
                                                <div className="flex items-center gap-1.5 text-[9px] font-bold uppercase text-red-400">
                                                    <XCircle className="size-2.5" /> Execution Error
                                                </div>
                                                <pre className="text-[10px] p-2 bg-red-500/5 text-red-600 rounded border border-red-500/10 overflow-x-auto font-mono whitespace-pre-wrap">
                                                    {log.error}
                                                </pre>
                                            </div>
                                        )}
                                        
                                        {/* UI Mutation Specific */}
                                        {log.changes && (
                                            <div className="space-y-1.5 col-span-full">
                                                <div className="flex items-center gap-1.5 text-[9px] font-bold uppercase text-muted-foreground/60">
                                                    <Activity className="size-2.5" /> Modification Delta
                                                </div>
                                                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                                                    {Object.entries(log.changes).map(([key, val]) => (
                                                        <div key={key} className="bg-muted/10 p-2 rounded border border-muted/10 flex flex-col gap-1">
                                                            <span className="text-[9px] font-black uppercase text-primary/60">{key}</span>
                                                            <div className="flex flex-col text-[10px]">
                                                                <span className="text-muted-foreground/60 line-through">Old: {JSON.stringify(val.old)}</span>
                                                                <span className="font-bold text-foreground/80">New: {JSON.stringify(val.new)}</span>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                        {log.data && (
                                            <div className="space-y-1.5 col-span-full">
                                                <div className="flex items-center gap-1.5 text-[9px] font-bold uppercase text-muted-foreground/60">
                                                    <Database className="size-2.5" /> Raw Object State
                                                </div>
                                                <pre className="text-[10px] p-3 bg-muted/20 rounded border border-muted/10 overflow-x-auto font-mono text-muted-foreground">
                                                    {JSON.stringify(log.data, null, 2)}
                                                </pre>
                                            </div>
                                        )}
                                    </div>
                                  </div>
                                </div>
                              </TableCell>
                            </TableRow>
                          )}
                        </React.Fragment>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>

            {/* Pagination */}
            {nextCursor && !loading && (
              <div className="p-4 border-t border-muted/10 flex justify-center bg-muted/5">
                <Button 
                  variant="outline" 
                  onClick={() => fetchLogs(true)} 
                  disabled={refreshing}
                  className="w-full max-w-sm h-10 font-black uppercase text-[10px] tracking-widest hover:bg-primary/5 hover:text-primary border-dashed"
                >
                  {refreshing ? <Loader2 className="size-4 animate-spin mr-2" /> : <RefreshCw className="size-3 mr-2" />}
                  Load More History
                </Button>
              </div>
            )}
            
            {logs.length > 0 && !nextCursor && !loading && (
              <div className="p-6 border-t border-muted/10 text-center bg-muted/5">
                <span className="text-[10px] font-black uppercase text-muted-foreground/40 tracking-[0.2em]">End of Audit Trail</span>
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
