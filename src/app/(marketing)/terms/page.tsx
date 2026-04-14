"use client";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Scale, Info, Terminal, ShieldAlert, Gavel, Globe, CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function TermsOfServicePage() {
  const lastUpdated = "April 6, 2026";

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-50 pb-24">
      {/* Hero Section */}
      <section className="pt-32 pb-16 px-4 border-b border-neutral-900">
        <div className="max-w-4xl mx-auto text-center">
          <Badge variant="outline" className="mb-6 px-4 py-1.5 rounded-full border-primary/40 text-primary bg-primary/5 font-bold uppercase tracking-widest text-[10px]">
            <Scale className="w-3 h-3 mr-2" />
            Terms of Use
          </Badge>
          <h1 className="text-5xl md:text-7xl font-black mb-8 italic tracking-tighter uppercase leading-[0.9]">
            Terms of <br />
            <span className="text-neutral-600">Service.</span>
          </h1>
          <p className="text-neutral-400 text-xl leading-relaxed max-w-2xl mx-auto italic text-balance">
            By using <span className="text-white">Sulfur Book</span>, you agree to these terms. Please read them as carefully as you read your balance sheets.
          </p>
          <div className="mt-8 flex items-center justify-center gap-4 text-xs font-mono text-neutral-500">
            <span>Last Updated: {lastUpdated}</span>
            <div className="w-1 h-1 rounded-full bg-neutral-800" />
            <span>Version 1.0</span>
          </div>
        </div>
      </section>

      {/* Main Content */}
      <section className="px-4 py-20">
        <div className="max-w-4xl mx-auto">
          <div className="grid gap-16">

            {/* 1. Acceptance */}
            <div className="space-y-6">
              <h2 className="text-3xl font-bold italic uppercase flex items-center gap-3">
                <CheckCircle2 className="w-8 h-8 text-primary" />
                1. Acceptance of Terms
              </h2>
              <div className="space-y-4 text-neutral-400 text-lg leading-relaxed">
                <p>
                  By accessing or using Sulfur Book, you agree to be bound by these Terms of Service. If you do not agree to all of these terms, do not use the platform.
                </p>
                <p>
                  These terms apply to all visitors, users, and others who access or use the Service. We reserve the right to modify these terms at any time, and your continued use of Sulfur Book signifies your acceptance of any such changes.
                </p>
              </div>
            </div>

            {/* 2. Professional Advice Disclaimer */}
            <div className="space-y-6">
              <h2 className="text-3xl font-bold italic uppercase flex items-center gap-3">
                <ShieldAlert className="w-8 h-8 text-primary" />
                2. Professional Advice Disclaimer
              </h2>
              <Card className="bg-primary/5 border border-primary/20 rounded-3xl p-8 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-64 h-64 bg-primary/10 blur-[100px] -z-10" />
                <div className="space-y-4">
                  <h4 className="text-white font-bold flex items-center gap-2 uppercase tracking-tight italic">
                    Read Carefully
                  </h4>
                  <p className="text-sm text-neutral-400 leading-relaxed italic">
                    Sulfur Book is a double-entry bookkeeping platform and record-keeping tool. <span className="text-white font-medium italic underline decoration-primary/30">It is not a substitute for professional accounting, legal, or tax advice.</span> We provide tools for data entry and reporting, but we are not responsible for how you interpret or use this data.
                  </p>
                  <p className="text-xs text-primary font-bold uppercase tracking-widest">
                    Consult a certified professional for any tax or legal compliance matters.
                  </p>
                </div>
              </Card>
            </div>

            {/* 3. User Conduct */}
            <div className="space-y-6">
              <h2 className="text-3xl font-bold italic uppercase flex items-center gap-3">
                <Terminal className="w-8 h-8 text-primary" />
                3. User Conduct & Accounts
              </h2>
              <div className="space-y-4 text-neutral-400 text-lg leading-relaxed">
                <p>
                  To access features of Sulfur Book, you must authenticate through Auth0. You agree to:
                </p>
                <ul className="space-y-3 list-none">
                  {["Provide accurate and complete registration information", "Maintain the security of your account and credentials", "Take full responsibility for any activity that occurs under your account", "Avoid using the service for any illegal or unauthorized purposes"].map((item, i) => (
                    <li key={i} className="flex items-start gap-4 text-neutral-300">
                      <div className="w-2 h-2 rounded-full bg-primary shrink-0 mt-2.5" />
                      <span className="text-sm font-medium italic">{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* 4. Intellectual Property */}
            <div className="space-y-6">
              <h2 className="text-3xl font-bold italic uppercase flex items-center gap-3">
                <Info className="w-8 h-8 text-primary" />
                4. Intellectual Property
              </h2>
              <div className="space-y-4 text-neutral-400 text-lg leading-relaxed">
                <p>
                  The Service and its original content (excluding user-provided data), features, and functionality are and will remain the exclusive property of Sulfur Book and its licensors.
                </p>
                <p className="text-sm italic">
                  "Sulfur Book" and its logo are trademarks of the platform. You may not use our branding without express permission.
                </p>
              </div>
            </div>

            {/* 5. Limitation of Liability */}
            <div className="space-y-6">
              <h2 className="text-3xl font-bold italic uppercase flex items-center gap-3">
                <Gavel className="w-8 h-8 text-primary" />
                5. Limitation of Liability
              </h2>
              <div className="space-y-4 text-neutral-400 text-lg leading-relaxed text-balance">
                <p>
                  In no event shall Sulfur Book, nor its director, Noor Ahmed, be liable for any indirect, incidental, special, consequential, or punitive damages, including without limitation, loss of profits, data, use, goodwill, or other intangible losses, resulting from:
                </p>
                <div className="grid md:grid-cols-2 gap-4">
                  <LiabilityCard title="Server Downtime" desc="Interruptions in service due to AWS, Netlify, or Database outages." />
                  <DataCard title="Data Inaccuracy" desc="Errors in reports resulting from incorrect manual journal entries." />
                </div>
              </div>
            </div>

            {/* 6. Governing Law */}
            <div className="space-y-6">
              <h2 className="text-3xl font-bold italic uppercase flex items-center gap-3">
                <Globe className="w-8 h-8 text-primary" />
                6. Governing Law
              </h2>
              <div className="space-y-4 text-neutral-400 text-lg leading-relaxed">
                <p>
                  These Terms shall be governed and construed in accordance with the laws of your jurisdiction, without regard to its conflict of law provisions.
                </p>
              </div>
            </div>

          </div>
        </div>
      </section>

      <footer className="max-w-4xl mx-auto px-4 text-center">
        <p className="text-neutral-600 text-[10px] uppercase tracking-[0.2em] font-bold">
          Sulfur Book — Professional Standards, AI Integrity
        </p>
      </footer>
    </div>
  );
}

function LiabilityCard({ title, desc }: { title: string, desc: string }) {
  return (
    <Card className="p-6 bg-neutral-900 border-neutral-800">
      <h5 className="text-white font-bold mb-2 uppercase text-xs tracking-widest">{title}</h5>
      <p className="text-xs italic text-neutral-500">{desc}</p>
    </Card>
  );
}

function DataCard({ title, desc }: { title: string, desc: string }) {
  return (
    <Card className="p-6 bg-neutral-900 border-neutral-800">
      <h5 className="text-white font-bold mb-2 uppercase text-xs tracking-widest">{title}</h5>
      <p className="text-xs italic text-neutral-500">{desc}</p>
    </Card>
  );
}
