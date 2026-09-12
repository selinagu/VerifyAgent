export type PersonaInquiryStatus =
  | "created"
  | "pending"
  | "completed"
  | "approved"
  | "declined"
  | "failed"
  | "expired"
  | "needs_review"
  | "unknown";

export type CreateInquiryInput = {
  templateId: string;
  referenceId: string;
  idempotencyKey: string;
};

export type CreateInquiryResult = {
  inquiryId: string;
  status: PersonaInquiryStatus;
  referenceId: string;
  sessionToken?: string;
};

export type PersonaInquiryResult = {
  inquiryId: string;
  status: PersonaInquiryStatus;
  referenceId?: string;
};

export type VerifiedPersonaEvent = {
  eventId: string;
  eventType: string;
  eventCreatedAt: Date;
  inquiryId: string;
  inquiryStatus?: PersonaInquiryStatus;
  referenceId?: string;
  payloadHash: string;
};
