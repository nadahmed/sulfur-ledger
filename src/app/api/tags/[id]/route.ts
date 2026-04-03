import { NextRequest, NextResponse } from "next/server";
import { updateTag, deleteTag } from "@/lib/db/tags";
import { checkPermission } from "@/lib/auth";
import { TagSchema } from "@/lib/schemas";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await checkPermission("manage:tags", req);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const orgId = req.cookies.get("activeOrgId")?.value;
  if (!orgId) return NextResponse.json({ error: "No active organization" }, { status: 400 });

  try {
    const body = await req.json();
    const validated = TagSchema.partial().parse(body);
    const tag = await updateTag(orgId, id, validated);
    return NextResponse.json(tag);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await checkPermission("manage:tags", req);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const orgId = req.cookies.get("activeOrgId")?.value;
  if (!orgId) return NextResponse.json({ error: "No active organization" }, { status: 400 });

  try {
    await deleteTag(orgId, id);
    return NextResponse.json({ message: "Tag deleted" });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
