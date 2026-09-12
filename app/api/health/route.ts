import { NextResponse } from "next/server";

import { getHealthSnapshot } from "@/lib/health/health-service";
import { observeApiRequest } from "@/lib/observability/correlation";

export async function GET(request: Request) {
  return observeApiRequest(request, "/api/health", async () => {
    const health = await getHealthSnapshot();
    return NextResponse.json(health, { status: health.status === "ok" ? 200 : 503 });
  });
}
