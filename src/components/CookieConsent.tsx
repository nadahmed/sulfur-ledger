"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Cookie } from "lucide-react";
import Link from "next/link";

export function CookieConsent() {
  const [isVisible, setIsVisible] = useState(false);
  const [shouldRender, setShouldRender] = useState(false);

  useEffect(() => {
    const consent = localStorage.getItem("cookie-consent");
    if (!consent) {
      setShouldRender(true);
      // Small delay for the slide-up animation
      const timer = setTimeout(() => setIsVisible(true), 1000);
      return () => clearTimeout(timer);
    }
  }, []);

  const acceptCookies = () => {
    setIsVisible(false);
    // Wait for animation to finish before removing from DOM
    setTimeout(() => {
      localStorage.setItem("cookie-consent", "true");
      setShouldRender(false);
    }, 500);
  };

  if (!shouldRender) return null;

  return (
    <div
      className={`fixed bottom-4 left-4 right-4 md:left-auto md:right-8 md:max-w-md z-[100] transition-all duration-500 ease-out transform ${
        isVisible ? "translate-y-0 opacity-100" : "translate-y-20 opacity-0"
      }`}
    >
      <div className="bg-neutral-900 border border-neutral-800 p-6 rounded-2xl shadow-2xl shadow-black/50 backdrop-blur-xl">
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
            <Cookie className="w-5 h-5 text-primary" />
          </div>
          <div className="flex-1 space-y-2">
            <h4 className="text-white font-bold text-sm uppercase tracking-tight">Cookie Policy</h4>
            <p className="text-xs text-neutral-400 leading-relaxed italic">
              We use cookies to enhance your experience and analyze our traffic via Google Analytics. For more details, see our{" "}
              <Link href="/privacy" className="text-primary hover:underline underline-offset-4">
                Privacy Policy
              </Link>.
            </p>
            <div className="flex items-center gap-3 pt-2">
              <Button 
                onClick={acceptCookies}
                className="bg-primary hover:bg-primary/90 text-black font-bold text-xs h-9 px-6 rounded-lg"
              >
                Accept All
              </Button>
              <Button 
                variant="ghost" 
                onClick={() => setIsVisible(false)}
                className="text-neutral-500 hover:text-white text-xs h-9 px-4"
              >
                Close
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
