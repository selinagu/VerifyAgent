import { describe, expect, it, vi } from "vitest";

import { PersonaHttpClient } from "@/lib/persona/persona-http-client";

const config = { apiKey: "secret_test_key", apiVersion: "2025-10-27" };

describe("Persona HTTP client", () => {
  it("creates an inquiry with versioning, bearer auth, and idempotency", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json(
        {
          data: { id: "inq_demo_1", attributes: { status: "created", "reference-id": "vref_1" } },
          meta: { "session-token": "short_lived_token" },
        },
        { status: 201 },
      ),
    );
    const client = new PersonaHttpClient({ ...config, fetchImpl });
    await expect(
      client.createInquiry({ templateId: "itmpl_demo", referenceId: "vref_1", idempotencyKey: "verification-1" }),
    ).resolves.toMatchObject({ inquiryId: "inq_demo_1", referenceId: "vref_1", status: "created" });

    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://api.withpersona.com/api/v1/inquiries");
    expect(init?.headers).toMatchObject({
      Authorization: "Bearer secret_test_key",
      "Persona-Version": "2025-10-27",
      "Idempotency-Key": "verification-1",
    });
    expect(JSON.parse(init?.body as string)).toEqual({
      data: { attributes: { "inquiry-template-id": "itmpl_demo", "reference-id": "vref_1" } },
    });
  });

  it("maps network, non-2xx, and malformed responses to safe errors without secret leakage", async () => {
    const failures: Array<typeof fetch> = [
      vi.fn<typeof fetch>().mockRejectedValue(new Error(`network ${config.apiKey}`)),
      vi.fn<typeof fetch>().mockResolvedValue(new Response(`upstream ${config.apiKey}`, { status: 500 })),
      vi.fn<typeof fetch>().mockResolvedValue(Response.json({ unexpected: config.apiKey })),
    ];
    for (const fetchImpl of failures) {
      try {
        await new PersonaHttpClient({ ...config, fetchImpl, timeoutMs: 1 }).retrieveInquiry("inq_demo");
        throw new Error("Expected Persona call to fail");
      } catch (error) {
        expect(error).toMatchObject({ code: expect.stringMatching(/^PERSONA_/) });
        expect(error instanceof Error ? error.message : String(error)).not.toContain(config.apiKey);
      }
    }
  });
});
