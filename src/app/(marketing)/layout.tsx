"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { useUser } from "@auth0/nextjs-auth0/client";
import Image from "next/image";

export default function MarketingLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const { user } = useUser();

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-50 selection:bg-primary/30">
      <nav className="fixed top-0 w-full z-50 bg-neutral-950/80 backdrop-blur-md border-b border-neutral-800">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center">
              <Image src="/icon.png" alt="Logo" width={34} height={34} />
            </div>
          </Link>

          <div className="hidden md:flex items-center gap-8 text-sm font-medium text-neutral-400">
            <Link href="/#features" className="hover:text-white transition-colors">Features</Link>
            <Link href="/#process" className="hover:text-white transition-colors">Process</Link>
            <Link href="/#pricing" className="hover:text-white transition-colors">Pricing</Link>
            <Link href="/about" className="hover:text-white transition-colors">About</Link>
          </div>

          <div className="flex items-center gap-4">
            {user ? (
              <Link href="/app/dashboard">
                <Button className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold">
                  Dashboard
                </Button>
              </Link>
            ) : (
              <>
                <Link href="/auth/login">
                  <Button variant="ghost" className="text-neutral-400 hover:text-white">
                    Log in
                  </Button>
                </Link>
                <Link href="/app/onboarding">
                  <Button className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold">
                    Get Started
                  </Button>
                </Link>
              </>
            )}
          </div>
        </div>
      </nav>

      <main className="pt-16">
        {children}
      </main>

      <footer className="bg-neutral-950 border-t border-neutral-900 py-12">
        <div className="max-w-7xl mx-auto px-4">
          <div className="grid md:grid-cols-4 gap-8 mb-12">
            <div className="col-span-2">
              <Link href="/" className="flex items-center gap-2 mb-4">
                <div className="w-6 h-6 bg-primary rounded flex items-center justify-center">
                  <Image src="/icon.png" alt="Logo" width={34} height={34} />
                </div>
                <span className="font-bold text-lg tracking-tight">Sulfur Book</span>
              </Link>
              <p className="text-neutral-500 max-w-xs">
                Modern, professional double-entry bookkeeping for teams that demand precision.
              </p>
            </div>
            <div>
              <h4 className="font-bold mb-4">Product</h4>
              <ul className="space-y-2 text-neutral-500 text-sm">
                <li><Link href="#features">Features</Link></li>
                <li><Link href="#pricing">Pricing</Link></li>
                <li><Link href="/app/onboarding">Sign Up</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="font-bold mb-4">Company</h4>
              <ul className="space-y-2 text-neutral-500 text-sm">
                <li><Link href="/about">About Us</Link></li>
                <li><Link href="/privacy" className="hover:text-white transition-colors">Privacy Policy</Link></li>
                <li><Link href="/terms" className="hover:text-white transition-colors">Terms of Service</Link></li>
              </ul>
            </div>
          </div>
          <div className="flex flex-col md:flex-row justify-between items-center pt-8 border-t border-neutral-900 text-neutral-600 text-xs">
            <p>© 2026 Sulfur Book. All rights reserved.</p>
            <p>Made for professional accountants and modern businesses.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
