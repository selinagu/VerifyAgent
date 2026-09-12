import type { Prisma } from "@prisma/client";

import type { CandidateAction } from "@/lib/actions/schema";
import type { ExecutionContext } from "../types";

export type HandlerResult = {
  result: Prisma.InputJsonObject;
  eventType: string;
  metadata: Prisma.InputJsonObject;
};

export type HandlerInput<TAction extends CandidateAction> = {
  tx: Prisma.TransactionClient;
  action: TAction;
  actionId: string;
  taskId: string;
  context: ExecutionContext;
};
