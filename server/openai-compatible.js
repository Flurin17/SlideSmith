// Shared helper for OpenAI-compatible Chat Completions providers.

// Pull a JSON object out of a model response, tolerating code fences / prose.
function extractJson(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  const candidate = fenced ? fenced[1] : text
  const start = candidate.indexOf('{')
  const end = candidate.lastIndexOf('}')
  if (start === -1 || end === -1) throw new Error('Model did not return JSON.')
  return JSON.parse(candidate.slice(start, end + 1))
}

export async function chatCompletionJSON({ providerName, url, headers, model, prompt, messages, tokenLimitParam = 'max_tokens' }) {
  if (!model) throw new Error('No model selected. Pick one in Settings.')

  const tokenLimit = { [tokenLimitParam]: 6000 }
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...headers,
    },
    body: JSON.stringify({
      model,
      ...tokenLimit,
      response_format: { type: 'json_object' },
      messages: messages || [{ role: 'user', content: prompt }],
    }),
  })

  const body = await res.json().catch(() => null)
  if (!res.ok) {
    throw new Error(`${providerName} ${res.status}: ${body?.error?.message || res.statusText}`)
  }
  const content = body?.choices?.[0]?.message?.content
  if (!content) throw new Error(`${providerName} returned no content.`)
  return extractJson(content)
}
