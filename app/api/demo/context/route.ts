import { parseEnv } from "@/lib/config/env";
import { db } from "@/lib/db";
import { assertDemoApiEnabled } from "@/lib/demo/demo-api";
import { DEMO_IDS, DEMO_PROMPT } from "@/lib/demo/fixtures";
import { apiErrorResponse } from "@/lib/http/api-response";

export async function GET() {
  try {
    const env = parseEnv();
    assertDemoApiEnabled(env);
    const inventory = await db.inventoryItem.findMany({
      where: { ownerId: DEMO_IDS.userId },
      orderBy: { createdAt: "asc" },
      select: { id: true, type: true, title: true, description: true, eventAt: true },
    });
    return Response.json({ demoMode: true, defaultPrompt: DEMO_PROMPT, inventory });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
