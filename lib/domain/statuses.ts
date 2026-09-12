import { z } from "zod";

export const authorizationRequirementSchema = z.enum([
  "NONE",
  "CONFIRM",
  "VERIFIED_IDENTITY",
]);
export type AuthorizationRequirement = z.infer<typeof authorizationRequirementSchema>;

export const taskRunStatusSchema = z.enum([
  "PLANNING",
  "READY",
  "RUNNING",
  "WAITING_CONFIRMATION",
  "WAITING_IDENTITY",
  "COMPLETED",
  "FAILED",
  "CANCELLED",
]);
export type TaskRunStatus = z.infer<typeof taskRunStatusSchema>;

export const actionRunStatusSchema = z.enum([
  "PROPOSED",
  "VALIDATED",
  "POLICY_EVALUATED",
  "WAITING_CONFIRMATION",
  "WAITING_IDENTITY",
  "AUTHORIZED",
  "EXECUTING",
  "SUCCEEDED",
  "DENIED",
  "FAILED",
  "CANCELLED",
]);
export type ActionRunStatus = z.infer<typeof actionRunStatusSchema>;

export const verificationStatusSchema = z.enum([
  "CREATED",
  "PENDING",
  "APPROVED",
  "DECLINED",
  "FAILED",
  "EXPIRED",
  "CANCELLED",
]);
export type VerificationStatus = z.infer<typeof verificationStatusSchema>;

export const authorizationGrantStatusSchema = z.enum([
  "ACTIVE",
  "CONSUMED",
  "REVOKED",
  "EXPIRED",
]);
export type AuthorizationGrantStatus = z.infer<typeof authorizationGrantStatusSchema>;

export const listingStatusSchema = z.enum(["DRAFT", "PUBLISHED", "SOLD", "DELETED"]);
export type ListingStatus = z.infer<typeof listingStatusSchema>;

export const auditActorTypeSchema = z.enum([
  "USER",
  "AGENT",
  "POLICY",
  "PERSONA",
  "EXECUTOR",
  "SYSTEM",
]);
export type AuditActorType = z.infer<typeof auditActorTypeSchema>;
