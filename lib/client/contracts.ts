export type ApiErrorBody = {
  error: { code: string; message: string; retryable?: boolean };
};

export type TaskActionSnapshot = {
  id: string;
  sequence: number;
  type: string;
  payload: unknown;
  rationale: string;
  status: string;
  requirement: string | null;
  reasonCode: string | null;
  result: unknown;
  errorCode: string | null;
  confirmationRequired: boolean;
  confirmationPayloadHash?: string;
  confirmationDecision?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ListingSnapshot = {
  id: string;
  title: string;
  description: string;
  priceCents: number | null;
  currency: string;
  status: string;
  version: number;
};

export type AuditSnapshot = {
  id: string;
  actionId: string | null;
  actorType: string;
  eventType: string;
  outcome: string;
  reasonCode: string | null;
  createdAt: string;
};

export type TaskSnapshot = {
  id: string;
  status: string;
  requestText: string;
  createdAt: string;
  updatedAt: string;
  planning: { provider: string | null; model: string | null; promptVersion: string | null; errorCode: string | null };
  actions: TaskActionSnapshot[];
  listings: ListingSnapshot[];
  audit: AuditSnapshot[];
};

export type DemoContext = {
  demoMode: boolean;
  defaultPrompt: string;
  inventory: Array<{ id: string; type: string; title: string; description: string; eventAt: string | null }>;
};

export type HealthSnapshot = {
  status: "ok" | "degraded";
  database: string;
  demoMode: boolean;
  llmConfigured: boolean;
  personaConfigured: boolean;
};

export type VerificationStart = { verificationId: string; verificationUrl: string; status: string };
