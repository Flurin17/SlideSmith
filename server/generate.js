// Slideshow generation. Given the "Brain" (niche, audience, style memory,
// reference patterns), the chosen model writes N carousel slideshows: a hook,
// caption, hashtags, a rationale, and the per-slide text. Images are rendered
// later, client-side — the model only writes the words.
import { chatJSON as chatOpenRouterJSON } from './openrouter.js'
import { chatJSON as chatAzureOpenAIJSON } from './azure-openai.js'
import { logger } from './log.js'

const log = logger('generate')

// Background gradients assigned per slide so rendering needs no image-gen API.
const PALETTE = [
  ['#0f172a', '#1e293b'],
  ['#1a1a2e', '#16213e'],
  ['#2d1b1b', '#1a1010'],
  ['#0a1f1c', '#0f2922'],
  ['#1f1147', '#160d33'],
  ['#26120a', '#1a0c06'],
]

const LINK_STICKER_POSITIONS = new Set([
  'top-left',
  'top-right',
  'bottom-left',
  'bottom-right',
  'upper-center',
  'lower-center',
])

function displayLinkDomain(value = '') {
  const raw = String(value || '').trim()
  if (!raw) return ''
  const compact = raw.replace(/^@+/, '').split(/\s+/)[0]
  try {
    const url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(compact) ? compact : `https://${compact}`)
    const host = url.hostname.replace(/^www\./i, '')
    return host || compact.replace(/^https?:\/\//i, '').replace(/^www\./i, '').replace(/\/.*$/, '')
  } catch {
    return compact.replace(/^https?:\/\//i, '').replace(/^www\./i, '').replace(/\/.*$/, '')
  }
}

function slideText(raw) {
  return typeof raw === 'string' ? raw : String(raw?.text || '')
}

function sanitizeLinkSticker(raw, stickerIndex, linkDomain) {
  if (!linkDomain) return null
  if (!raw || typeof raw !== 'object') return null
  const position = LINK_STICKER_POSITIONS.has(raw.position) ? raw.position : 'bottom-right'
  return {
    text: linkDomain.slice(0, 48),
    position,
    style: stickerIndex % 2 === 0 ? 'instagram' : 'tiktok',
  }
}

function buildPrompt(brain, count, direction = '') {
  return `You write short-form social media carousel slideshows (TikTok/Instagram).

Account context:
- Niche: ${brain.niche || '(unspecified)'}
- App / brand: ${brain.appName || '(unspecified)'} — ${brain.appDescription || ''}
- Audience: ${brain.audience || '(unspecified)'}
- Link sticker domain: ${displayLinkDomain(brain.linkUrl) || '(none — do not add link stickers)'}

Batch direction / angle:
${direction || '(none — choose the strongest on-brand angles)'}

What's working for this account (style memory — respect this closely):
${brain.styleMemory || '(none yet — use proven short-form patterns)'}

Write ${count} distinct slideshows. Respond with a JSON object of this exact shape:
{
  "slideshows": [
    {
      "hook": "the first slide — a scroll-stopping line, max ~8 words",
      "slides": [
        {
          "text": "the hook again as slide 1, max ~8 words",
          "linkSticker": null
        },
        {
          "text": "slide 2, max ~8 words",
          "linkSticker": {
            "text": "${displayLinkDomain(brain.linkUrl) || 'domain.com'}",
            "position": "top-left | top-right | bottom-left | bottom-right | upper-center | lower-center"
          }
        }
      ],
      "caption": "the post caption with 1-2 emoji",
      "hashtags": ["three", "relevant", "hashtags"],
      "rationale": "one sentence on why this should perform, tied to the style memory"
    }
  ]
}

Use 5-6 slides per slideshow. Add linkSticker only when the link sticker domain is configured and it improves the visual CTA or context; 0-2 stickers per slideshow is usually enough. The linkSticker text must be exactly the configured link sticker domain, not generic CTA text and not a full URL. Choose a position that avoids the main centered caption.

Keep them on-brand, varied, and genuinely good. Do not write generic filler. Return ONLY the JSON object.`
}

// Generate in small batches so big counts don't overflow the model's output /
// truncate the JSON. Each call asks for a handful; we loop until we hit `count`.
const BATCH = 6

function providerLabel(aiProvider) {
  return aiProvider === 'azure-openai' ? 'Azure OpenAI' : 'OpenRouter'
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

export async function generateSlideshows({ aiProvider = 'openrouter', keys, azureOpenAI, model, brain, count = 4, direction = '' }) {
  log.start(`Generating ${count} slideshow${count === 1 ? '' : 's'} with ${providerLabel(aiProvider)} · ${model}`)
  if (brain?.niche) log.info(`niche: ${brain.niche}${brain.appName ? ` · ${brain.appName}` : ''}`)
  if (direction) log.info(`direction: ${direction}`)
  const raw = []
  let safety = 0
  while (raw.length < count && safety < count + 5) {
    safety++
    const n = Math.min(BATCH, count - raw.length)
    log.step(`asking model for ${n} more (${raw.length}/${count} so far)…`)
    const parsed = await chatJSON({ aiProvider, keys, azureOpenAI, model, prompt: buildPrompt(brain, n, direction) })
    const batch = parsed.slideshows || []
    if (!batch.length) {
      log.warn('model returned no slideshows — stopping early')
      break // model returned nothing — stop rather than loop forever
    }
    raw.push(...batch)
    log.progress(Math.min(raw.length, count), count, 'written')
  }
  log.ok(`Generated ${Math.min(raw.length, count)} slideshow${raw.length === 1 ? '' : 's'}`)

  const stamp = Date.now()
  const linkDomain = displayLinkDomain(brain?.linkUrl)
  let linkStickerCount = 0
  return raw.slice(0, count).map((s, i) => {
    const [from, to] = PALETTE[i % PALETTE.length]
    return {
      id: `q-${stamp}-${i}`,
      hook: s.hook || (s.slides && slideText(s.slides[0])) || '',
      caption: s.caption || '',
      hashtags: s.hashtags || [],
      rationale: s.rationale || '',
      createdAt: new Date(stamp).toISOString(),
      slides: (s.slides || []).map((rawSlide, j) => {
        const linkSticker = sanitizeLinkSticker(rawSlide?.linkSticker, linkStickerCount, linkDomain)
        if (linkSticker) linkStickerCount++
        return {
          id: `slide-${stamp}-${i}-${j}`,
          text: slideText(rawSlide),
          bgFrom: from,
          bgTo: to,
          ...(linkSticker ? { linkSticker } : {}),
        }
      }),
    }
  })
}
