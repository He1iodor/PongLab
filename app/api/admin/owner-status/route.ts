
import { NextRequest, NextResponse } from "next/server";
import { requireOwner } from "@/app/lib/owner-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const access = await requireOwner(request);

  if (!access.ok) {
    return access.response;
  }

  return NextResponse.json(
    {
      authenticated: true,
      role: "owner",
      expiresInSeconds: 30 * 60,
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    }
  );
}
