import type { PrismaClient } from "@prisma/client";

import { DEMO_IDS } from "./fixtures";

export async function resetDemoNamespace(prisma: PrismaClient): Promise<void> {
  const demoTasks = await prisma.taskRun.findMany({
    where: { userId: DEMO_IDS.userId },
    select: { id: true },
  });
  const taskIds = demoTasks.map(({ id }) => id);
  const demoVerifications = await prisma.verificationSession.findMany({
    where: { userId: DEMO_IDS.userId },
    select: { personaInquiryId: true },
  });
  const inquiryIds = demoVerifications.flatMap(({ personaInquiryId }) =>
    personaInquiryId ? [personaInquiryId] : [],
  );

  await prisma.$transaction(async (tx) => {
    await tx.personaWebhookEvent.deleteMany({
      where: {
        OR: [
          { inquiryId: { startsWith: "inq_demo_" } },
          ...(inquiryIds.length > 0 ? [{ inquiryId: { in: inquiryIds } }] : []),
        ],
      },
    });
    if (taskIds.length > 0) {
      await tx.auditEvent.deleteMany({ where: { taskId: { in: taskIds } } });
    }
    await tx.actionConfirmation.deleteMany({ where: { userId: DEMO_IDS.userId } });
    await tx.authorizationGrant.deleteMany({ where: { userId: DEMO_IDS.userId } });
    await tx.verificationSession.deleteMany({ where: { userId: DEMO_IDS.userId } });
    if (taskIds.length > 0) {
      await tx.actionRun.deleteMany({ where: { taskId: { in: taskIds } } });
    }
    await tx.listing.deleteMany({ where: { ownerId: DEMO_IDS.userId } });
    await tx.taskRun.deleteMany({ where: { userId: DEMO_IDS.userId } });

    await tx.user.upsert({
      where: { id: DEMO_IDS.userId },
      update: { displayName: "Alex", email: "alex.demo@verifyagent.local" },
      create: {
        id: DEMO_IDS.userId,
        displayName: "Alex",
        email: "alex.demo@verifyagent.local",
      },
    });

    await tx.userSession.upsert({
      where: { id: DEMO_IDS.sessionId },
      update: {
        userId: DEMO_IDS.userId,
        expiresAt: new Date("2099-01-01T00:00:00.000Z"),
      },
      create: {
        id: DEMO_IDS.sessionId,
        userId: DEMO_IDS.userId,
        expiresAt: new Date("2099-01-01T00:00:00.000Z"),
      },
    });

    await tx.inventoryItem.upsert({
      where: { id: DEMO_IDS.inventoryItemId },
      update: {
        ownerId: DEMO_IDS.userId,
        type: "CONCERT_TICKET",
        title: "Rice Stadium Concert Ticket",
        description: "One transferable general-admission concert ticket.",
      },
      create: {
        id: DEMO_IDS.inventoryItemId,
        ownerId: DEMO_IDS.userId,
        type: "CONCERT_TICKET",
        title: "Rice Stadium Concert Ticket",
        description: "One transferable general-admission concert ticket.",
      },
    });
  });
}
