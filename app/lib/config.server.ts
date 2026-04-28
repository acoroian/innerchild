import { z } from "zod";

// Single boot-time validation point for env vars. Architecture review P2:
// the env-var surface is sprawling, so consolidate here and fail fast on
// missing values rather than discovering them at first request.
const ConfigSchema = z.object({
  // ── Supabase ──────────────────────────────────────────────────────────────
  SUPABASE_URL: z.string().url(),
  SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),

  // ── Cloud Tasks / Worker (optional in local dev — falls through to
  // in-process execution when unset, matching aerohub's pattern) ────────────
  CLOUD_TASKS_QUEUE: z.string().optional(),
  CLOUD_TASKS_WORKER_URL: z.string().url().optional(),
  CLOUD_TASKS_SA_EMAIL: z.string().email().optional(),
  WORKER_SHARED_SECRET: z.string().optional(),

  // ── Cloud Scheduler defense-in-depth (Security review CRITICAL #1) ────────
  SCHEDULER_SHARED_SECRET: z.string().optional(),
  SCHEDULER_SA_EMAIL: z.string().email().optional(),

  // ── Vendor adapter selection ──────────────────────────────────────────────
  AVATAR_ENGINE: z.enum(["mock", "tavus", "heygen", "did"]).default("mock"),
  VOICE_ENGINE: z.enum(["mock", "elevenlabs", "cartesia"]).default("mock"),
  REPLY_LLM: z.enum(["mock", "anthropic", "openai"]).default("mock"),

  // ── Vendor API keys (all optional; required only for chosen engines) ──────
  ANTHROPIC_API_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  ELEVENLABS_API_KEY: z.string().optional(),
  CARTESIA_API_KEY: z.string().optional(),
  TAVUS_API_KEY: z.string().optional(),
  HEYGEN_API_KEY: z.string().optional(),
  DID_API_KEY: z.string().optional(),

  // ── Site / runtime ────────────────────────────────────────────────────────
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  SITE_URL: z.string().url().optional(),
});

export type Config = z.infer<typeof ConfigSchema>;

function loadConfig(): Config {
  const parsed = ConfigSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return parsed.data;
}

export const config: Config = loadConfig();

export function getSiteUrl(): string {
  if (config.SITE_URL) return config.SITE_URL;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:5173";
}
