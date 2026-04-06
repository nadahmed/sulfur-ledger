"use client";

import { useUser } from "@auth0/nextjs-auth0/client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  ArrowRight, 
  CheckCircle2, 
  Shield, 
  Zap, 
  BarChart4, 
  Users, 
  Globe, 
  Sparkles,
  Bot,
  Database,
  Search,
  PieChart as PieChartIcon
} from "lucide-react";
import Link from "next/link";

export default function LandingPage() {
  const { user, isLoading } = useUser();
  const router = useRouter();

  return (
    <div className="flex flex-col items-center">
      {/* Hero Section */}
      <section className="relative w-full overflow-hidden pt-20 pb-32 md:pt-32 md:pb-48">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-full -z-10 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-primary/10 via-transparent to-transparent opacity-50" />
        
        <div className="max-w-7xl mx-auto px-4 text-center">
          <Badge variant="outline" className="mb-6 rounded-full px-4 py-1 border-primary/30 text-primary bg-primary/5 animate-pulse">
            <Sparkles className="w-3 h-3 mr-2" />
            AI-Powered Bookkeeping Evolution
          </Badge>
          
          <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight mb-8 text-white bg-gradient-to-b from-white via-white to-neutral-500 bg-clip-text supports-[background-clip:text]:text-transparent italic decoration-primary">
            Precision Accounting,<br />At Warp Speed.
          </h1>
          
          <p className="text-xl text-neutral-400 max-w-2xl mx-auto mb-10 leading-relaxed">
            Sulfur Book is the modern professional standard for double-entry bookkeeping. 
            Automated workflows, AI insights, and real-time reporting for ambitious teams.
          </p>
          
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-20">
            {user ? (
              <Link href="/app/dashboard">
                <Button size="lg" className="h-14 px-8 text-lg font-bold bg-primary hover:bg-primary/90 shadow-[0_0_20px_-5px_var(--color-primary)]">
                  Back to Dashboard
                  <ArrowRight className="ml-2 w-5 h-5" />
                </Button>
              </Link>
            ) : (
              <Link href="/app/onboarding">
                <Button size="lg" className="h-14 px-8 text-lg font-bold bg-primary hover:bg-primary/90 shadow-[0_0_20px_-5px_var(--color-primary)]">
                  Start for Free
                  <ArrowRight className="ml-2 w-5 h-5" />
                </Button>
              </Link>
            )}
            <Link href="#features">
              <Button size="lg" variant="outline" className="h-14 px-8 text-lg font-bold border-neutral-700 bg-neutral-900/50 hover:bg-neutral-800 transition-all">
                View Features
              </Button>
            </Link>
          </div>

          {/* Hero Image / Mockup */}
          <div className="relative max-w-5xl mx-auto rounded-3xl border border-neutral-800 bg-neutral-900/50 p-2 shadow-2xl group">
            <div className="absolute inset-x-0 -top-px h-px bg-gradient-to-r from-transparent via-primary/50 to-transparent" />
            <div className="overflow-hidden rounded-[calc(1.5rem-4px)]">
              <img 
                src="/dashboard_new.png" 
                alt="Sulfur Book Dashboard" 
                className="w-full h-auto group-hover:scale-[1.01] transition-transform duration-700 ease-out"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Trust / Stats Section */}
      <section className="w-full py-12 border-y border-neutral-900 bg-neutral-950">
        <div className="max-w-7xl mx-auto px-4 grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
          <div>
            <div className="text-3xl font-bold mb-1">99.9%</div>
            <div className="text-neutral-500 text-sm">Data Integrity</div>
          </div>
          <div>
             <div className="text-3xl font-bold mb-1">2,400+</div>
             <div className="text-neutral-500 text-sm">Journal Entries Logged</div>
          </div>
          <div>
             <div className="text-3xl font-bold mb-1">5ms</div>
             <div className="text-neutral-500 text-sm">Average Latency</div>
          </div>
           <div>
             <div className="text-3xl font-bold mb-1">100%</div>
             <div className="text-neutral-500 text-sm">Secure & Private</div>
          </div>
        </div>
      </section>

      {/* Benefits Section */}
      <section id="features" className="w-full py-24 bg-neutral-950">
        <div className="max-w-7xl mx-auto px-4">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold mb-4 tracking-tight italic">Why Professional Accountants Choose Us</h2>
            <p className="text-neutral-500 max-w-xl mx-auto">Built from the ground up for teams who demand professional accounting standards with a modern user experience.</p>
          </div>
          
          <div className="grid md:grid-cols-3 gap-8">
            <BenefitCard 
              icon={<Shield className="w-6 h-6 text-primary" />}
              title="Double-Entry Core"
              description="Built on the immutable foundation of double-entry bookkeeping. Every credit needs its debit."
            />
            <BenefitCard 
              icon={<Zap className="w-6 h-6 text-yellow-500" />}
              title="Recurring Workflows"
              description="Set up automatic journal entries for weekly, monthly, or annual schedules. Set it and forget it."
            />
            <BenefitCard 
              icon={<BarChart4 className="w-6 h-6 text-blue-500" />}
              title="Dynamic Reports"
              description="Real-time Income Statements, Balance Sheets, and Cash Flow analysis at the click of a button."
            />
          </div>
        </div>
      </section>

      {/* Features Grid & Coming Soon */}
      <section className="w-full py-24 bg-neutral-900/30">
        <div className="max-w-7xl mx-auto px-4">
           <div className="grid md:grid-cols-2 gap-12 items-center">
              <div>
                <Badge variant="outline" className="mb-4 text-primary bg-primary/5">Capabilities</Badge>
                <h2 className="text-3xl md:text-5xl font-bold mb-6 italic leading-tight uppercase">Master Your Ledger with Sophisticated Tools</h2>
                <div className="space-y-6">
                  <FeatureRow 
                    title="Immutable Activity Logs" 
                    description="Full trail of who did what, when. Essential for audit readiness and team transparency."
                    status="Active"
                  />
                   <FeatureRow 
                    title="Smart Account Management" 
                    description="Structure your chart of accounts with categories and tags for granular financial visibility."
                    status="Active"
                  />
                  <FeatureRow 
                    title="AI Financial Analysis" 
                    description="Get deep insights into your spending habits and revenue trends with our LLM-powered engine."
                    status="Coming Soon"
                  />
                   <FeatureRow 
                    title="Automated Bank Reconciliation" 
                    description="Connect your bank feeds and let AI suggest matches for your pending journal entries."
                    status="Coming Soon"
                  />
                </div>
              </div>
              <div className="relative mt-8 md:mt-0">
                 <div className="aspect-square bg-gradient-to-br from-primary/20 to-transparent rounded-full absolute -top-8 -left-8 blur-3xl opacity-50" />
                 <div className="relative bg-neutral-900 border border-neutral-800 rounded-2xl p-6 md:p-8 shadow-xl">
                    <div className="flex items-center gap-4 mb-6 pb-6 border-b border-neutral-800">
                       <Bot className="w-10 h-10 text-primary" />
                       <div>
                          <h3 className="font-bold text-xl uppercase italic">The Sulfur AI Agent</h3>
                          <p className="text-slate-400 text-xs">Available Q4 2026</p>
                       </div>
                    </div>
                    <p className="text-neutral-400 mb-6 italic text-base md:text-lg leading-relaxed">
                      "I'm training the next generation of financial intelligence to help you spot tax savings and operational efficiencies before they even show up on paper."
                    </p>
                    <div className="flex flex-col sm:grid sm:grid-cols-2 gap-4">
                       <div className="p-3 bg-neutral-800/50 rounded-lg text-[10px] md:text-xs font-mono text-neutral-500 overflow-hidden text-ellipsis whitespace-nowrap">
                          DETECT_ANOMALY(id: 8421)
                       </div>
                       <div className="p-3 bg-neutral-800/50 rounded-lg text-[10px] md:text-xs font-mono text-neutral-500 overflow-hidden text-ellipsis whitespace-nowrap">
                          PREDICT_REVENUE('Q4_26')
                       </div>
                    </div>
                 </div>
              </div>
           </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" className="w-full py-24 bg-neutral-950 px-4">
        <div className="max-w-7xl mx-auto text-center">
            <h2 className="text-4xl font-bold mb-16 italic">Simple, Transparent Pricing</h2>
            
            <div className="relative">
              {/* Blurred Pricing Cards Backdrop - Desktop Only */}
              <div className="hidden md:grid md:grid-cols-3 gap-8 blur-md opacity-25 pointer-events-none select-none">
                <PriceCard 
                  name="Starter"
                  price="Free"
                  features={["Up to 500 entries/mo", "Basic Reports", "Single User", "Community Support"]}
                  cta="Get Started"
                />
                <PriceCard 
                  name="Pro"
                  price="$29"
                  features={["Unlimited entries", "AI Assistant (Soon)", "5 Team Members", "Priority Support"]}
                  highlighted={true}
                  cta="Start Trial"
                />
                <PriceCard 
                  name="Enterprise"
                  price="Custom"
                  features={["Multi-Org Support", "Custom API Access", "Dedicated Strategist", "SLA Guarantee"]}
                  cta="Contact Sales"
                />
              </div>

              {/* Beta Launch Overlay - Responsive */}
              <div className="relative md:absolute md:inset-x-0 md:inset-y-[-2rem] flex items-center justify-center w-full">
                <div className="w-full max-w-2xl px-6 py-10 md:px-8 md:py-12 rounded-3xl border border-primary/30 bg-neutral-900/80 backdrop-blur-xl shadow-[0_0_50px_-12px_rgba(var(--color-primary),0.3)] text-center animate-in zoom-in duration-500">
                  <Badge variant="outline" className="mb-6 px-4 py-1.5 rounded-full border-primary/40 text-primary bg-primary/5 font-bold uppercase tracking-widest text-[10px]">
                    <Sparkles className="w-3 h-3 mr-2" />
                    Free Public Beta Launch
                  </Badge>
                  <h3 className="text-3xl md:text-5xl font-black mb-6 italic tracking-tight uppercase leading-[1.1] text-white">
                    The Modern Standard,<br />Now Open to Everyone.
                  </h3>
                  <p className="text-neutral-400 text-sm md:text-lg mb-8 md:mb-10 max-w-lg mx-auto leading-relaxed">
                    We're currently in our early access phase. 
                    <span className="text-white font-medium"> ALL professional features are 100% unlocked for free</span> while we scale our infrastructure.
                  </p>
                  <Link href="/app/onboarding">
                    <Button size="lg" className="h-12 md:h-14 px-8 md:px-10 text-base md:text-lg font-bold bg-primary hover:bg-primary/90 shadow-[0_0_20px_-5px_var(--color-primary)] rounded-full transition-all hover:scale-105 active:scale-95 w-full md:w-auto">
                      Claim Your Free Account
                      <ArrowRight className="ml-2 w-5 h-5" />
                    </Button>
                  </Link>
                  <p className="mt-6 text-[10px] md:text-xs text-neutral-500 font-medium">No credit card required. No hidden fees.</p>
                </div>
              </div>
            </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section className="w-full py-24 bg-neutral-950 border-t border-neutral-900">
        <div className="max-w-3xl mx-auto px-4 text-center">
          <h2 className="text-4xl font-bold mb-12 italic">Common Inquiries</h2>
          <div className="space-y-4 text-left">
            <FAQItem 
              question="Is my financial data secure?" 
              answer="Absolutely. We use bank-grade encryption for all data at rest and in transit. Your ledger is private to your organization." 
            />
            <FAQItem 
              question="Can I export my data?" 
              answer="Yes, you can export your entire ledger and all reports to PDF or JSON at any time. We believe in data portability." 
            />
            <FAQItem 
              question="How does the AI Assistant work?" 
              answer="Coming soon: Our AI assistant analyzes your historical journal entries to identify patterns, highlight anomalies, and predict cash flow issues." 
            />
          </div>
        </div>
      </section>

      {/* Footer CTA */}
      <section className="w-full py-24 bg-primary text-primary-foreground">
        <div className="max-w-7xl mx-auto px-4 text-center">
          <h2 className="text-4xl font-black mb-8 italic">READY TO DOMINATE YOUR LEDGER?</h2>
          <Link href="/app/onboarding">
            <Button size="lg" variant="secondary" className="h-16 px-10 text-xl font-black rounded-full hover:scale-105 transition-transform">
              GET ACCESS NOW
              <ArrowRight className="ml-2 w-6 h-6" />
            </Button>
          </Link>
        </div>
      </section>
    </div>
  );
}

function BenefitCard({ icon, title, description }: { icon: React.ReactNode, title: string, description: string }) {
  return (
    <div className="p-8 rounded-2xl border border-neutral-800 bg-neutral-900/40 hover:bg-neutral-800/60 transition-colors">
      <div className="w-12 h-12 rounded-lg bg-neutral-800 flex items-center justify-center mb-6">
        {icon}
      </div>
      <h3 className="text-xl font-bold mb-4">{title}</h3>
      <p className="text-neutral-500 leading-relaxed">{description}</p>
    </div>
  );
}

function FeatureRow({ title, description, status }: { title: string, description: string, status: string }) {
  const isComingSoon = status === "Coming Soon";
  return (
    <div className="flex gap-4">
      <div className="mt-1">
        {isComingSoon ? <Bot className="w-5 h-5 text-neutral-600" /> : <CheckCircle2 className="w-5 h-5 text-primary" />}
      </div>
      <div>
        <h4 className="font-bold flex items-center gap-2">
          {title}
          {isComingSoon && <Badge className="text-[10px] py-0 h-4 bg-neutral-800 text-neutral-400 border-none">SOON</Badge>}
        </h4>
        <p className="text-neutral-500 text-sm">{description}</p>
      </div>
    </div>
  );
}

function PriceCard({ name, price, features, cta, highlighted = false }: { name: string, price: string, features: string[], cta: string, highlighted?: boolean }) {
  return (
    <div className={`p-10 rounded-3xl border ${highlighted ? 'border-primary ring-1 ring-primary bg-neutral-900' : 'border-neutral-800 bg-neutral-900/50'} text-left flex flex-col h-full`}>
      <div className="mb-8">
        <h3 className="text-lg font-medium text-neutral-400 mb-2">{name}</h3>
        <div className="text-4xl font-bold">{price === "Custom" ? price : (<span>{price}<span className="text-lg font-normal text-neutral-500">/mo</span></span>)}</div>
      </div>
      <ul className="space-y-4 mb-10 flex-1">
        {features.map((f, i) => (
          <li key={i} className="flex items-center gap-3 text-sm text-neutral-300">
            <CheckCircle2 className="w-4 h-4 text-primary shrink-0" />
            {f}
          </li>
        ))}
      </ul>
      <Button className={`w-full font-bold h-12 ${highlighted ? 'bg-primary' : 'bg-neutral-800 hover:bg-neutral-700'}`}>
        {cta}
      </Button>
    </div>
  );
}

function FAQItem({ question, answer }: { question: string, answer: string }) {
  return (
    <div className="p-6 rounded-xl bg-neutral-900/50 border border-neutral-800">
      <h4 className="font-bold text-lg mb-2">{question}</h4>
      <p className="text-neutral-500 text-sm leading-relaxed">{answer}</p>
    </div>
  );
}
