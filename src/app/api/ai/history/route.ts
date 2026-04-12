import { NextRequest, NextResponse } from "next/server";
import { checkPermission } from "@/lib/auth";
import { getChatHistory, deleteChatMessage, clearChatHistory } from "@/lib/db/ai";
import { getOrganization } from "@/lib/db/organizations";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const orgId = searchParams.get("orgId");
  
  if (!orgId) return NextResponse.json({ error: "orgId required" }, { status: 400 });

  const auth = await checkPermission("view:dashboard", req);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const history = await getChatHistory(orgId);
    return NextResponse.json(history);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const orgId = searchParams.get("orgId");
  const msgId = searchParams.get("msgId");
  const timestamp = searchParams.get("timestamp");

  if (!orgId) return NextResponse.json({ error: "orgId required" }, { status: 400 });

  // Only Owner can delete
  const session = await checkPermission("view:dashboard", req);
  if (session.error) return NextResponse.json({ error: session.error }, { status: session.status });

  const org = await getOrganization(orgId);
  const isOwner = session.user.sub === org?.ownerId;

  if (!isOwner) {
    return NextResponse.json({ error: "Only the organization owner can delete chat history." }, { status: 403 });
  }

  try {
    if (msgId && timestamp) {
      await deleteChatMessage(orgId, msgId, timestamp);
      return NextResponse.json({ message: "Message deleted" });
    } else {
      await clearChatHistory(orgId);
      return NextResponse.json({ message: "Chat history cleared" });
    }
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
