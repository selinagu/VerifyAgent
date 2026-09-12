import { parseEnv } from "@/lib/config/env";
import { db } from "@/lib/db";
import { observeApiRequest } from "@/lib/observability/correlation";
import { getReadinessSnapshot } from "@/lib/readiness/readiness-service";

export async function GET(request: Request) {
  return observeApiRequest(request, "/api/readiness", async () => {
    const snapshot = await getReadinessSnapshot({ prisma: db, env: parseEnv() });
    return Response.json(snapshot, { status: snapshot.status === "blocked" ? 503 : 200 });
  });
}
