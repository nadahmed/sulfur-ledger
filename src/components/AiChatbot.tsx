"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  MessageSquare, X, Send, Bot, Trash2, Sparkles,
  ChevronDown, Loader2, Eraser, Clock,
  TrendingUp, BookOpen, PlusCircle, BarChart2
} from "lucide-react";
import { useOrganization } from "@/context/OrganizationContext";
import { useUser } from "@auth0/nextjs-auth0/client";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { getPusherClient } from "@/lib/pusher";
import { uuidv7 } from "uuidv7";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

// LlamaIndex compatible message type
export interface Message {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp?: string;
  metadata?: {
    userInitials?: string;
    createdAt?: string;
  };
}

// Suggested starter prompts for empty state
const QUICK_PROMPTS = [
  { icon: BarChart2,  label: "Balance sheet",     text: "Show me the current balance sheet." },
  { icon: TrendingUp, label: "P&L this month",    text: "Give me a profit & loss summary for this month." },
  { icon: BookOpen,   label: "Recent journals",   text: "Show the last 10 journal entries." },
  { icon: PlusCircle, label: "Record expense",    text: "Help me record a new expense." },
];

/** Format a timestamp as a readable relative string */
function formatRelativeTime(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60)   return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** Generate a consistent HSL hue from a string (for user avatar) */
function stringToHue(s: string): number {
  let hash = 0;
  for (let i = 0; i < s.length; i++) hash = s.charCodeAt(i) + ((hash << 5) - hash);
  return Math.abs(hash) % 360;
}

export default function AiChatbot() {
  const { user } = useUser();
  const { activeOrganizationId, isOwner, organizations } = useOrganization();
  const [isOpen, setIsOpen]       = useState(false);
  const [input, setInput]         = useState("");
  const [messages, setMessages]   = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [clearPending, setClearPending] = useState(false);

  const scrollRef  = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const orgIdRef   = useRef(activeOrganizationId);

  useEffect(() => { orgIdRef.current = activeOrganizationId; }, [activeOrganizationId]);

  // ─── Sync history ──────────────────────────────────────────────────────────
  const syncMessages = useCallback(async () => {
    if (!activeOrganizationId) return;
    try {
      const res = await fetch(`/api/ai/history?orgId=${activeOrganizationId}`);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          setMessages(data.map(m => ({
            id:   m.id,
            role: m.role,
            content: m.content,
            metadata: { createdAt: m.timestamp, userInitials: m.userInitials },
          })));
        }
      }
    } catch (err) {
      console.error("[AI CHAT] Sync failed:", err);
    }
  }, [activeOrganizationId]);

  useEffect(() => {
    if (activeOrganizationId && isOpen) syncMessages();
  }, [activeOrganizationId, isOpen, syncMessages]);

  // Clear unread when opening
  useEffect(() => { if (isOpen) setUnreadCount(0); }, [isOpen]);

  // Focus textarea when panel opens
  useEffect(() => {
    if (isOpen) setTimeout(() => textareaRef.current?.focus(), 150);
  }, [isOpen]);

  // Window focus sync
  useEffect(() => {
    const handler = () => {
      // Only sync if NOT currently loading a message
      if (activeOrganizationId && isOpen && !isLoading) syncMessages();
    };
    window.addEventListener("focus", handler);
    return () => window.removeEventListener("focus", handler);
  }, [activeOrganizationId, isOpen, syncMessages, isLoading]);

  // Escape key to close
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) setIsOpen(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isOpen]);

  // ─── Pusher subscription ───────────────────────────────────────────────────
  useEffect(() => {
    if (!activeOrganizationId) return;
    const pusher  = getPusherClient();
    const channel = pusher.subscribe(`org-${activeOrganizationId}`);

    channel.bind("ai-message", (data: any) => {
      setMessages(prev => {
        if (prev.find(m => m.id === data.id)) return prev;
        return [...prev, data];
      });
      setIsLoading(false);
      setUnreadCount(prev => prev + 1);
    });

    return () => {
      channel.unbind_all();
      pusher.unsubscribe(`org-${activeOrganizationId}`);
    };
  }, [activeOrganizationId]);

  // Auto-scroll on new message
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
    }
  }, [messages, isLoading]);

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }, [input]);

  if (!activeOrganizationId) return null;

  // ─── Send message ──────────────────────────────────────────────────────────
  const sendMessage = async (text: string) => {
    if (!text.trim() || isLoading) return;
    setInput("");
    setIsLoading(true);
    if (textareaRef.current) textareaRef.current.style.height = "auto";

    const userInitials = user?.name
      ? user.name.split(" ").map((n: string) => n[0]).join("").toUpperCase().substring(0, 2)
      : (user?.nickname?.substring(0, 2).toUpperCase() || "U");

    const userMessage: Message = {
      id: uuidv7(),
      role: "user",
      content: text,
      timestamp: new Date().toISOString(),
      metadata: { userInitials },
    };

    setMessages(prev => [...prev, userMessage]);

    try {
      const response = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [...messages, userMessage],
          orgId: activeOrganizationId,
          localTime: new Intl.DateTimeFormat("en-US", {
            year: "numeric", month: "long", day: "numeric",
            hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true
          }).format(new Date()),
        }),
      });

      if (!response.ok) throw new Error("Failed to send message");

      const data = await response.json();
      
      // If server processed synchronously, we can reset loading state
      if (data.mode === "sync" || data.status === "skipped") {
        setIsLoading(false);
        
        // If we got the actual message back, add it if not already there
        if (data.message) {
          setMessages(prev => {
            if (prev.find(m => m.id === data.message.id)) return prev;
            return [...prev, {
              id: data.message.id,
              role: data.message.role,
              content: data.message.content,
              timestamp: data.message.timestamp
            }];
          });
        }
      } else if (data.mode === "background") {
        // Still loading, background task will trigger Pusher
        console.log("[AI] Request handed off to background. Waiting for Pusher...");
      }

    } catch (err: any) {
      toast.error(`AI Error: ${err.message}`);
      setIsLoading(false);
    }
  };

  const onFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await sendMessage(input);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  // ─── Clear conversation ────────────────────────────────────────────────────
  const handleClear = async () => {
    if (!clearPending) { setClearPending(true); return; }
    setClearPending(false);
    // Delete all messages locally and via API
    for (const m of messages) {
      if (!m.metadata?.createdAt) continue;
      await fetch(
        `/api/ai/history?orgId=${activeOrganizationId}&msgId=${m.id}&timestamp=${m.metadata.createdAt}`,
        { method: "DELETE" }
      );
    }
    setMessages([]);
    toast.success("Conversation cleared");
  };

  const deleteMessage = async (msgId: string, timestamp: string) => {
    const res = await fetch(
      `/api/ai/history?orgId=${activeOrganizationId}&msgId=${msgId}&timestamp=${timestamp}`,
      { method: "DELETE" }
    );
    if (res.ok) {
      setMessages(messages.filter(m => m.id !== msgId));
      toast.success("Message deleted");
    }
  };

  // ─── Derived ───────────────────────────────────────────────────────────────
  const userHue = user?.name ? stringToHue(user.name) : 210;
  const isInputEmpty = !input.trim();

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="fixed bottom-4 right-4 sm:bottom-6 sm:right-6 z-50 flex flex-col items-end">
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1, transition: { type: "spring", stiffness: 400, damping: 30 } }}
            exit={{ opacity: 0, y: 12, scale: 0.97, transition: { duration: 0.18 } }}
            className="mb-3 w-[calc(100vw-2rem)] sm:w-[420px] flex flex-col rounded-2xl overflow-hidden shadow-[0_24px_64px_-12px_rgba(0,0,0,0.35)] border border-border/60"
            style={{ height: "min(600px, 88vh)" }}
          >
            {/* ── Header ── */}
            <div className="flex items-center gap-3 px-4 py-3 bg-card border-b border-border/50 shrink-0">
              {/* AI Avatar */}
              <div className="relative shrink-0">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary/80 to-primary flex items-center justify-center shadow-md shadow-primary/20">
                  <Bot className="w-5 h-5 text-primary-foreground" />
                </div>
                <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-card" />
              </div>

              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground leading-tight flex items-center gap-1.5">
                  Sulfur AI
                  <span className="text-[9px] font-medium px-1.5 py-0.5 rounded-full bg-primary/10 text-primary uppercase tracking-wider">Beta</span>
                </p>
                <p className="text-[11px] text-muted-foreground leading-tight">Financial expert · always on</p>
              </div>

              <div className="flex items-center gap-1 shrink-0">
                {/* Clear chat */}
                <Button
                  variant="ghost"
                  size="icon"
                  className={cn(
                    "h-8 w-8 rounded-full transition-all",
                    clearPending
                      ? "bg-destructive/10 text-destructive hover:bg-destructive/20"
                      : "hover:bg-muted text-muted-foreground hover:text-foreground"
                  )}
                  title={clearPending ? "Click again to confirm" : "Clear conversation"}
                  onClick={handleClear}
                  onBlur={() => setClearPending(false)}
                  disabled={messages.length === 0}
                >
                  <Eraser className="w-3.5 h-3.5" />
                </Button>

                {/* Close */}
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 rounded-full hover:bg-muted text-muted-foreground hover:text-foreground"
                  onClick={() => setIsOpen(false)}
                  title="Close (Esc)"
                >
                  <ChevronDown className="w-4 h-4" />
                </Button>
              </div>
            </div>

            {/* ── Messages ── */}
            <div
              ref={scrollRef}
              className="flex-1 overflow-y-auto bg-background px-4 py-4 space-y-4"
              style={{ scrollbarWidth: "thin", scrollbarColor: "var(--border) transparent" }}
            >
              {/* Empty state */}
              {messages.length === 0 && !isLoading && (
                <div className="h-full flex flex-col items-center justify-center gap-5 text-center pb-4">
                  <div className="w-14 h-14 rounded-2xl bg-primary/15 border border-primary/20 flex items-center justify-center">
                    <Sparkles className="w-7 h-7 text-primary" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-foreground text-sm">Your AI Financial Expert</h4>
                    <p className="text-xs text-muted-foreground mt-1 max-w-[260px] leading-relaxed">
                      Ask me anything about your ledger — I can read reports, record transactions, and more.
                    </p>
                  </div>
                  {/* Quick-action chips */}
                  <div className="grid grid-cols-2 gap-2 w-full max-w-[300px]">
                    {QUICK_PROMPTS.map(({ icon: Icon, label, text }) => (
                      <button
                        key={label}
                        onClick={() => sendMessage(text)}
                        className="flex items-center gap-2 px-3 py-2 rounded-xl border border-border bg-card hover:bg-primary/10 text-xs text-foreground hover:text-foreground transition-all text-left group shadow-sm"
                      >
                        <Icon className="w-3.5 h-3.5 text-primary shrink-0 transition-colors" />
                        <span className="truncate">{label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Message list */}
              {messages.map((m, idx) => {
                const isUser = m.role === "user";
                const showTimestamp = idx === messages.length - 1 ||
                  messages[idx + 1]?.role !== m.role;
                const timestamp = formatRelativeTime(m.metadata?.createdAt || m.timestamp);

                return (
                  <motion.div
                    key={`${m.id}-${idx}`}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.2 }}
                    className={cn("flex gap-2.5", isUser ? "flex-row-reverse" : "flex-row")}
                  >
                    {/* Avatar */}
                    <div
                      className={cn(
                        "w-8 h-8 rounded-xl flex items-center justify-center shrink-0 text-[10px] font-bold uppercase border shadow-sm self-end",
                        isUser ? "border-transparent" : "bg-card border-border text-muted-foreground"
                      )}
                      style={isUser ? {
                        background: `hsl(${userHue}, 60%, 50%)`,
                        color: "white",
                      } : {}}
                    >
                      {isUser ? (m.metadata?.userInitials || "U") : <Bot className="w-4 h-4" />}
                    </div>

                    {/* Bubble + metadata */}
                    <div className={cn("group flex flex-col gap-1 max-w-[78%]", isUser ? "items-end" : "items-start")}>
                      <div
                        className={cn(
                          "relative px-3.5 py-2.5 text-sm leading-relaxed",
                          isUser
                            ? "bg-primary text-primary-foreground rounded-2xl rounded-br-sm shadow-md shadow-primary/15"
                            : "bg-card border border-border rounded-2xl rounded-bl-sm shadow-sm text-foreground"
                        )}
                      >
                        <ReactMarkdown
                          remarkPlugins={[remarkGfm]}
                          components={{
                            p:          ({ children }) => <p className="mb-2 last:mb-0 whitespace-pre-wrap">{children}</p>,
                            ul:         ({ children }) => <ul className="list-disc pl-4 mb-2 mt-1 space-y-1">{children}</ul>,
                            ol:         ({ children }) => <ol className="list-decimal pl-4 mb-2 mt-1 space-y-1">{children}</ol>,
                            li:         ({ children }) => <li className="leading-relaxed">{children}</li>,
                            strong:     ({ children }) => <strong className="font-semibold">{children}</strong>,
                            em:         ({ children }) => <em className="italic opacity-90">{children}</em>,
                            code:       ({ children }) => (
                              <code className={cn(
                                "px-1.5 py-0.5 rounded font-mono text-[11px] border",
                                isUser
                                  ? "bg-white/15 border-white/20 text-primary-foreground"
                                  : "bg-muted border-border/50"
                              )}>
                                {children}
                              </code>
                            ),
                            a: ({ children, href }) => (
                              <a
                                href={href}
                                target="_blank"
                                rel="noopener noreferrer"
                                className={cn(
                                  "underline underline-offset-2 transition-colors",
                                  isUser ? "text-primary-foreground/80 hover:text-primary-foreground" : "text-primary hover:text-primary/80"
                                )}
                              >
                                {children}
                              </a>
                            ),
                            h1:         ({ children }) => <h1 className="text-base font-bold mb-2 mt-3 first:mt-0">{children}</h1>,
                            h2:         ({ children }) => <h2 className="text-sm font-semibold mb-1.5 mt-2.5 first:mt-0">{children}</h2>,
                            h3:         ({ children }) => <h3 className="text-sm font-semibold mb-1 mt-2 first:mt-0">{children}</h3>,
                            blockquote: ({ children }) => (
                              <blockquote className={cn(
                                "border-l-4 pl-3 py-1 my-2 rounded-r-lg italic text-[13px]",
                                isUser ? "border-white/30 bg-white/10" : "border-primary/20 bg-muted/50 text-muted-foreground"
                              )}>
                                {children}
                              </blockquote>
                            ),
                            table: ({ children }) => (
                              <div className="overflow-x-auto my-2">
                                <table className="text-xs border-collapse w-full">{children}</table>
                              </div>
                            ),
                            th: ({ children }) => (
                              <th className={cn(
                                "px-2 py-1 text-left font-semibold border-b",
                                isUser ? "border-white/20" : "border-border"
                              )}>{children}</th>
                            ),
                            td: ({ children }) => (
                              <td className={cn(
                                "px-2 py-1 border-b",
                                isUser ? "border-white/10" : "border-border/50"
                              )}>{children}</td>
                            ),
                          }}
                        >
                          {m.content}
                        </ReactMarkdown>
                      </div>

                      {/* Timestamp + delete */}
                      <div className={cn(
                        "flex items-center gap-2 px-1",
                        isUser ? "flex-row-reverse" : "flex-row"
                      )}>
                        {showTimestamp && timestamp && (
                          <span className="text-[10px] text-muted-foreground/50 flex items-center gap-1">
                            <Clock className="w-2.5 h-2.5" />
                            {timestamp}
                          </span>
                        )}
                        {isOwner && (
                          <button
                            className="opacity-0 group-hover:opacity-100 transition-opacity text-[10px] text-muted-foreground/60 hover:text-destructive flex items-center gap-1"
                            onClick={() => deleteMessage(m.id, m.metadata?.createdAt || new Date().toISOString())}
                          >
                            <Trash2 className="w-2.5 h-2.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  </motion.div>
                );
              })}

              {/* Typing indicator */}
              <AnimatePresence>
                {isLoading && (
                  <motion.div
                    key="typing-indicator"
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 6 }}
                    className="flex gap-2.5"
                  >
                    <div className="w-8 h-8 rounded-xl bg-card border border-border flex items-center justify-center text-muted-foreground">
                      <Bot className="w-4 h-4" />
                    </div>
                    <div className="bg-card border border-border px-4 py-3 rounded-2xl rounded-bl-sm shadow-sm self-start">
                      <div className="flex gap-1.5 items-center h-4">
                        <span className="w-1.5 h-1.5 rounded-full bg-primary/50 animate-bounce [animation-duration:0.9s]" />
                        <span className="w-1.5 h-1.5 rounded-full bg-primary/50 animate-bounce [animation-duration:0.9s] [animation-delay:0.2s]" />
                        <span className="w-1.5 h-1.5 rounded-full bg-primary/50 animate-bounce [animation-duration:0.9s] [animation-delay:0.4s]" />
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* ── Input area ── */}
            <div className="px-3 py-3 border-t border-border/50 bg-card shrink-0">
              <form onSubmit={onFormSubmit} className="flex items-center gap-2">
                <div className="flex-1 relative">
                  <textarea
                    ref={textareaRef}
                    rows={1}
                    className={cn(
                      "w-full resize-none bg-background border border-border rounded-xl px-3.5 py-2.5 pr-9 text-sm",
                      "focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/40",
                      "placeholder:text-muted-foreground/40 transition-all leading-[1.5]",
                      "disabled:opacity-50 min-h-[44px] block"
                    )}
                    style={{ maxHeight: 120 }}
                    placeholder="Ask anything about your ledger…"
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={onKeyDown}
                    disabled={isLoading}
                  />
                  <Sparkles className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-primary/30 pointer-events-none" />
                </div>
                {/* Plain <button> — bypasses shadcn size/padding overrides for pixel-perfect centering */}
                <button
                  type="submit"
                  disabled={isLoading || isInputEmpty}
                  className={cn(
                    "shrink-0 w-11 h-11 rounded-xl bg-primary text-primary-foreground",
                    "flex items-center justify-center",
                    "shadow-md shadow-primary/10 transition-all",
                    "hover:scale-105 active:scale-95",
                    "disabled:pointer-events-none",
                    isInputEmpty ? "opacity-60" : "opacity-100"
                  )}
                >
                  {isLoading
                    ? <Loader2 className="w-5 h-5 animate-spin" />
                    : <Send className="w-5 h-5 translate-x-px -translate-y-px" />
                  }
                </button>
              </form>
              <p className="text-[10px] text-muted-foreground/40 mt-1.5 px-1 flex items-center justify-between">
                <span>Enter to send · Shift+Enter for newline</span>
                <span>Esc to close</span>
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── FAB ── */}
      {/* The wrapper div handles the badge — do NOT put overflow-hidden on the button itself */}
      <div className="relative">
        <motion.button
          whileHover={{ scale: 1.07 }}
          whileTap={{ scale: 0.93 }}
          className={cn(
            "relative w-14 h-14 rounded-full flex items-center justify-center shadow-2xl transition-colors duration-300",
            isOpen
              ? "bg-card border border-border text-muted-foreground"
              : "bg-primary text-primary-foreground"
          )}
          onClick={() => setIsOpen(!isOpen)}
          aria-label={isOpen ? "Close AI chat" : "Open AI chat"}
        >
          {/* Shimmer overlay — clipped inside the button, not the outer wrapper */}
          {!isOpen && (
            <div className="absolute inset-0 rounded-full overflow-hidden pointer-events-none">
              <div className="absolute inset-0 bg-gradient-to-tr from-white/0 via-white/10 to-white/0 opacity-0 hover:opacity-100 transition-opacity" />
            </div>
          )}

          <AnimatePresence mode="wait" initial={false}>
            <motion.span
              key={isOpen ? "close" : "open"}
              initial={{ rotate: -90, opacity: 0 }}
              animate={{ rotate: 0, opacity: 1 }}
              exit={{ rotate: 90, opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="flex"
            >
              {isOpen ? <X className="w-6 h-6" /> : <MessageSquare className="w-6 h-6" />}
            </motion.span>
          </AnimatePresence>
        </motion.button>

        {/* Unread badge — lives OUTSIDE the button so overflow-hidden can't clip it */}
        <AnimatePresence>
          {!isOpen && unreadCount > 0 && (
            <motion.span
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0 }}
              className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold flex items-center justify-center border-2 border-background shadow-sm pointer-events-none"
            >
              {unreadCount > 9 ? "9+" : unreadCount}
            </motion.span>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
