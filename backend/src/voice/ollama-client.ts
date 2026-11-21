/**
 * Ollama Local LLM Client for Gemma 3:4B (v1.06).
 * Connects directly to the user's locally running Ollama instance on http://localhost:11434.
 *
 * Provides domain-grounded conversational answers for the Gnani Voice Agent and
 * the Dashboard AI Assistant, with fast fallback to deterministic rule-based brain
 * if Ollama is busy, offline, or takes longer than the timeout.
 */

export interface GemmaStoreContext {
  storeName?: string;
  category?: string;
  tagline?: string;
  catalog?: Array<{ name: string; price: string; stock: number }>;
  ordersCount?: number;
}

export interface GemmaResponse {
  reply: string;
  model: string;
  latencyMs: number;
}

const OLLAMA_HOST = process.env.OLLAMA_HOST || 'http://localhost:11434';
const GEMMA_MODEL = process.env.OLLAMA_MODEL || 'gemma3:4b';
const TIMEOUT_MS = 9000;

/**
 * Checks if Ollama and the gemma3:4b model are reachable.
 */
export async function isOllamaAvailable(): Promise<boolean> {
  try {
    const res = await fetch(`${OLLAMA_HOST}/api/tags`, { signal: AbortSignal.timeout(1500) });
    if (!res.ok) return false;
    const data = (await res.json()) as { models?: Array<{ name?: string }> };
    return Array.isArray(data.models) && data.models.some((m) => m.name?.startsWith('gemma3'));
  } catch {
    return false;
  }
}

/**
 * Queries local Gemma 3:4B via Ollama generate API.
 */
export async function askGemma3(
  query: string,
  context?: GemmaStoreContext
): Promise<GemmaResponse | null> {
  const start = Date.now();
  const storeName = context?.storeName || 'RetailSync';
  const category = context?.category || 'Retail';
  const catalogList = context?.catalog?.length
    ? context.catalog.slice(0, 8).map((p) => `• ${p.name}: ${p.price} (${p.stock} in stock)`).join('\n')
    : 'Standard catalog in stock';

  const systemPrompt = `You are RetailSync Voice Assistant, powered by Gemma 3:4B and Gnani Voice.
You answer user questions about RetailSync online stores, products, pricing, stock levels, orders, and cloud architecture (Aiven PostgreSQL row-locking, Apache Kafka event streams, OpenSearch).
Context for the current store:
- Store Name: ${storeName}
- Category: ${category}
- Catalog items:
${catalogList}

RULES FOR YOUR ANSWER:
1. Speak naturally and conversationally in 1 to 2 short sentences.
2. The answer will be spoken aloud to the user via Gnani Timbre Text-to-Speech, so do NOT use markdown bullet points, asterisks, hashtags, or formatting that sounds strange when spoken aloud.
3. Be helpful, concise, and accurate based on the store context. If asked about pricing or stock, use the exact figures above.`;

  const prompt = `<start_of_turn>user
${query}<end_of_turn>
<start_of_turn>model
`;

  try {
    const res = await fetch(`${OLLAMA_HOST}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: GEMMA_MODEL,
        system: systemPrompt,
        prompt: query,
        stream: false,
        options: {
          temperature: 0.35,
          num_predict: 90,
        },
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!res.ok) return null;
    const data = (await res.json()) as { response?: string };
    const text = (data.response || '').trim();
    if (!text) return null;

    // Clean up any remaining markdown artifacts or extra quotes
    const cleaned = text
      .replace(/[*_#`]/g, '')
      .replace(/^["']|["']$/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    return {
      reply: cleaned,
      model: GEMMA_MODEL,
      latencyMs: Date.now() - start,
    };
  } catch (err) {
    // If Ollama timed out or is offline, return null for deterministic fallback
    return null;
  }
}
