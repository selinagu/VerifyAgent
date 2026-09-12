-- CreateTable
CREATE TABLE "ActionConfirmation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "actionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "decision" TEXT NOT NULL,
    "confirmedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ActionConfirmation_actionId_fkey" FOREIGN KEY ("actionId") REFERENCES "ActionRun" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ActionConfirmation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ActionConfirmation_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "UserSession" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "ActionConfirmation_actionId_key" ON "ActionConfirmation"("actionId");
CREATE INDEX "ActionConfirmation_userId_decision_idx" ON "ActionConfirmation"("userId", "decision");
CREATE INDEX "ActionConfirmation_sessionId_idx" ON "ActionConfirmation"("sessionId");
CREATE INDEX "ActionConfirmation_payloadHash_idx" ON "ActionConfirmation"("payloadHash");
