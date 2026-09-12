export type CheckState = "ready" | "missing" | "invalid" | "failed" | "enabled" | "disabled";

export type ReadinessSnapshot = {
  status: "ready" | "degraded" | "blocked";
  profile: "offline-success" | "real-sandbox" | "failure-demo" | "incomplete";
  checks: {
    database: CheckState;
    plannerConfiguration: CheckState;
    personaConfiguration: CheckState;
    webhookConfiguration: CheckState;
    demoMode: CheckState;
  };
};
