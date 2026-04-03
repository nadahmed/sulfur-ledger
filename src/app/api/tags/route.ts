import { NextRequest, NextResponse } from "next/server";
import { getTags, createTag } from "@/lib/db/tags";
import { checkPermission } from "@/lib/auth";
import { TagSchema } from "@/lib/schemas";

export async function GET(req: NextRequest) {
  const auth = await checkPermission("read:tags", req);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const orgId = req.cookies.get("activeOrgId")?.value || req.headers.get("x-org-id");
  if (!orgId) {
    return NextResponse.json({ error: "No active organization" }, { status: 400 });
  }

  try {
    const tags = await getTags(orgId);
    return NextResponse.json(tags);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await checkPermission("manage:tags", req);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const orgId = req.cookies.get("activeOrgId")?.value;
  if (!orgId) {
    return NextResponse.json({ error: "No active organization" }, { status: 400 });
  }

  try {
    const body = await req.json();
    const validated = TagSchema.parse(body);

    const tag = await createTag({
      orgId,
      ...validated
    });

    return NextResponse.json(tag, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}
