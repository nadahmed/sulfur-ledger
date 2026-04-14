"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Mail, Sparkles, Bot, Terminal, Briefcase, Zap } from "lucide-react";
import Link from "next/link";

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-50 pb-24">
      {/* Hero Section */}
      <section className="pt-32 pb-16 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <Badge variant="outline" className="mb-6 px-4 py-1.5 rounded-full border-primary/40 text-primary bg-primary/5 font-bold uppercase tracking-widest text-[10px]">
            <Sparkles className="w-3 h-3 mr-2" />
            The Origin Story
          </Badge>
          <h1 className="text-5xl md:text-7xl font-black mb-8 italic tracking-tighter uppercase leading-[0.9]">
            The Weekend project <br /> 
            <span className="text-neutral-600">That Never Ended.</span>
          </h1>
          <p className="text-neutral-400 text-xl md:text-2xl leading-relaxed max-w-2xl mx-auto italic">
            "Any sufficiently advanced technology is indistinguishable from magic." — <span className="text-white">Arthur C. Clarke</span>
          </p>
        </div>
      </section>

      {/* Main Content */}
      <section className="px-4">
        <div className="max-w-4xl mx-auto space-y-16">
          
          {/* The Experiment Section */}
          <div className="grid md:grid-cols-[1fr_300px] gap-12 items-start">
            <div className="space-y-6">
              <h2 className="text-3xl font-bold italic uppercase flex items-center gap-3">
                <Bot className="w-8 h-8 text-primary" />
                The AI Experiment
              </h2>
              <div className="space-y-4 text-neutral-400 text-lg leading-relaxed text-balance">
                <p>
                  Let's be honest: <span className="text-white font-medium">Sulfur Book was created entirely by AI coding agents.</span> From the database schema to the styling, zero lines of code were manually written by a human. 
                </p>
                <p>
                  It started as a simple weekend prototype and somehow evolved into a functional part of my daily workflow. If you find a bug, it’s probably because the agent was dreaming of electric sheep. If you find a feature you love, well, the computer actually listened for once.
                </p>
                <div className="p-4 bg-primary/5 border border-primary/20 rounded-xl">
                  <h4 className="text-white font-bold mb-2 flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-primary" />
                    Why Sulfur?
                  </h4>
                  <p className="text-sm italic">
                    Because "The Grey Simple Ledger App" was already taken (probably). Also, sulfur is essential, light, and sounds significantly more interesting than a spreadsheet.
                  </p>
                </div>
                <p className="text-sm text-red-400/80 font-medium uppercase tracking-wider box-decoration-clone">
                  ⚠️ USE AT YOUR OWN RISK. THE AGENTS ARE STILL LEARNING.
                </p>
              </div>
            </div>
            
            <Card className="bg-neutral-900/50 border-neutral-800 p-6 backdrop-blur-sm">
                <h4 className="font-bold mb-4 text-sm uppercase tracking-widest text-neutral-500">The Actual Stack</h4>
                <div className="space-y-3">
                    <StackBadge label="Next.js 15+" />
                    <StackBadge label="PostgreSQL" />
                    <StackBadge label="Netlify Functions" />
                    <StackBadge label="Auth0 + Google OAuth" />
                    <StackBadge label="Google Antigravity" />
                </div>
            </Card>
          </div>

          {/* Roadmap Section */}
          <div className="text-center space-y-4">
             <h3 className="text-2xl font-bold italic uppercase tracking-tighter">The "Roadmap"</h3>
             <p className="text-neutral-500 text-sm max-w-lg mx-auto">
               We're taking it one prompt at a time. No charts, no deadlines, just vibes and whatever features the AI thinks I need next. That said, if this app actually helps you, I’m all ears.
             </p>
          </div>

          {/* The Human Behind the Screen */}
          <div className="bg-neutral-900/30 border border-neutral-800 rounded-3xl p-8 md:p-12 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 blur-[100px] -z-10" />
            
            <div className="flex flex-col md:flex-row gap-10 items-center md:items-start">
               <div className="w-24 h-24 rounded-2xl bg-gradient-to-br from-primary to-primary/40 flex items-center justify-center shrink-0">
                  <Terminal className="w-12 h-12 text-black" />
               </div>
               <div className="space-y-6">
                  <h2 className="text-3xl font-bold italic uppercase flex items-center gap-3">
                    <Briefcase className="w-8 h-8 text-primary" />
                    The Human Behind the Screen
                  </h2>
                  <div className="space-y-4 text-neutral-400 text-lg leading-relaxed">
                    <p>
                      I'm <span className="text-white font-bold">Noor Ahmed</span>. When I’m not orchestrating AI agents, I’m using Sulfur Book to make sure my own bank balance doesn't become a work of fantasy. 
                    </p>
                    <p className="text-sm bg-neutral-800/50 p-4 rounded-lg border border-neutral-700 italic">
                      "I use it daily via MCP, OpenClaw, and Telegram. If it keeps my sanity in check, it might just work for you too."
                    </p>
                    <p className="text-primary font-medium border-l-2 border-primary/30 pl-4">
                      🚀 I am currently looking for a job as a FullStack Software Developer.
                    </p>
                    <p>
                      If you're looking for a developer who knows how to leverage modern AI tools to build scalable systems (or just wants to talk about prompt engineering), let's connect.
                    </p>
                    
                    <div className="flex flex-wrap gap-4 pt-4">
                      <Link href="https://github.com/nadahmed/sulfur-ledger" target="_blank">
                        <Button variant="outline" className="gap-2 border-neutral-700 hover:bg-white hover:text-black">
                          <Terminal className="w-4 h-4" />
                          GitHub Project
                        </Button>
                      </Link>
                      <Link href="mailto:nooraldinahmed@gmail.com">
                        <Button className="gap-2 bg-primary hover:bg-primary/90 text-black font-bold">
                          <Mail className="w-4 h-4" />
                          Email Me
                        </Button>
                      </Link>
                    </div>
                  </div>
               </div>
            </div>
          </div>

          <div className="text-center pt-8">
            <p className="text-neutral-600 text-sm italic">
              Made with ❤️ and a lot of prompts by Nooraldin Ahmed.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}

function StackBadge({ label }: { label: string }) {
    return (
        <div className="flex items-center gap-2 px-3 py-2 bg-neutral-800 rounded-lg border border-neutral-700">
            <div className="w-1.5 h-1.5 rounded-full bg-primary" />
            <span className="text-xs font-mono text-neutral-300">{label}</span>
        </div>
    );
}
