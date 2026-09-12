import { PrismaClient } from "@prisma/client";

import { resetDemoNamespace } from "../lib/demo/reset-demo";

const prisma = new PrismaClient();

resetDemoNamespace(prisma)
  .then(() => console.log("VerifyAgent demo data seeded."))
  .finally(async () => prisma.$disconnect());
