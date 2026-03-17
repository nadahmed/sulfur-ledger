import { NextRequest, NextResponse } from "next/server";
import { checkPermission } from "@/lib/auth";
import { testEmail } from "@/lib/email";

export async function POST(req: NextRequest) {
  const { user, isOwner, error, status } = await checkPermission("manage:organization", req);
  if (error) return NextResponse.json({ error }, { status });

  try {
    const { settings } = await req.json();
    if (!settings) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // Always send to the current user's email for verification
    if (!user.email) {
      return NextResponse.json({ error: "User email not found in session" }, { status: 400 });
    }

    await testEmail(settings, user.email);
    
    return NextResponse.json({ message: "Test email sent successfully" });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
