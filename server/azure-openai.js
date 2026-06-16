// Azure OpenAI v1 API client. The v1 API is OpenAI-compatible at:
//   https://{resource}.openai.azure.com/openai/v1
// Settings store the resource endpoint; this module normalizes it to that base.
import { chatCompletionJSON } from './openai-compatible.js'

function normalizeBaseUrl(endpoint) {
  const trimmed = String(endpoint || '').trim().replace(/\/+$/, '')
  if (!trimmed) return ''
  if (/\/openai\/v1$/i.test(trimmed)) return trimmed
  return `${trimmed}/openai/v1`
}

export function normalizeAzureEndpoint(endpoint) {
  return normalizeBaseUrl(endpoint)
}

export async function validateAzureOpenAI({ apiKey, endpoint }) {
  const baseUrl = normalizeBaseUrl(endpoint)
  if (!apiKey) throw new Error('Missing Azure OpenAI API key. Add it in Settings.')
  if (!baseUrl) throw new Error('Missing Azure OpenAI endpoint. Add it in Settings.')

  const res = await fetch(`${baseUrl}/models`, {
    headers: { 'api-key': apiKey },
  })
  if (!res.ok) {
    const body = await res.json().catch(() => null)
    throw new Error(`Azure OpenAI ${res.status}: ${body?.error?.message || res.statusText}`)
  }
  return true
}

export async function chatJSON({ apiKey, endpoint, model, prompt }) {
  const baseUrl = normalizeBaseUrl(endpoint)
  if (!apiKey) throw new Error('Missing Azure OpenAI API key. Add it in Settings.')
  if (!baseUrl) throw new Error('Missing Azure OpenAI endpoint. Add it in Settings.')

  return chatCompletionJSON({
    providerName: 'Azure OpenAI',
    url: `${baseUrl}/chat/completions`,
    headers: { 'api-key': apiKey },
    model,
    prompt,
    tokenLimitParam: 'max_completion_tokens',
  })
}
