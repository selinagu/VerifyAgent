import { z } from "zod";

const optionalSecret = z.preprocess((value) => (value === "" ? undefined : value), z.string().min(1).optional());
const optionalLlmProvider = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.enum(["openai", "fake"]).optional(),
);

export const envSchema = z.object({
  DATABASE_URL: z.string().min(1).default("file:./dev.db"),
  APP_BASE_URL: z.string().url().default("http://localhost:3000"),
  DEMO_MODE: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
  DEMO_PROFILE: z.enum(["offline-success", "real-sandbox", "failure-demo"]).default("offline-success"),
  LLM_PROVIDER: optionalLlmProvider,
  LLM_API_KEY: optionalSecret,
  LLM_MODEL: optionalSecret,
  PERSONA_API_KEY: optionalSecret,
  PERSONA_WEBHOOK_SECRET: optionalSecret,
  PERSONA_ENVIRONMENT_ID: optionalSecret,
  PERSONA_TEMPLATE_ID: optionalSecret,
  PERSONA_API_VERSION: z.string().min(1).default("2025-10-27"),
}).superRefine((env, context) => {
  if (!env.DEMO_MODE && env.LLM_PROVIDER === "fake" && process.env.NODE_ENV !== "test") {
    context.addIssue({ code: "custom", path: ["LLM_PROVIDER"], message: "The fake planner is demo/test only." });
  }
});

export type AppEnv = z.infer<typeof envSchema>;

export function parseEnv(source: NodeJS.ProcessEnv = process.env): AppEnv {
  return envSchema.parse(source);
}

export function configurationFlags(env: AppEnv) {
  return {
    llmConfigured:
      env.LLM_PROVIDER === "fake"
        ? env.DEMO_MODE || process.env.NODE_ENV === "test"
        : Boolean(env.LLM_PROVIDER === "openai" && env.LLM_API_KEY && env.LLM_MODEL),
    personaConfigured: Boolean(
      env.PERSONA_API_KEY &&
        env.PERSONA_WEBHOOK_SECRET &&
        env.PERSONA_ENVIRONMENT_ID &&
        env.PERSONA_TEMPLATE_ID &&
        env.PERSONA_API_VERSION,
    ),
  };
}

export function configurationProfile(env: AppEnv): "offline-success" | "real-sandbox" | "failure-demo" | "incomplete" {
  if (env.DEMO_MODE && env.DEMO_PROFILE === "failure-demo") return "failure-demo";
  if (env.DEMO_MODE && env.LLM_PROVIDER === "fake") return "offline-success";
  if (env.DEMO_MODE && env.LLM_PROVIDER === "openai" && configurationFlags(env).personaConfigured) return "real-sandbox";
  return "incomplete";
}
