"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useUser } from "@auth0/nextjs-auth0/client";
import Image from "next/image";
import { 
  Menu, 
  X, 
  ChevronRight, 
  ExternalLink,
  BookOpen,
  LayoutDashboard,
  Globe
} from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetTrigger,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

export default function MarketingLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const { user } = useUser();
  const pathname = usePathname();
  const [activeSection, setActiveSection] = useState("");

  useEffect(() => {
    const sectionIds = ["hero", "features", "assistant", "sovereignty", "pricing"];
    const observerOptions = {
      root: null,
      rootMargin: "-25% 0px -45% 0px", // More reliable detection zone
      threshold: 0,
    };

    const handleIntersect = (entries: IntersectionObserverEntry[]) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          setActiveSection(entry.target.id === "hero" ? "" : entry.target.id);
        }
      });
    };

    const observer = new IntersectionObserver(handleIntersect, observerOptions);

    sectionIds.forEach((id) => {
      const element = document.getElementById(id);
      if (element) observer.observe(element);
    });

    // Handle initial hash on page load or navigation
    if (typeof window !== "undefined" && window.location.hash) {
      const hash = window.location.hash.replace("#", "");
      if (sectionIds.includes(hash)) {
        setActiveSection(hash === "hero" ? "" : hash);
      }
    }

    return () => observer.disconnect();
  }, [pathname]);

  const getLinkClasses = (sectionId: string, isPathResource: boolean = false) => {
    // Scrollspy sections should only be active on the root page
    const isActive = isPathResource 
      ? pathname === sectionId 
      : (pathname === "/" && activeSection === sectionId);
      
    return `hover:text-white transition-all flex items-center gap-1 ${
      isActive ? "text-primary font-black scale-105" : "text-neutral-400"
    }`;
  };

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-50 selection:bg-primary/30">
      <nav className="fixed top-0 w-full z-50 bg-neutral-950/80 backdrop-blur-md border-b border-neutral-800">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center">
              <Image src="/icon.png" alt="Logo" width={34} height={34} />
            </div>
          </Link>

          <div className="hidden md:flex items-center gap-6 lg:gap-8 text-sm font-medium">
            <Link href="/#features" className={getLinkClasses("features")}>Features</Link>
            <Link href="/#assistant" className={getLinkClasses("assistant")}>Assistant</Link>
            <Link href="/#sovereignty" className={getLinkClasses("sovereignty")}>Sovereignty</Link>
            <Link href="/#pricing" className={getLinkClasses("pricing")}>Pricing</Link>
            <Link href="/about" className={getLinkClasses("/about", true)}>About</Link>
          </div>

          <div className="flex items-center gap-4">
            <div className="hidden lg:flex items-center gap-4 border-r border-neutral-800 pr-4 mr-2">
              <Link href="https://docs.sulfurledger.com" target="_blank" className="text-neutral-500 hover:text-white transition-colors flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest">
                <BookOpen className="w-3 h-3" />
                Docs
              </Link>
            </div>
            
            <div className="hidden md:flex items-center gap-3">
              {user ? (
                <Link href="/app/dashboard">
                  <Button size="sm" className="bg-primary hover:bg-primary/90 text-primary-foreground font-black uppercase tracking-tighter h-9 px-5">
                    <LayoutDashboard className="w-4 h-4 mr-2" />
                    Dashboard
                  </Button>
                </Link>
              ) : (
                <>
                  <Link href="/auth/login">
                    <Button variant="ghost" size="sm" className="text-neutral-400 hover:text-white font-bold h-9 bg-transparent hover:bg-neutral-900 border border-transparent hover:border-neutral-800">
                      Login
                    </Button>
                  </Link>
                  <Link href="/app/onboarding">
                    <Button size="sm" className="bg-primary hover:bg-primary/90 text-primary-foreground font-black uppercase tracking-tighter h-9 px-5 shadow-[0_0_15px_-5px_var(--color-primary)]">
                      Get Started
                    </Button>
                  </Link>
                </>
              )}
            </div>

            {/* Mobile Nav */}
            <div className="md:hidden">
              <Sheet>
                <SheetTrigger render={
                  <Button variant="ghost" size="icon" className="text-neutral-400 hover:text-white">
                    <Menu className="w-6 h-6" />
                  </Button>
                } />
                <SheetContent side="right" className="bg-neutral-950 border-neutral-800 p-0 overflow-hidden">
                  <SheetHeader className="p-6 border-b border-neutral-900 text-left">
                    <SheetTitle className="flex items-center gap-2">
                      <Image src="/icon.png" alt="Logo" width={24} height={24} />
                      <span className="font-black italic uppercase tracking-tighter text-white">Sulfur Book</span>
                    </SheetTitle>
                  </SheetHeader>
                  <div className="flex flex-col p-6 gap-6">
                    <nav className="flex flex-col gap-4">
                      <MobileNavLink href="/#features" title="Product Features" label="Core ledger capabilities" isActive={pathname === "/" && activeSection === "features"} />
                      <MobileNavLink href="/#assistant" title="The AI Assistant" label="Sulfur Agent predictive core" isActive={pathname === "/" && activeSection === "assistant"} />
                      <MobileNavLink href="/#sovereignty" title="Data Sovereignty" label="S3 storage & migration" isActive={pathname === "/" && activeSection === "sovereignty"} />
                      <MobileNavLink href="/#pricing" title="Pricing Plans" label="Open beta access" isActive={pathname === "/" && activeSection === "pricing"} />
                      <MobileNavLink href="/about" title="Our Mission" label="About Sulfur Book" isActive={pathname === "/about"} />
                    </nav>
                    
                    <div className="pt-6 border-t border-neutral-900 flex flex-col gap-3">
                      {user ? (
                        <Link href="/app/dashboard">
                          <Button className="w-full bg-primary font-black uppercase tracking-tight h-12">
                            Dashboard
                          </Button>
                        </Link>
                      ) : (
                        <>
                          <Link href="/app/onboarding">
                            <Button className="w-full bg-primary font-black uppercase tracking-tight h-12">
                              Start For Free
                            </Button>
                          </Link>
                          <Link href="/auth/login">
                            <Button variant="outline" className="w-full border-neutral-800 font-bold h-12">
                              Member Login
                            </Button>
                          </Link>
                        </>
                      )}
                    </div>
                  </div>
                </SheetContent>
              </Sheet>
            </div>
          </div>
        </div>
      </nav>

      <main className="pt-16">
        {children}
      </main>

      <footer className="bg-neutral-950 border-t border-neutral-900 py-20">
        <div className="max-w-7xl mx-auto px-4">
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-12 mb-16">
            <div className="col-span-1 lg:col-span-1">
              <Link href="/" className="flex items-center gap-2 mb-6">
                <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
                  <Image src="/icon.png" alt="Logo" width={34} height={34} />
                </div>
                <span className="font-black italic text-xl tracking-tighter uppercase text-white">Sulfur Book</span>
              </Link>
              <p className="text-neutral-500 text-sm leading-relaxed max-w-xs">
                The high-performance professional standard for digital bookkeeping. Immutable, private, and AI-enabled.
              </p>
            </div>
            <div>
              <h4 className="font-bold text-white mb-6 uppercase tracking-widest text-xs">Product</h4>
              <ul className="space-y-4 text-neutral-500 text-sm">
                <li><Link href="/#features" className="hover:text-primary transition-colors">Core Features</Link></li>
                <li><Link href="/#sovereignty" className="hover:text-primary transition-colors">Data Sovereignty</Link></li>
                <li><Link href="/#assistant" className="hover:text-primary transition-colors">AI Assistant</Link></li>
                <li><Link href="/#pricing" className="hover:text-primary transition-colors">Pricing & Beta</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="font-bold text-white mb-6 uppercase tracking-widest text-xs">Resources</h4>
              <ul className="space-y-4 text-neutral-500 text-sm">
                <li><Link href="https://docs.sulfurledger.com" target="_blank" className="hover:text-white transition-colors flex items-center gap-2">Documentation <ExternalLink className="w-3 h-3" /></Link></li>
                <li><Link href="/about" className="hover:text-white transition-colors">API Reference</Link></li>
                <li><Link href="/help" className="hover:text-white transition-colors">Support Center</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="font-bold text-white mb-6 uppercase tracking-widest text-xs">Company</h4>
              <ul className="space-y-4 text-neutral-500 text-sm">
                <li><Link href="/about" className="hover:text-white transition-colors">Our Mission</Link></li>
                <li><Link href="/privacy" className="hover:text-white transition-colors">Privacy Principles</Link></li>
                <li><Link href="/terms" className="hover:text-white transition-colors">Terms of Service</Link></li>
              </ul>
            </div>
          </div>
          <div className="flex flex-col md:flex-row justify-between items-center pt-8 border-t border-neutral-900 gap-4">
            <div className="flex items-center gap-4">
              <p className="text-neutral-600 text-[10px] uppercase tracking-widest font-bold">© 2026 Sulfur Book</p>
              <div className="w-1 h-1 bg-neutral-800 rounded-full" />
              <p className="text-neutral-600 text-[10px] uppercase tracking-widest font-bold italic">Precision In Every Byte</p>
            </div>
            <div className="flex gap-6">
              <Link href="#" className="text-neutral-600 hover:text-white transition-colors">
                <Globe className="w-4 h-4 opacity-50 hover:opacity-100 transition-opacity" />
              </Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

function MobileNavLink({ href, title, label, isActive }: { href: string, title: string, label: string, isActive: boolean }) {
  return (
    <Link href={href} className={`group flex flex-col space-y-1 p-3 rounded-xl transition-all ${isActive ? 'bg-primary/10 border border-primary/20' : 'hover:bg-neutral-900/50'}`}>
      <div className="flex items-center justify-between">
        <span className={`font-bold transition-colors ${isActive ? 'text-primary' : 'text-white group-hover:text-primary'}`}>{title}</span>
        <ChevronRight className={`w-4 h-4 transition-transform ${isActive ? 'text-primary' : 'text-neutral-600 group-hover:translate-x-1'}`} />
      </div>
      <span className={`text-[10px] uppercase tracking-widest font-bold ${isActive ? 'text-primary/70' : 'text-neutral-500'}`}>{label}</span>
    </Link>
  );
}
