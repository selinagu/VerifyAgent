import { randomUUID } from "node:crypto";

import type { PersonaGateway } from "@/lib/persona/persona-gateway";
import type { CreateInquiryInput, PersonaInquiryStatus } from "@/lib/persona/types";

export class FakePersonaGateway implements PersonaGateway {
  readonly inquiries = new Map<string, { status: PersonaInquiryStatus; referenceId: string }>();
  readonly createInputs: CreateInquiryInput[] = [];
  retrieveCalls = 0;
  resumeCalls = 0;
  createError?: Error;

  async createInquiry(input: CreateInquiryInput) {
    if (this.createError) throw this.createError;
    this.createInputs.push(input);
    const inquiryId = `inq_demo_${randomUUID()}`;
    this.inquiries.set(inquiryId, { status: "created", referenceId: input.referenceId });
    return { inquiryId, status: "created" as const, referenceId: input.referenceId, sessionToken: "session_demo_new" };
  }

  async retrieveInquiry(inquiryId: string) {
    this.retrieveCalls += 1;
    const inquiry = this.inquiries.get(inquiryId);
    if (!inquiry) throw new Error("Fake inquiry not found");
    return { inquiryId, ...inquiry };
  }

  async resumeInquiry(inquiryId: string) {
    if (!this.inquiries.has(inquiryId)) throw new Error("Fake inquiry not found");
    this.resumeCalls += 1;
    return { sessionToken: "session_demo_resume" };
  }

  setStatus(inquiryId: string, status: PersonaInquiryStatus) {
    const inquiry = this.inquiries.get(inquiryId);
    if (!inquiry) throw new Error("Fake inquiry not found");
    inquiry.status = status;
  }
}
