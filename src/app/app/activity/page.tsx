"use client";

import React, { useEffect, useState, useMemo } from "react";
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
import { History, CheckCircle2, XCircle, ChevronDown, ChevronUp, User, Bot, Activity, Search, FilterX, Calendar as CalendarIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface ActivityLog {
  id: string;
  type: "mcp" | "ui";
  toolName?: string;
  action?: string;
  entityType?: string;
  entityId?: string;
  input?: string;
  details?: string;
  status?: "success" | "error";
  error?: string;
  timestamp: string;
  userName?: string;
}

export default function ActivityPage() {
  const { activeOrganizationId } = useOrganization();
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<string>("all");
  const [filterAction, setFilterAction] = useState<string>("all");
  const [filterUser, setFilterUser] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");

  // Pagination
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  useEffect(() => {
    if (activeOrganizationId) {
      fetch(`/api/activity?orgId=${activeOrganizationId}`)
        .then((res) => res.json())
        .then((data) => {
          setLogs(data);
          setLoading(false);
        })
        .catch((err) => {
          console.error("Failed to fetch logs:", err);
          setLoading(false);
        });
    }
  }, [activeOrganizationId]);

  const toggleRow = (id: string) => {
    setExpandedRow(expandedRow === id ? null : id);
  };

  const uniqueUsers = useMemo(() => {
    const users = new Set<string>();
    logs.forEach(l => {
      if (l.userName) users.add(l.userName);
    });
    return Array.from(users).sort();
  }, [logs]);

  const uniqueActions = useMemo(() => {
    const actions = new Set<string>();
    logs.forEach(l => {
      if (l.type === "ui" && l.action) actions.add(l.action);
      if (l.type === "mcp" && l.toolName) actions.add(l.toolName);
    });
    return Array.from(actions).sort();
  }, [logs]);

  const filteredLogs = useMemo(() => {
    return logs.filter(log => {
      if (search) {
        const query = search.toLowerCase();
        const details = log.details ? log.details.toLowerCase() : "";
        const inputStr = log.input ? log.input.toLowerCase() : "";
        const entity = log.entityType ? log.entityType.toLowerCase() : "";
        if (!details.includes(query) && !inputStr.includes(query) && !entity.includes(query)) {
          return false;
        }
      }
      
      if (filterType !== "all" && log.type !== filterType) {
        return false;
      }
      
      if (filterAction !== "all") {
        if (log.type === "ui" && log.action !== filterAction) return false;
        if (log.type === "mcp" && log.toolName !== filterAction) return false;
      }
      
      if (filterUser !== "all" && log.userName !== filterUser) {
        return false;
      }
      
      if (dateFrom) {
        const dFrom = new Date(dateFrom).getTime();
        // compare to date component of timestamp 
        if (new Date(log.timestamp.split('T')[0]).getTime() < dFrom) return false;
      }
      if (dateTo) {
        const dTo = new Date(dateTo).getTime();
        if (new Date(log.timestamp.split('T')[0]).getTime() > dTo) return false;
      }
      
      return true;
    });
  }, [logs, search, filterType, filterAction, filterUser, dateFrom, dateTo]);

  const totalPages = Math.ceil(filteredLogs.length / pageSize);
  const paginatedLogs = filteredLogs.slice((page - 1) * pageSize, page * pageSize);

  useEffect(() => {
    setPage(1);
    setExpandedRow(null);
  }, [search, filterType, filterAction, filterUser, dateFrom, dateTo, pageSize]);

  const renderStatus = (log: ActivityLog) => {
    if (log.type === "mcp") {
      if (log.status === "success") {
        return (
          <Badge className="gap-1 bg-primary/10 text-primary border-primary/20 hover:bg-primary/20 transition-colors">
            <CheckCircle2 className="size-3" /> Success
          </Badge>
        );
      }
      return (
        <Badge variant="destructive" className="gap-1 bg-destructive/10 text-destructive border-destructive/20 hover:bg-destructive/20 transition-colors">
          <XCircle className="size-3" /> Error
        </Badge>
      );
    }
    // For UI actions, if they exist in audit log, they generally represent a success at the point of logging
    return (
      <Badge variant="secondary" className="gap-1 bg-muted text-muted-foreground border-border hover:bg-muted/80 transition-colors">
        <Activity className="size-3" /> Recorded
      </Badge>
    );
  };

  const renderAction = (log: ActivityLog) => {
    if (log.type === "mcp") {
      return (
        <div className="flex items-center gap-2">
          <code className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono text-primary">
            {log.toolName}
          </code>
        </div>
      );
    }
    
    // UI typical format: action + entityType
    const actionLabel = log.action ? log.action.charAt(0).toUpperCase() + log.action.slice(1) : "";
    return (
      <span className="text-sm font-medium">
        {actionLabel} {log.entityType}
      </span>
    );
  };

  const renderDetails = (log: ActivityLog) => {
    try {
      if (log.type === "mcp" && log.input) {
        return JSON.stringify(JSON.parse(log.input), null, 2);
      }
      if (log.type === "ui" && log.details) {
        // Some details might be JSON strings
        if (log.details.startsWith("{") || log.details.startsWith("[")) {
          return JSON.stringify(JSON.parse(log.details), null, 2);
        }
        return log.details;
      }
    } catch (e) {
      return log.input || log.details || "No details available";
    }
    return "No details available";
  };

  return (
    <div className="flex flex-col gap-4 p-4 md:p-6 min-h-screen">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold tracking-tight">Organization Activity</h1>
      </div>

      <Card>
        <CardHeader className="py-4 px-6">
          <CardTitle className="flex items-center gap-2 text-lg">
            <History className="size-5 text-primary" />
            Unified Activity Feed
          </CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            A chronological timeline of actions performed in this organization.
          </p>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex h-32 items-center justify-center">
              <span className="text-muted-foreground">Loading activity logs...</span>
            </div>
          ) : logs.length === 0 ? (
            <div className="flex h-32 items-center justify-center">
              <span className="text-muted-foreground">No recent activity found.</span>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex flex-col gap-3 p-3 bg-muted/20 rounded-xl border border-border/40">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div className="space-y-1">
                    <Label className="text-[10px] uppercase font-bold text-muted-foreground/70">Search</Label>
                    <div className="relative">
                      <Search className="absolute left-2 top-2 h-3.5 w-3.5 text-muted-foreground" />
                      <Input 
                        placeholder="Search logs..." 
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        className="pl-8 h-8 text-xs"
                      />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] uppercase font-bold text-muted-foreground/70">Action</Label>
                    <Select value={filterAction} onValueChange={v => setFilterAction(v || "all")}>
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue placeholder="All Actions" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all" className="text-xs">All Actions</SelectItem>
                        {uniqueActions.map(a => <SelectItem key={a} value={a} className="text-xs">{a}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] uppercase font-bold text-muted-foreground/70">User</Label>
                    <Select value={filterUser} onValueChange={v => setFilterUser(v || "all")}>
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue placeholder="All Users" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all" className="text-xs">All Users</SelectItem>
                        {uniqueUsers.map(u => <SelectItem key={u} value={u} className="text-xs">{u}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] uppercase font-bold text-muted-foreground/70">Log Type</Label>
                    <Select value={filterType} onValueChange={v => setFilterType(v || "all")}>
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue placeholder="All Types" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all" className="text-xs">All Types</SelectItem>
                        <SelectItem value="ui" className="text-xs">User Interface</SelectItem>
                        <SelectItem value="mcp" className="text-xs">AI Agent (MCP)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                
                <div className="flex flex-wrap items-center gap-4">
                  <div className="flex items-center gap-2">
                    <Label className="text-[10px] uppercase font-bold text-muted-foreground/70 whitespace-nowrap">From</Label>
                    <DatePicker
                      date={dateFrom ? parseISO(dateFrom) : undefined}
                      setDate={(d: Date | undefined) => setDateFrom(d ? format(d, "yyyy-MM-dd") : "")}
                      className="w-[130px] h-8 text-xs"
                      placeholder="From Date"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <Label className="text-[10px] uppercase font-bold text-muted-foreground/70 whitespace-nowrap">To</Label>
                    <DatePicker
                      date={dateTo ? parseISO(dateTo) : undefined}
                      setDate={(d: Date | undefined) => setDateTo(d ? format(d, "yyyy-MM-dd") : "")}
                      className="w-[130px] h-8 text-xs"
                      placeholder="To Date"
                    />
                  </div>
                  <div className="flex-1"></div>
                  <Button variant="ghost" size="sm" className="h-8 gap-1 text-[10px] uppercase font-semibold text-muted-foreground" onClick={() => {
                    setSearch(""); setFilterAction("all"); setFilterUser("all"); setFilterType("all"); setDateFrom(""); setDateTo("");
                  }}>
                    <FilterX className="size-3" />
                    Reset Filters
                  </Button>
                </div>
              </div>

              <div className="rounded-md border">
                <Table>
              <TableHeader>
                <TableRow className="bg-muted/30">
                  <TableHead className="w-[150px] h-8 text-[11px] uppercase tracking-wider font-bold">Timestamp</TableHead>
                  <TableHead className="h-8 text-[11px] uppercase tracking-wider font-bold">Action</TableHead>
                  <TableHead className="h-8 text-[11px] uppercase tracking-wider font-bold">Performer</TableHead>
                  <TableHead className="h-8 text-[11px] uppercase tracking-wider font-bold">Status</TableHead>
                  <TableHead className="text-right h-8 text-[11px] uppercase tracking-wider font-bold">Details</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedLogs.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="h-24 text-center">
                      No results match your filters.
                    </TableCell>
                  </TableRow>
                ) : (
                  paginatedLogs.map((log) => (
                    <React.Fragment key={log.id}>
                      <TableRow 
                      className="cursor-pointer hover:bg-muted/50 transition-colors"
                      onClick={() => toggleRow(log.id)}
                    >
                      <TableCell className="font-medium whitespace-nowrap text-xs py-2">
                        {format(new Date(log.timestamp), "MMM d, HH:mm:ss")}
                      </TableCell>
                      <TableCell className="text-xs py-2">
                        {renderAction(log)}
                      </TableCell>
                      <TableCell className="py-2">
                        <div className="flex items-center gap-2 text-xs">
                          {log.userName === "AI Agent" || log.userName === "MCP/AI" ? (
                            <div className="flex items-center gap-1.5 text-primary font-semibold">
                              <Bot className="size-3.5" />
                              <span>AI Agent</span>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1.5 text-foreground">
                              <User className="size-3.5" />
                              <span>{log.userName || "Unknown User"}</span>
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="py-2">{renderStatus(log)}</TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                          {expandedRow === log.id ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
                        </Button>
                      </TableCell>
                    </TableRow>
                    {expandedRow === log.id && (
                      <TableRow className="bg-muted/30">
                        <TableCell colSpan={5} className="p-4">
                          <div className="flex flex-col gap-4">
                            <div>
                              <h4 className="text-sm font-semibold mb-2">Operation Details</h4>
                              <pre className="text-xs bg-background p-3 rounded-md border overflow-auto max-h-[300px] font-mono leading-relaxed">
                                {renderDetails(log)}
                              </pre>
                            </div>
                            {log.error && (
                              <div>
                                <h4 className="text-sm font-semibold mb-2 text-destructive">Error Message</h4>
                                <pre className="text-xs bg-destructive/10 text-destructive p-3 rounded-md border border-destructive/20 overflow-auto">
                                  {log.error}
                                </pre>
                              </div>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </React.Fragment>
                  ))
                )}
              </TableBody>
            </Table>
            </div>
            
            {filteredLogs.length > 0 && (
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mt-2">
                <div className="text-sm text-muted-foreground">
                  Showing <span className="font-medium">{(page - 1) * pageSize + 1}</span> to <span className="font-medium">{Math.min(page * pageSize, filteredLogs.length)}</span> of <span className="font-medium">{filteredLogs.length}</span> results
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-2 mr-4">
                    <Label className="text-xs text-muted-foreground whitespace-nowrap">Rows per page</Label>
                    <Select value={pageSize.toString()} onValueChange={v => setPageSize(Number(v || 20))}>
                      <SelectTrigger className="w-[70px] h-8 text-xs">
                        <SelectValue>
                          {pageSize.toString()}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="10">10</SelectItem>
                        <SelectItem value="20">20</SelectItem>
                        <SelectItem value="50">50</SelectItem>
                        <SelectItem value="100">100</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Button variant="outline" size="sm" className="h-8" disabled={page === 1} onClick={() => setPage(page - 1)}>Prev</Button>
                  <div className="text-sm font-medium px-2">Page {page} of {Math.max(1, totalPages)}</div>
                  <Button variant="outline" size="sm" className="h-8" disabled={page === Math.max(1, totalPages)} onClick={() => setPage(page + 1)}>Next</Button>
                </div>
              </div>
            )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
