import type { PrismaClient } from "@prisma/client";

export function findActionForExecution(prisma: PrismaClient, actionId: string) {
  return prisma.actionRun.findUnique({
    where: { id: actionId },
    include: { task: true },
  });
}
