import type {
  CreateInquiryInput,
  CreateInquiryResult,
  PersonaInquiryResult,
} from "./types";

export interface PersonaGateway {
  createInquiry(input: CreateInquiryInput): Promise<CreateInquiryResult>;
  retrieveInquiry(inquiryId: string): Promise<PersonaInquiryResult>;
  resumeInquiry(inquiryId: string): Promise<{ sessionToken: string }>;
}
