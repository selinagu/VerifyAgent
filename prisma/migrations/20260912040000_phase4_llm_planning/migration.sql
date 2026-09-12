-- AlterTable
ALTER TABLE "TaskRun" ADD COLUMN "requestIdempotencyKey" TEXT;
ALTER TABLE "TaskRun" ADD COLUMN "requestHash" TEXT;
ALTER TABLE "TaskRun" ADD COLUMN "planningErrorCode" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "TaskRun_requestIdempotencyKey_key" ON "TaskRun"("requestIdempotencyKey");
CREATE INDEX "TaskRun_requestHash_idx" ON "TaskRun"("requestHash");
