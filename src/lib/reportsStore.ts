import { getCloudflareContext } from "@opennextjs/cloudflare";

interface KvText {
  get(key: string): Promise<string | null>;
}

/** Read a pre-generated report value (JSON text) from the REPORTS KV namespace. */
export async function readReport(key: string): Promise<string | null> {
  try {
    const env = getCloudflareContext().env as unknown as Record<string, unknown>;
    const kv = env.REPORTS as KvText | undefined;
    return (await kv?.get(key)) ?? null;
  } catch {
    return null;
  }
}
