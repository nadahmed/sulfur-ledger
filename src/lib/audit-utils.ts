import { NextRequest } from "next/server";

export function getAuditMetadata(req: NextRequest) {
  // Get IP address
  // In Netlify, check x-nf-client-connection-ip first, then x-forwarded-for
  const forwardedFor = req.headers.get("x-forwarded-for");
  const ip = req.headers.get("x-nf-client-connection-ip") || 
             (forwardedFor ? forwardedFor.split(',')[0].trim() : "127.0.0.1");
             
  // Get User Agent
  const userAgent = req.headers.get("user-agent") || "unknown";
  
  return {
    ipAddress: ip,
    userAgent: userAgent
  };
}

/**
 * Simple parser to extract browser and OS from User Agent string
 * without adding external dependencies.
 */
export function parseUserAgent(ua: string) {
  if (ua === "unknown") return { browser: "Unknown", os: "Unknown" };
  
  let browser = "Other";
  let os = "Other";

  // Browser detection
  if (ua.includes("Firefox/")) browser = "Firefox";
  else if (ua.includes("Edg/")) browser = "Edge";
  else if (ua.includes("Chrome/")) browser = "Chrome";
  else if (ua.includes("Safari/")) browser = "Safari";
  
  // OS detection
  if (ua.includes("Windows")) os = "Windows";
  else if (ua.includes("Mac OS X")) os = "macOS";
  else if (ua.includes("Linux")) os = "Linux";
  else if (ua.includes("Android")) os = "Android";
  else if (ua.includes("iPhone") || ua.includes("iPad")) os = "iOS";
  
  return { browser, os };
}
