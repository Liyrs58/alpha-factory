/**
 * NVIDIA NIM — OpenAI-compatible chat completions (SSE stream).
 * Proposer/critic locked to Gemma 4 31B Instruct. Mock when NVIDIA_API_KEY is unset.
 * Cold start can take ~2 min; requests abort after NIM_TIMEOUT_MS.
 */

export const NIM_BASE_DEFAULT = "https://integrate.api.nvidia.com/v1";
/** Locked model id — do not substitute. */
export const NIM_MODEL = "google/gemma-4-31b-it";
/** Floor for NIM HTTP + stream read. Covers ~2 min cold start. */
export const NIM_TIMEOUT_MS = 180_000;

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

/** Fold one SSE `data:` payload into the running completion text. */
export function appendSsePayload(text: string, payload: string): string {
  const data = payload.trim();
  if (!data || data === "[DONE]") return text;
  try {
    const json = JSON.parse(data) as {
      choices?: Array<{
        delta?: { content?: string | null };
        message?: { content?: string | null };
      }>;
    };
    const choice = json.choices?.[0];
    const piece = choice?.delta?.content ?? choice?.message?.content ?? "";
    return piece ? text + piece : text;
  } catch {
    return text;
  }
}

async function readSseStream(res: Response): Promise<string> {
  if (!res.body) throw new Error("NIM empty stream");
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let text = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split(/\r?\n/);
    buf = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      text = appendSsePayload(text, trimmed.slice(5));
    }
  }
  if (buf.trim().startsWith("data:")) {
    text = appendSsePayload(text, buf.trim().slice(5));
  }
  return text;
}

export async function nimChat(opts: {
  system: string;
  user: string;
  temperature?: number;
  maxTokens?: number;
}): Promise<{ ok: true; text: string } | { ok: false; message: string }> {
  const key = nvidiaKey();
  if (!key) return { ok: false, message: "no NVIDIA_API_KEY" };

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), NIM_TIMEOUT_MS);

  try {
    const res = await fetch(`${nvidiaBaseUrl()}/chat/completions`, {
      method: "POST",
      signal: ac.signal,
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        Accept: "text/event-stream",
      },
      body: JSON.stringify({
        model: NIM_MODEL,
        temperature: opts.temperature ?? 0.6,
        max_tokens: opts.maxTokens ?? 1024,
        stream: true,
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

    const ctype = res.headers.get("content-type") ?? "";
    let text = "";
    if (ctype.includes("application/json") && !ctype.includes("event-stream")) {
      const json = (await res.json()) as {
        choices?: { message?: { content?: string } }[];
      };
      text = json.choices?.[0]?.message?.content ?? "";
    } else {
      text = await readSseStream(res);
    }

    if (!text.trim()) return { ok: false, message: "NIM empty completion" };
    return { ok: true, text };
  } catch (e) {
    if (ac.signal.aborted) {
      return { ok: false, message: `NIM timeout after ${NIM_TIMEOUT_MS / 1000}s` };
    }
    return { ok: false, message: e instanceof Error ? e.message : "NIM request failed" };
  } finally {
    clearTimeout(timer);
  }
}
