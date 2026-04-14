"use client";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Shield, Lock, FileText, Mail, ArrowLeft, Globe, Database, UserCheck } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function PrivacyPolicyPage() {
  const lastUpdated = "April 6, 2026";

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-50 pb-24">
      {/* Hero Section */}
      <section className="pt-32 pb-16 px-4 border-b border-neutral-900">
        <div className="max-w-4xl mx-auto text-center">
          <Badge variant="outline" className="mb-6 px-4 py-1.5 rounded-full border-primary/40 text-primary bg-primary/5 font-bold uppercase tracking-widest text-[10px]">
            <Shield className="w-3 h-3 mr-2" />
            Legal & Trust
          </Badge>
          <h1 className="text-5xl md:text-7xl font-black mb-8 italic tracking-tighter uppercase leading-[0.9]">
            Privacy <br />
            <span className="text-neutral-600">Policy.</span>
          </h1>
          <p className="text-neutral-400 text-xl leading-relaxed max-w-2xl mx-auto italic">
            At <span className="text-white">Sulfur Book</span>, we believe your financial data should be as secure as a vault and as transparent as glass.
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

            {/* 1. Introduction */}
            <div className="space-y-6">
              <h2 className="text-3xl font-bold italic uppercase flex items-center gap-3">
                <Globe className="w-8 h-8 text-primary" />
                1. Introduction
              </h2>
              <div className="space-y-4 text-neutral-400 text-lg leading-relaxed">
                <p>
                  Sulfur Book ("we," "our," or "the platform") is committed to protecting your privacy. This Privacy Policy explains how we collect, use, and safeguard your information when you use our double-entry bookkeeping services.
                </p>
                <p>
                  By using Sulfur Book, you agree to the collection and use of information in accordance with this policy. As an AI-orchestrated platform, we strive for maximum automation with human-grade security.
                </p>
              </div>
            </div>

            {/* 2. Information We Collect */}
            <div className="space-y-6">
              <h2 className="text-3xl font-bold italic uppercase flex items-center gap-3">
                <UserCheck className="w-8 h-8 text-primary" />
                2. Information We Collect
              </h2>
              <Card className="bg-neutral-900/50 border-neutral-800 p-8 backdrop-blur-sm">
                <div className="grid md:grid-cols-2 gap-12">
                  <div className="space-y-4">
                    <h4 className="text-white font-bold flex items-center gap-2 uppercase tracking-tight">
                      <Lock className="w-4 h-4 text-primary" />
                      Personal Data
                    </h4>
                    <p className="text-sm text-neutral-400 leading-relaxed">
                      We collect basic identity information through <span className="text-white font-medium">Auth0</span>, including your name, email address, and profile picture. This is used solely for authentication and account management.
                    </p>
                  </div>
                  <div className="space-y-4">
                    <h4 className="text-white font-bold flex items-center gap-2 uppercase tracking-tight">
                      <Database className="w-4 h-4 text-primary" />
                      Financial Data
                    </h4>
                    <p className="text-sm text-neutral-400 leading-relaxed">
                      Any journal entries, account names, and financial transactions you input are stored in our secure <span className="text-white font-medium">PostgreSQL</span> infrastructure. We do not access this data unless required for technical support.
                    </p>
                  </div>
                </div>
              </Card>
            </div>

            {/* 3. How We Use Data */}
            <div className="space-y-6">
              <h2 className="text-3xl font-bold italic uppercase flex items-center gap-3">
                <FileText className="w-8 h-8 text-primary" />
                3. Data Usage & Processing
              </h2>
              <div className="space-y-4 text-neutral-400 text-lg leading-relaxed decoration-primary/20">
                <p>
                  Your data is used primarily to provide and maintain the service. This includes:
                </p>
                <ul className="space-y-3 list-none">
                  {["Generating real-time financial statements", "Maintaining an immutable activity log for audit trails", "Providing personalized organization management", "Improving our AI-driven ledger features"].map((item, i) => (
                    <li key={i} className="flex items-center gap-4 text-neutral-300">
                      <div className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
                      <span className="text-sm font-medium italic">{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* 4. Sub-processors */}
            <div className="space-y-8">
              <div className="text-center">
                <h2 className="text-3xl font-bold italic uppercase mb-4">Trusted Partners</h2>
                <p className="text-neutral-500 text-sm italic">We only work with industry leaders to ensure your data stays safe.</p>
              </div>

              <div className="grid sm:grid-cols-2 md:grid-cols-4 gap-4">
                <SubProcessor name="Auth0" role="Identity & Security" />
                <SubProcessor name="AWS" role="Data Infrastructure" />
                <SubProcessor name="Netlify" role="Hosting & Analytics" />
                <SubProcessor name="Google" role="Usage Tracking" />
              </div>
            </div>

            {/* 5. Security */}
            <div className="bg-primary/5 border border-primary/20 rounded-3xl p-8 md:p-12 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-64 h-64 bg-primary/10 blur-[100px] -z-10" />
              <div className="flex flex-col md:flex-row gap-8 items-center text-center md:text-left">
                <div className="w-20 h-20 rounded-2xl bg-primary flex items-center justify-center shrink-0">
                  <Lock className="w-10 h-10 text-black px-2 py-1 flex items-center justify-center" />
                </div>
                <div className="space-y-3">
                  <h3 className="text-2xl font-bold italic uppercase tracking-tighter">Enterprise-Grade Security</h3>
                  <p className="text-neutral-400 leading-relaxed text-sm">
                    Even though Sulfur Book was built by AI, we follow rigorous security standards. All data is encrypted in transit and at rest. We utilize stateless authentication to ensure your secrets never stay on our servers longer than necessary.
                  </p>
                </div>
              </div>
            </div>

            {/* 6. User Rights */}
            <div className="space-y-6">
              <h2 className="text-3xl font-bold italic uppercase flex items-center gap-3">
                <Shield className="w-8 h-8 text-primary" />
                4. Your Rights
              </h2>
              <div className="space-y-4 text-neutral-400 text-lg leading-relaxed">
                <p>
                  Regardless of your location, we respect your rights to:
                </p>
                <div className="grid md:grid-cols-3 gap-6">
                  <Card className="p-6 bg-neutral-900 border-neutral-800">
                    <h5 className="text-white font-bold mb-2 uppercase text-xs tracking-widest">Access</h5>
                    <p className="text-xs italic">Request a copy of the data we hold about you.</p>
                  </Card>
                  <Card className="p-6 bg-neutral-900 border-neutral-800">
                    <h5 className="text-white font-bold mb-2 uppercase text-xs tracking-widest">Erasure</h5>
                    <p className="text-xs italic">Request that we delete your account and all associated data.</p>
                  </Card>
                  <Card className="p-6 bg-neutral-900 border-neutral-800">
                    <h5 className="text-white font-bold mb-2 uppercase text-xs tracking-widest">Portability</h5>
                    <p className="text-xs italic">Export your journal entries in JSON format at any time from your dashboard.</p>
                  </Card>
                </div>
              </div>
            </div>

            {/* 7. Contact */}
            <div className="text-center space-y-8 pt-12">
              <div className="space-y-4">
                <h3 className="text-2xl font-bold italic uppercase tracking-tighter">Questions?</h3>
                <p className="text-neutral-500 text-sm max-w-lg mx-auto">
                  If you have concerns about your privacy or wish to exercise your rights, please reach out to our human overseer.
                </p>
              </div>
              <Link href="mailto:nooraldinahmed@gmail.com">
                <Button className="gap-2 bg-primary hover:bg-primary/90 text-black font-bold h-12 px-8">
                  <Mail className="w-4 h-4" />
                  Email Privacy Officer
                </Button>
              </Link>
            </div>

          </div>
        </div>
      </section>

      <footer className="max-w-4xl mx-auto px-4 text-center">
        <p className="text-neutral-600 text-[10px] uppercase tracking-[0.2em] font-bold">
          Sulfur Book — Precision Engineered Privacy
        </p>
      </footer>
    </div>
  );
}

function SubProcessor({ name, role }: { name: string, role: string }) {
  return (
    <Card className="bg-neutral-900/40 border-neutral-800 p-6 flex flex-col items-center text-center gap-3 group hover:border-primary/30 transition-colors">
      <div className="w-10 h-10 rounded-full bg-neutral-800 flex items-center justify-center group-hover:bg-primary/10 transition-colors">
        <Globe className="w-5 h-5 text-neutral-500 group-hover:text-primary transition-colors" />
      </div>
      <div>
        <h4 className="text-white font-bold text-sm tracking-tight">{name}</h4>
        <p className="text-xs text-neutral-500 font-mono italic">{role}</p>
      </div>
    </Card>
  );
}
