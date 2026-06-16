// OpenRouter client. OpenRouter is an OpenAI-compatible gateway to hundreds of
// models behind a single key, with a public models list we surface as a dropdown.
import { chatCompletionJSON } from './openai-compatible.js'

const BASE = 'https://openrouter.ai/api/v1'

// Recommended (optional) attribution headers for OpenRouter.
const ATTRIBUTION = {
  'HTTP-Referer': 'https://github.com/slidesmith',
  'X-Title': 'Slidesmith',
}

// Public — no key required. Returns the full catalog so the UI can list models.
export async function listModels() {
  const res = await fetch(`${BASE}/models`)
  if (!res.ok) throw new Error(`OpenRouter models ${res.status}`)
  const body = await res.json()
  return (body?.data || [])
    .map((m) => ({ id: m.id, name: m.name || m.id }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

// Validate a key cheaply via the key-info endpoint (no token spend).
export async function validateKey(apiKey) {
  if (!apiKey) throw new Error('Missing OpenRouter API key. Add it in Settings.')
  const res = await fetch(`${BASE}/key`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  })
  if (!res.ok) throw new Error(`OpenRouter ${res.status}: invalid key`)
  return true
}

// One chat completion that must return a JSON object.
export async function chatJSON({ apiKey, model, prompt, messages }) {
  if (!apiKey) throw new Error('Missing OpenRouter API key. Add it in Settings.')
  return chatCompletionJSON({
    providerName: 'OpenRouter',
    url: `${BASE}/chat/completions`,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      ...ATTRIBUTION,
    },
    model,
    prompt,
    messages,
  })
}
