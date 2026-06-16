import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'
import { chatJSON as chatOpenRouterJSON } from './openrouter.js'
import { chatJSON as chatAzureOpenAIJSON } from './azure-openai.js'

const MAX_HTML_BYTES = 1_200_000
const MAX_TEXT_CHARS = 12_000
const MAX_REDIRECTS = 4

function normalizeUrl(raw) {
  const compact = String(raw || '').trim().split(/\s+/)[0]
  if (!compact) throw new Error('Add a website URL first.')
  const url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(compact) ? compact : `https://${compact}`)
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Website URL must start with http:// or https://.')
  url.hash = ''
  return url
}

function isPrivateAddress(address) {
  if (!address) return true
  if (address.startsWith('::ffff:')) return isPrivateAddress(address.slice(7))
  const family = isIP(address)
  if (family === 4) {
    const [a, b] = address.split('.').map(Number)
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      a >= 224
    )
  }
  if (family === 6) {
    const v = address.toLowerCase()
    return v === '::1' || v.startsWith('fc') || v.startsWith('fd') || v.startsWith('fe80:')
  }
  return false
}

async function assertPublicUrl(url) {
  const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase()
  if (host === 'localhost' || host.endsWith('.localhost') || isPrivateAddress(host)) {
    throw new Error('Use a public website URL, not localhost or a private network address.')
  }
  const records = await lookup(host, { all: true }).catch(() => [])
  if (records.some((record) => isPrivateAddress(record.address))) {
    throw new Error('Website URL resolved to a private network address.')
  }
}

async function readTextCap(res) {
  const declared = Number(res.headers.get('content-length') || 0)
  if (declared > MAX_HTML_BYTES) throw new Error('Website page is too large to inspect.')
  const reader = res.body?.getReader()
  if (!reader) return ''
  const chunks = []
  let received = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    received += value.byteLength
    if (received > MAX_HTML_BYTES) throw new Error('Website page is too large to inspect.')
    chunks.push(value)
  }
  const decoder = new TextDecoder('utf-8')
  return chunks.map((chunk) => decoder.decode(chunk, { stream: true })).join('') + decoder.decode()
}

export async function fetchWebsiteHtml(rawUrl) {
  let url = normalizeUrl(rawUrl)
  for (let i = 0; i <= MAX_REDIRECTS; i++) {
    await assertPublicUrl(url)
    const res = await fetch(url, {
      redirect: 'manual',
      headers: {
        accept: 'text/html,application/xhtml+xml',
        'user-agent': 'Slidesmith/1.0 website-description',
      },
    })
    if ([301, 302, 303, 307, 308].includes(res.status)) {
      const location = res.headers.get('location')
      if (!location) throw new Error(`Website redirected without a location (${res.status}).`)
      url = new URL(location, url)
      if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Website redirected to an unsupported URL.')
      continue
    }
    if (!res.ok) throw new Error(`Website fetch failed (${res.status}).`)
    const contentType = res.headers.get('content-type') || ''
    if (contentType && !/html|text\/plain/i.test(contentType)) {
      throw new Error('Website did not return a readable HTML page.')
    }
    return { url: url.toString(), html: await readTextCap(res) }
  }
  throw new Error('Website redirected too many times.')
}

function decodeEntities(value) {
  return String(value || '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
}

function attrValue(tag, name) {
  const match = tag.match(new RegExp(`${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'))
  return decodeEntities(match?.[2] || match?.[3] || match?.[4] || '').trim()
}

function metaValue(html, key) {
  const metas = html.match(/<meta\b[^>]*>/gi) || []
  for (const tag of metas) {
    const name = attrValue(tag, 'name') || attrValue(tag, 'property')
    if (name.toLowerCase() === key.toLowerCase()) return attrValue(tag, 'content')
  }
  return ''
}

export function extractWebsiteText(html) {
  const title = decodeEntities(html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '').replace(/\s+/g, ' ').trim()
  const metaDescription = metaValue(html, 'description') || metaValue(html, 'og:description')
  const ogTitle = metaValue(html, 'og:title')
  const clean = html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript\b[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<svg\b[\s\S]*?<\/svg>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
  const bodyText = decodeEntities(clean).replace(/\s+/g, ' ').trim().slice(0, MAX_TEXT_CHARS)
  return { title: ogTitle || title, metaDescription, bodyText }
}

async function chatJSON({ aiProvider, keys, azureOpenAI, model, prompt }) {
  if (aiProvider === 'azure-openai') {
    return chatAzureOpenAIJSON({
      apiKey: keys.azureOpenAI,
      endpoint: azureOpenAI?.endpoint,
      model,
      prompt,
    })
  }
  return chatOpenRouterJSON({ apiKey: keys.openrouter, model, prompt })
}

export async function describeWebsite({ aiProvider, keys, azureOpenAI, model, url, brain }) {
  const fetched = await fetchWebsiteHtml(url)
  const page = extractWebsiteText(fetched.html)
  const prompt = `You are updating the Brain for a short-form social carousel generator.

Use the website evidence to write a clear app/brand description. Prefer concrete product facts over hype.

Existing Brain:
${JSON.stringify({
  niche: brain?.niche || '',
  appName: brain?.appName || '',
  appDescription: brain?.appDescription || '',
  audience: brain?.audience || '',
  linkUrl: brain?.linkUrl || '',
}, null, 2)}

Website URL:
${fetched.url}

Website evidence:
Title: ${page.title || '(none)'}
Meta description: ${page.metaDescription || '(none)'}
Visible text:
${page.bodyText || '(none)'}

Return ONLY JSON in this exact shape:
{
  "appName": "short product or brand name",
  "appDescription": "1-2 plain-language sentences explaining what it does, who it helps, and the concrete outcome",
  "audience": "specific target audience",
  "niche": "specific content niche"
}

Rules:
- Do not invent features that are not supported by the website.
- No hashtags.
- Avoid generic words like revolutionary, seamless, powerful, ultimate, game-changing.
- If a field is unclear, return an empty string for that field.`

  const parsed = await chatJSON({ aiProvider, keys, azureOpenAI, model, prompt })
  return {
    url: fetched.url,
    appName: String(parsed.appName || '').trim().slice(0, 120),
    appDescription: String(parsed.appDescription || '').replace(/\s+/g, ' ').trim().slice(0, 700),
    audience: String(parsed.audience || '').replace(/\s+/g, ' ').trim().slice(0, 220),
    niche: String(parsed.niche || '').replace(/\s+/g, ' ').trim().slice(0, 160),
  }
}
