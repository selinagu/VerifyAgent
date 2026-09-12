-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "displayName" TEXT NOT NULL,
    "email" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "UserSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" DATETIME NOT NULL,
    CONSTRAINT "UserSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "InventoryItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ownerId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "eventAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "InventoryItem_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TaskRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "requestText" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "correlationId" TEXT NOT NULL,
    "agentProvider" TEXT,
    "agentModel" TEXT,
    "promptVersion" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TaskRun_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "TaskRun_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "UserSession" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ActionRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "taskId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "payloadJson" JSONB NOT NULL,
    "rationale" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "requirement" TEXT,
    "policyId" TEXT,
    "policyVersion" INTEGER,
    "reasonCode" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "resultJson" JSONB,
    "errorCode" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ActionRun_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "TaskRun" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Listing" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ownerId" TEXT NOT NULL,
    "sourceItemId" TEXT NOT NULL,
    "taskId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "priceCents" INTEGER,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "status" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Listing_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Listing_sourceItemId_fkey" FOREIGN KEY ("sourceItemId") REFERENCES "InventoryItem" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Listing_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "TaskRun" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "VerificationSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "actionId" TEXT NOT NULL,
    "personaInquiryId" TEXT,
    "personaReferenceId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "verifiedAt" DATETIME,
    "expiresAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "VerificationSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "VerificationSession_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "UserSession" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "VerificationSession_actionId_fkey" FOREIGN KEY ("actionId") REFERENCES "ActionRun" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AuthorizationGrant" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "actionId" TEXT NOT NULL,
    "verificationSessionId" TEXT NOT NULL,
    "scopeHash" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "issuedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" DATETIME NOT NULL,
    "consumedAt" DATETIME,
    CONSTRAINT "AuthorizationGrant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "AuthorizationGrant_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "UserSession" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "AuthorizationGrant_actionId_fkey" FOREIGN KEY ("actionId") REFERENCES "ActionRun" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AuthorizationGrant_verificationSessionId_fkey" FOREIGN KEY ("verificationSessionId") REFERENCES "VerificationSession" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "taskId" TEXT,
    "actionId" TEXT,
    "actorType" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "reasonCode" TEXT,
    "metadataJson" JSONB,
    "correlationId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuditEvent_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "TaskRun" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "AuditEvent_actionId_fkey" FOREIGN KEY ("actionId") REFERENCES "ActionRun" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE INDEX "UserSession_userId_idx" ON "UserSession"("userId");
CREATE INDEX "UserSession_expiresAt_idx" ON "UserSession"("expiresAt");
CREATE INDEX "InventoryItem_ownerId_idx" ON "InventoryItem"("ownerId");
CREATE UNIQUE INDEX "TaskRun_correlationId_key" ON "TaskRun"("correlationId");
CREATE INDEX "TaskRun_userId_createdAt_idx" ON "TaskRun"("userId", "createdAt");
CREATE INDEX "TaskRun_sessionId_idx" ON "TaskRun"("sessionId");
CREATE INDEX "TaskRun_status_idx" ON "TaskRun"("status");
CREATE UNIQUE INDEX "ActionRun_idempotencyKey_key" ON "ActionRun"("idempotencyKey");
CREATE INDEX "ActionRun_taskId_status_idx" ON "ActionRun"("taskId", "status");
CREATE INDEX "ActionRun_type_idx" ON "ActionRun"("type");
CREATE UNIQUE INDEX "ActionRun_taskId_sequence_key" ON "ActionRun"("taskId", "sequence");
CREATE INDEX "Listing_ownerId_status_idx" ON "Listing"("ownerId", "status");
CREATE INDEX "Listing_sourceItemId_idx" ON "Listing"("sourceItemId");
CREATE INDEX "Listing_taskId_idx" ON "Listing"("taskId");
CREATE UNIQUE INDEX "VerificationSession_personaInquiryId_key" ON "VerificationSession"("personaInquiryId");
CREATE UNIQUE INDEX "VerificationSession_personaReferenceId_key" ON "VerificationSession"("personaReferenceId");
CREATE INDEX "VerificationSession_userId_status_idx" ON "VerificationSession"("userId", "status");
CREATE INDEX "VerificationSession_sessionId_idx" ON "VerificationSession"("sessionId");
CREATE INDEX "VerificationSession_actionId_createdAt_idx" ON "VerificationSession"("actionId", "createdAt");
CREATE UNIQUE INDEX "AuthorizationGrant_verificationSessionId_key" ON "AuthorizationGrant"("verificationSessionId");
CREATE INDEX "AuthorizationGrant_userId_status_idx" ON "AuthorizationGrant"("userId", "status");
CREATE INDEX "AuthorizationGrant_sessionId_idx" ON "AuthorizationGrant"("sessionId");
CREATE INDEX "AuthorizationGrant_actionId_status_idx" ON "AuthorizationGrant"("actionId", "status");
CREATE INDEX "AuthorizationGrant_scopeHash_idx" ON "AuthorizationGrant"("scopeHash");
CREATE INDEX "AuthorizationGrant_expiresAt_idx" ON "AuthorizationGrant"("expiresAt");
CREATE INDEX "AuditEvent_taskId_createdAt_idx" ON "AuditEvent"("taskId", "createdAt");
CREATE INDEX "AuditEvent_actionId_createdAt_idx" ON "AuditEvent"("actionId", "createdAt");
CREATE INDEX "AuditEvent_correlationId_createdAt_idx" ON "AuditEvent"("correlationId", "createdAt");
CREATE INDEX "AuditEvent_eventType_idx" ON "AuditEvent"("eventType");
