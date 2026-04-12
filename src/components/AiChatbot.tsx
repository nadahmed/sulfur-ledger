"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { MessageSquare, X, Send, Bot, Trash2, RotateCcw, Sparkles, ChevronDown, Loader2, Terminal, CheckCircle2 } from "lucide-react";
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

export default function AiChatbot() {
  const { user } = useUser();
  const { activeOrganizationId, isOwner, organizations } = useOrganization();
  const [isOpen, setIsOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  
  const orgIdRef = useRef(activeOrganizationId);
  useEffect(() => {
    orgIdRef.current = activeOrganizationId;
  }, [activeOrganizationId]);

  // Fetch history
  useEffect(() => {
    if (activeOrganizationId && isOpen) {
      fetch(`/api/ai/history?orgId=${activeOrganizationId}`)
        .then(res => res.json())
        .then(data => {
          if (Array.isArray(data)) {
            setMessages(data.map(m => ({
              id: m.id,
              role: m.role,
              content: m.content,
              metadata: {
                createdAt: m.timestamp,
                userInitials: m.userInitials
              }
            })));
          }
        });
    }
  }, [activeOrganizationId, isOpen]);

  // Soketi/Pusher Subscription
  useEffect(() => {
    if (!activeOrganizationId) return;

    const pusher = getPusherClient();
    const channel = pusher.subscribe(`org-${activeOrganizationId}`);

    channel.bind("ai-message", (data: any) => {
      console.log("[AI CHAT] Received real-time message:", data);
      
      setMessages(prev => {
        // Avoid duplicates if message already exists (e.g. from history fetch race condition)
        if (prev.find(m => m.id === data.id)) return prev;
        return [...prev, data];
      });
      setIsLoading(false);
    });

    return () => {
      pusher.unsubscribe(`org-${activeOrganizationId}`);
      pusher.disconnect();
    };
  }, [activeOrganizationId]);

  // Scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  if (!activeOrganizationId) return null;

  const onFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;
    
    const userText = input;
    setInput("");
    setIsLoading(true);

    const org = organizations.find(o => o.id === activeOrganizationId);
    const localTime = new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
      timeZoneName: 'short'
    }).format(new Date());

    // Calculate initials from user data
    const userInitials = user?.name
      ? user.name.split(" ").map((n: string) => n[0]).join("").toUpperCase().substring(0, 2)
      : (user?.nickname?.substring(0, 2).toUpperCase() || "U");

    const userMessage: Message = {
      id: uuidv7(),
      role: "user",
      content: userText,
      timestamp: new Date().toISOString(),
      metadata: {
        userInitials: userInitials
      }
    };

    setMessages(prev => [...prev, userMessage]);

    try {
      const response = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [...messages, userMessage],
          orgId: activeOrganizationId,
          localTime: new Intl.DateTimeFormat('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: true
          }).format(new Date())
        }),
      });

      if (!response.ok) {
        setIsLoading(false);
        throw new Error("Failed to send message");
      }

      // We don't read the body stream anymore. 
      // The AI response will arrive via Pusher.
      console.log("[AI CHAT] Message sent successfully, waiting for Pusher event...");
      
    } catch (err: any) {
      toast.error(`AI Error: ${err.message}`);
      setIsLoading(false);
    }
  };

  const deleteMessage = async (msgId: string, timestamp: string) => {
    const res = await fetch(`/api/ai/history?orgId=${activeOrganizationId}&msgId=${msgId}&timestamp=${timestamp}`, {
      method: "DELETE"
    });
    if (res.ok) {
      setMessages(messages.filter(m => m.id !== msgId));
      toast.success("Message deleted");
    }
  };

  return (
    <div className="fixed bottom-4 right-4 sm:bottom-6 sm:right-6 z-50 flex flex-col items-end">
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.98 }}
            className="mb-4 w-[calc(100vw-2rem)] sm:w-[400px] h-[500px] sm:h-[580px] max-h-[85vh] flex flex-col overflow-hidden drop-shadow-2xl"
          >
            <Card className="flex-1 flex flex-col border-primary/50 bg-card shadow-2xl relative overflow-hidden border-2 pt-0 gap-0">
              {/* Header */}
              <div className="p-4 border-b border-primary/20 bg-primary/5 flex items-center justify-between relative z-10">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center shadow-lg shadow-primary/20">
                    <Bot className="w-5 h-5 text-primary-foreground" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-foreground flex items-center gap-1.5">
                      Sulfur AI
                      <div className="flex items-center gap-1.5 opacity-40">
                        <Terminal className="size-3" />
                      </div>
                    </h3>
                  </div>
                </div>
                <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full hover:bg-primary/10" onClick={() => setIsOpen(false)}>
                  <ChevronDown className="w-4 h-4" />
                </Button>
              </div>

              {/* Messages Area */}
              <div 
                ref={scrollRef}
                className="flex-1 overflow-y-auto p-4 space-y-6 scrollbar-thin scrollbar-thumb-primary/10"
              >
                {messages.length === 0 && !isLoading && (
                  <div className="h-full flex flex-col items-center justify-center text-center p-8 space-y-4">
                    <div className="w-16 h-16 rounded-3xl bg-primary/5 border border-primary/10 flex items-center justify-center animate-bounce duration-1000">
                      <Sparkles className="w-8 h-8 text-primary/40" />
                    </div>
                    <div>
                      <h4 className="font-bold text-foreground italic">AI Financial Expert</h4>
                      <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                        I'm Sulfur, your financial expert assistant. Rebuilt for efficiency.
                      </p>
                    </div>
                  </div>
                )}

                {messages.map((m) => (
                  <div 
                    key={m.id} 
                    className={cn(
                      "flex gap-3 animate-in fade-in slide-in-from-bottom-2 duration-300",
                      m.role === "user" ? "flex-row-reverse" : "flex-row"
                    )}
                  >
                    <div className={cn(
                      "w-8 h-8 rounded-xl flex items-center justify-center shrink-0 border shadow-sm text-[10px] font-bold uppercase",
                      m.role === "user" 
                        ? "bg-primary text-primary-foreground border-primary/20" 
                        : "bg-muted text-muted-foreground border-border"
                    )}>
                      {m.role === "assistant" ? <Bot className="w-4 h-4" /> : m.metadata?.userInitials || "U"}
                    </div>

                    <div className={cn(
                      "group relative max-w-[80%] flex flex-col gap-2",
                      m.role === "user" ? "items-end" : "items-start"
                    )}>
                      <div className={cn(
                        "p-3 rounded-2xl text-sm leading-relaxed",
                        m.role === "user" 
                          ? "bg-primary text-primary-foreground rounded-tr-none shadow-md shadow-primary/20" 
                          : "bg-background border border-border rounded-tl-none text-foreground shadow-sm"
                      )}>
                        <ReactMarkdown 
                          remarkPlugins={[remarkGfm]}
                          components={{
                            p: ({ children }) => <p className="mb-2 last:mb-0 whitespace-pre-wrap">{children}</p>,
                            ul: ({ children }) => <ul className="list-disc pl-4 mb-2 mt-1 space-y-1">{children}</ul>,
                            ol: ({ children }) => <ol className="list-decimal pl-4 mb-2 mt-1 space-y-1">{children}</ol>,
                            li: ({ children }) => <li className="leading-relaxed">{children}</li>,
                            strong: ({ children }) => <strong className="font-bold">{children}</strong>,
                            em: ({ children }) => <em className="italic opacity-90">{children}</em>,
                            code: ({ children }) => (
                              <code className="bg-muted px-1.5 py-0.5 rounded font-mono text-xs border border-border/50">
                                {children}
                              </code>
                            ),
                            a: ({ children, href }) => (
                              <a 
                                href={href} 
                                target="_blank" 
                                rel="noopener noreferrer" 
                                className="text-primary underline underline-offset-2 hover:text-primary/80 transition-colors"
                              >
                                {children}
                              </a>
                            ),
                            h1: ({ children }) => <h1 className="text-lg font-bold mb-2 mt-4">{children}</h1>,
                            h2: ({ children }) => <h2 className="text-base font-bold mb-2 mt-3">{children}</h2>,
                            h3: ({ children }) => <h3 className="text-sm font-bold mb-1 mt-2">{children}</h3>,
                            blockquote: ({ children }) => (
                              <blockquote className="border-l-4 border-primary/20 pl-4 py-1 my-2 italic text-muted-foreground bg-muted/30 rounded-r-lg">
                                {children}
                              </blockquote>
                            ),
                          }}
                        >
                          {m.content}
                        </ReactMarkdown>
                      </div>

                      {isOwner && (
                        <div className={cn(
                          "opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-2",
                          m.role === "user" ? "flex-row-reverse" : "flex-row"
                        )}>
                          <button 
                            className="text-[10px] text-muted-foreground hover:text-destructive flex items-center gap-1 bg-muted/30 px-2 py-0.5 rounded-full"
                            onClick={() => deleteMessage(m.id, m.metadata?.createdAt || new Date().toISOString())}
                          >
                            <Trash2 className="w-3 h-3" /> Delete
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}

                {isLoading && messages[messages.length-1]?.role === 'user' && (
                  <div className="flex gap-3 animate-pulse">
                    <div className="w-8 h-8 rounded-xl bg-muted border border-border flex items-center justify-center">
                      <div className="w-4 h-4 rounded-full border-2 border-primary/20 border-t-primary animate-spin" />
                    </div>
                    <div className="bg-muted/50 border border-border p-3 rounded-2xl rounded-tl-none">
                      <div className="flex gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-primary/40 animate-bounce" />
                        <span className="w-1.5 h-1.5 rounded-full bg-primary/40 animate-bounce [animation-delay:0.2s]" />
                        <span className="w-1.5 h-1.5 rounded-full bg-primary/40 animate-bounce [animation-delay:0.4s]" />
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Input Area */}
              <div className="p-4 border-t border-primary/20 bg-card">
                <form 
                  onSubmit={onFormSubmit}
                  className="flex items-center gap-2"
                >
                  <div className="flex-1 relative group/input">
                    <input 
                      className="w-full bg-background/50 border border-primary/20 rounded-2xl p-3 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 focus:bg-background transition-all placeholder:text-muted-foreground/40 shadow-inner"
                      placeholder="Ask me something about the ledger..."
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      disabled={isLoading}
                    />
                    <Sparkles className="absolute right-3 top-3.5 w-4 h-4 text-primary/30 group-focus-within/input:text-primary transition-colors pointer-events-none" />
                  </div>
                  <Button 
                    type="submit" 
                    size="icon" 
                    className="rounded-xl h-[46px] w-[46px] shadow-lg shadow-primary/20 hover:scale-105 active:scale-95 transition-all"
                    disabled={isLoading || !input.trim()}
                  >
                    {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
                  </Button>
                </form>
                <div className="mt-2 flex items-center justify-between">
                  <p className="text-[10px] text-muted-foreground/60 px-2 italic">
                    I can perform actions on your behalf after confirmation.
                  </p>
                </div>
              </div>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.button
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        className={cn(
          "w-14 h-14 rounded-full flex items-center justify-center shadow-2xl transition-all duration-300 relative group",
          isOpen ? "bg-muted text-foreground border border-border" : "bg-primary text-primary-foreground"
        )}
        onClick={() => setIsOpen(!isOpen)}
      >
        <div className="absolute inset-0 bg-gradient-to-tr from-primary/20 via-transparent to-white/10 opacity-0 group-hover:opacity-100 transition-opacity rounded-full" />
        {isOpen ? <X className="w-6 h-6" /> : <MessageSquare className="w-6 h-6" />}
        {!isOpen && (
          <span className="absolute -top-1 -right-1 flex h-4 w-4">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
            <span className="relative inline-flex rounded-full h-4 w-4 bg-primary border-2 border-background"></span>
          </span>
        )}
      </motion.button>
    </div>
  );
}
