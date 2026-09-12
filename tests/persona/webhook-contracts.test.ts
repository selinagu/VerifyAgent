import { createHmac } from "node:crypto";

import { describe, expect, it } from "vitest";

import { parsePersonaEvent } from "@/lib/persona/persona-event-parser";
import { verifyPersonaWebhookSignature } from "@/lib/persona/persona-webhook-verifier";

const now = new Date("2026-09-12T12:00:00.000Z");
const timestamp = Math.floor(now.getTime() / 1_000);
const secret = "persona_test_webhook_secret";
const body = JSON.stringify({
  data: {
    id: "evt_demo_approved",
    attributes: {
      name: "inquiry.approved",
      "created-at": now.toISOString(),
      payload: {
        data: {
          id: "inq_demo_123",
          type: "inquiry",
          attributes: { status: "approved", "reference-id": "vref_demo" },
        },
      },
    },
  },
});

function signature(value: string, at = timestamp) {
  return `t=${at},v1=${createHmac("sha256", secret).update(`${at}.${value}`).digest("hex")}`;
}

describe("Persona webhook contracts", () => {
  it("verifies the raw body and supports a rotating signature header", () => {
    expect(() =>
      verifyPersonaWebhookSignature({
        rawBody: body,
        signatureHeader: `t=${timestamp},v1=${"0".repeat(64)} ${signature(body)}`,
        webhookSecret: secret,
        now,
      }),
    ).not.toThrow();
  });

  it.each([
    [null, "PERSONA_WEBHOOK_SIGNATURE_MISSING"],
    [`t=${timestamp},v1=${"0".repeat(64)}`, "PERSONA_WEBHOOK_SIGNATURE_INVALID"],
    [signature(`${body}tampered`), "PERSONA_WEBHOOK_SIGNATURE_INVALID"],
    [signature(body, timestamp - 301), "PERSONA_WEBHOOK_SIGNATURE_INVALID"],
  ])("rejects missing, invalid, tampered, or expired signatures", (header, code) => {
    expect(() =>
      verifyPersonaWebhookSignature({ rawBody: body, signatureHeader: header, webhookSecret: secret, now }),
    ).toThrowError(expect.objectContaining({ code }));
  });

  it("strictly extracts only the required event fields", () => {
    expect(parsePersonaEvent(body)).toMatchObject({
      eventId: "evt_demo_approved",
      eventType: "inquiry.approved",
      inquiryId: "inq_demo_123",
      inquiryStatus: "approved",
      referenceId: "vref_demo",
    });
    expect(parsePersonaEvent(body).payloadHash).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it("rejects malformed JSON and non-inquiry payloads", () => {
    expect(() => parsePersonaEvent("not json")).toThrowError(expect.objectContaining({ code: "PERSONA_EVENT_INVALID" }));
    expect(() => parsePersonaEvent(JSON.stringify({ data: { id: "evt" } }))).toThrowError(
      expect.objectContaining({ code: "PERSONA_EVENT_INVALID" }),
    );
  });
});
