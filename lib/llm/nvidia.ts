/**
 * NVIDIA NIM — OpenAI-compatible chat completions.
 * Proposer/critic locked to Gemma 4 31B Instruct. Mock when NVIDIA_API_KEY is unset.
 */

export const NIM_BASE_DEFAULT = "https://integrate.api.nvidia.com/v1";
/** Locked model id — do not substitute. */
export const NIM_MODEL = "google/gemma-4-31b-it";

export function nvidiaKey(): string | null {
  const k = process.env.NVIDIA_API_KEY?.trim();
  return k || null;
}

export function nvidiaModel(): string {
  return NIM_MODEL;
}

export function nvidiaBaseUrl(): string {
  const raw = process.env.NVIDIA_BASE_URL?.trim() || NIM_BASE_DEFAULT;
  return raw.replace(/\/+$/, "");
}

export function extractJsonObject(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fenced?.[1] ?? text;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("NIM response had no JSON object");
  return body.slice(start, end + 1);
}

export async function nimChat(opts: {
  system: string;
  user: string;
  temperature?: number;
  maxTokens?: number;
}): Promise<{ ok: true; text: string } | { ok: false; message: string }> {
  const key = nvidiaKey();
  if (!key) return { ok: false, message: "no NVIDIA_API_KEY" };

  try {
    const res = await fetch(`${nvidiaBaseUrl()}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        model: NIM_MODEL,
        temperature: opts.temperature ?? 0.6,
        max_tokens: opts.maxTokens ?? 1024,
        stream: false,
        messages: [
          { role: "system", content: opts.system },
          { role: "user", content: opts.user },
        ],
      }),
    });
    if (!res.ok) {
      const err = await res.text();
      return { ok: false, message: `NIM HTTP ${res.status} ${err.slice(0, 200)}` };
    }
    const json = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const text = json.choices?.[0]?.message?.content ?? "";
    if (!text.trim()) return { ok: false, message: "NIM empty completion" };
    return { ok: true, text };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "NIM request failed" };
  }
}
