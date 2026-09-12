-- AlterTable
ALTER TABLE "VerificationSession" ADD COLUMN "scopeHash" TEXT;
ALTER TABLE "VerificationSession" ADD COLUMN "activeKey" TEXT;
ALTER TABLE "VerificationSession" ADD COLUMN "startedAt" DATETIME;
ALTER TABLE "VerificationSession" ADD COLUMN "lastEventAt" DATETIME;
ALTER TABLE "VerificationSession" ADD COLUMN "failureReasonCode" TEXT;

-- Existing Phase 2 demo rows are disposable and get a non-authorizing legacy marker.
UPDATE "VerificationSession" SET "scopeHash" = 'legacy:phase2' WHERE "scopeHash" IS NULL;

-- CreateTable
CREATE TABLE "PersonaWebhookEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "personaEventId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "inquiryId" TEXT,
    "payloadHash" TEXT NOT NULL,
    "eventCreatedAt" DATETIME NOT NULL,
    "status" TEXT NOT NULL,
    "reasonCode" TEXT,
    "receivedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" DATETIME
);

CREATE UNIQUE INDEX "PersonaWebhookEvent_personaEventId_key" ON "PersonaWebhookEvent"("personaEventId");
CREATE INDEX "PersonaWebhookEvent_inquiryId_eventCreatedAt_idx" ON "PersonaWebhookEvent"("inquiryId", "eventCreatedAt");
CREATE INDEX "PersonaWebhookEvent_status_receivedAt_idx" ON "PersonaWebhookEvent"("status", "receivedAt");
CREATE UNIQUE INDEX "VerificationSession_activeKey_key" ON "VerificationSession"("activeKey");
CREATE INDEX "VerificationSession_scopeHash_idx" ON "VerificationSession"("scopeHash");
