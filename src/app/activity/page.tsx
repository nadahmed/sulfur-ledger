"use client";

import React, { useEffect, useState } from "react";
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
import { format } from "date-fns";
import { History, CheckCircle2, XCircle, ChevronDown, ChevronUp, User, Bot, Activity } from "lucide-react";
import { Button } from "@/components/ui/button";

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

  const renderStatus = (log: ActivityLog) => {
    if (log.type === "mcp") {
      if (log.status === "success") {
        return (
          <Badge variant="success" className="gap-1 bg-green-100 text-green-800 border-green-200">
            <CheckCircle2 className="size-3" /> Success
          </Badge>
        );
      }
      return (
        <Badge variant="destructive" className="gap-1 bg-red-100 text-red-800 border-red-200">
          <XCircle className="size-3" /> Error
        </Badge>
      );
    }
    // For UI actions, if they exist in audit log, they generally represent a success at the point of logging
    return (
      <Badge variant="secondary" className="gap-1 bg-blue-50 text-blue-700 border-blue-100">
        <Activity className="size-3" /> Recorded
      </Badge>
    );
  };

  const renderAction = (log: ActivityLog) => {
    if (log.type === "mcp") {
      return (
        <div className="flex items-center gap-2">
          <code className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono text-indigo-600">
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
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">Organization Activity</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <History className="size-5" />
            Unified Activity Feed
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            A chronological timeline of all actions performed in this organization, 
            either by users directly or by the AI agent. Logs are kept for a rolling 90-day period.
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
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[180px]">Timestamp</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Performer</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Details</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map((log) => (
                  <React.Fragment key={log.id}>
                    <TableRow 
                      className="cursor-pointer hover:bg-muted/50 transition-colors"
                      onClick={() => toggleRow(log.id)}
                    >
                      <TableCell className="font-medium whitespace-nowrap">
                        {format(new Date(log.timestamp), "MMM d, HH:mm:ss")}
                      </TableCell>
                      <TableCell>
                        {renderAction(log)}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2 text-sm">
                          {log.userName === "MCP/AI" ? (
                            <div className="flex items-center gap-1.5 text-indigo-600 font-semibold">
                              <Bot className="size-4" />
                              <span>AI Agent</span>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1.5 text-slate-700">
                              <User className="size-4" />
                              <span>{log.userName || "Unknown User"}</span>
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>{renderStatus(log)}</TableCell>
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
                                <h4 className="text-sm font-semibold mb-2 text-red-600">Error Message</h4>
                                <pre className="text-xs bg-red-50 text-red-900 p-3 rounded-md border border-red-100 overflow-auto">
                                  {log.error}
                                </pre>
                              </div>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </React.Fragment>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
