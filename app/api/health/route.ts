import { NextResponse } from "next/server";

import { getHealthSnapshot } from "@/lib/health/health-service";

export async function GET() {
  const health = await getHealthSnapshot();
  return NextResponse.json(health, { status: health.status === "ok" ? 200 : 503 });
}
