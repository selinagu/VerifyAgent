-- Persist logical action dependencies separately from the action payload.
ALTER TABLE "ActionRun" ADD COLUMN "dependsOnJson" JSONB NOT NULL DEFAULT '[]';
