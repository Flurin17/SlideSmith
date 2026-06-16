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

const FONT_STYLES = new Set(['bold', 'editorial', 'compact'])

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

function sanitizeFontStyle(raw) {
  return FONT_STYLES.has(raw) ? raw : null
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

function imageCatalogPrompt(libraryImages = []) {
  const rows = libraryImages
    .filter((img) => img.description)
    .slice(0, 120)
    .map((img) => `- ${img.id} | pack: ${img.pack} | ${img.description}`)
  return rows.length ? rows.join('\n') : '(no described images available)'
}

function buildPrompt(brain, count, direction = '', pillar = '', preset = '', libraryImages = [], aiCreativeControl = false) {
  const pillars = Array.isArray(brain.contentPillars)
    ? brain.contentPillars.filter(Boolean).map((p) => `- ${p}`).join('\n')
    : ''
  return `You write short-form social media carousel slideshows (TikTok/Instagram).

Account context:
- Niche: ${brain.niche || '(unspecified)'}
- App / brand: ${brain.appName || '(unspecified)'} — ${brain.appDescription || ''}
- Audience: ${brain.audience || '(unspecified)'}
- Link sticker domain: ${displayLinkDomain(brain.linkUrl) || '(none — do not add link stickers)'}

Content pillars:
${pillars || '(none configured — infer strong recurring themes from the niche)'}

Selected pillar:
${pillar || '(none — rotate across the strongest pillars)'}

Generation preset / quick direction:
${preset || '(none — choose the strongest format)'}

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
          "fontStyle": "bold | editorial | compact",
          "imageId": "optional image id from the catalog",
          "linkSticker": null
        },
        {
          "text": "slide 2, max ~8 words",
          "fontStyle": "bold | editorial | compact",
          "imageId": "optional image id from the catalog",
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

Font control:
- Pick a fontStyle for every slide.
- "bold" is clean, direct, high-contrast social captioning.
- "editorial" is serif, premium, reflective, or story-like.
- "compact" is mono, tactical, checklist, data, booking, or warning-like.

${aiCreativeControl ? `Image catalog:
${imageCatalogPrompt(libraryImages)}

Image control:
- Choose imageId for each slide when a catalog image improves the setting, mood, or message.
- Match scenic/travel backgrounds to place, urgency, route, date, proof, or planning context.
- Avoid busy images for text-heavy slides. Use visually calm images for dense instructions.
- Reuse an image only if it strengthens a repeated motif.` : 'Image control: imageId is optional and can be omitted.'}

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

export async function generateSlideshows({ aiProvider = 'openrouter', keys, azureOpenAI, model, brain, count = 4, direction = '', pillar = '', preset = '', libraryImages = [], aiCreativeControl = false, onProgress }) {
  log.start(`Generating ${count} slideshow${count === 1 ? '' : 's'} with ${providerLabel(aiProvider)} · ${model}`)
  onProgress?.({ phase: 'writing', done: 0, total: count, message: `Starting ${providerLabel(aiProvider)} · ${model}` })
  if (brain?.niche) log.info(`niche: ${brain.niche}${brain.appName ? ` · ${brain.appName}` : ''}`)
  if (pillar) log.info(`pillar: ${pillar}`)
  if (preset) log.info(`preset: ${preset}`)
  if (direction) log.info(`direction: ${direction}`)
  const raw = []
  let safety = 0
  while (raw.length < count && safety < count + 5) {
    safety++
    const n = Math.min(BATCH, count - raw.length)
    log.step(`asking model for ${n} more (${raw.length}/${count} so far)…`)
    onProgress?.({ phase: 'writing', done: raw.length, total: count, message: `Writing ${n} more slideshow${n === 1 ? '' : 's'}…` })
    const parsed = await chatJSON({ aiProvider, keys, azureOpenAI, model, prompt: buildPrompt(brain, n, direction, pillar, preset, libraryImages, aiCreativeControl) })
    const batch = parsed.slideshows || []
    if (!batch.length) {
      log.warn('model returned no slideshows — stopping early')
      break // model returned nothing — stop rather than loop forever
    }
    raw.push(...batch)
    log.progress(Math.min(raw.length, count), count, 'written')
    onProgress?.({ phase: 'writing', done: Math.min(raw.length, count), total: count, message: `${Math.min(raw.length, count)} / ${count} written` })
  }
  log.ok(`Generated ${Math.min(raw.length, count)} slideshow${raw.length === 1 ? '' : 's'}`)
  onProgress?.({ phase: 'writing', done: Math.min(raw.length, count), total: count, message: 'Structuring slides…' })

  const stamp = Date.now()
  const linkDomain = displayLinkDomain(brain?.linkUrl)
  const generationContext = {
    ...(direction ? { direction } : {}),
    ...(pillar ? { pillarName: pillar } : {}),
    ...(preset ? { presetName: preset.split(':')[0].trim() || preset } : {}),
  }
  const imageById = new Map((libraryImages || []).map((img) => [img.id, img]))
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
      ...(Object.keys(generationContext).length ? { generationContext } : {}),
      slides: (s.slides || []).map((rawSlide, j) => {
        const linkSticker = sanitizeLinkSticker(rawSlide?.linkSticker, linkStickerCount, linkDomain)
        if (linkSticker) linkStickerCount++
        return {
          id: `slide-${stamp}-${i}-${j}`,
          text: slideText(rawSlide),
          bgFrom: from,
          bgTo: to,
          ...(sanitizeFontStyle(rawSlide?.fontStyle) ? { fontStyle: sanitizeFontStyle(rawSlide.fontStyle) } : {}),
          ...(rawSlide?.imageId && imageById.has(rawSlide.imageId) ? { imageUrl: imageById.get(rawSlide.imageId).url } : {}),
          ...(linkSticker ? { linkSticker } : {}),
        }
      }),
    }
  })
}

function editInstruction(action) {
  switch (action) {
    case 'shorten':
      return 'Make the selected slide shorter and punchier while preserving the meaning.'
    case 'sharpen':
      return 'Make the selected slide a stronger hook with more tension, specificity, or curiosity.'
    case 'rewrite':
      return 'Rewrite the selected slide in the account voice from the style memory.'
    case 'cta':
      return 'Add a final CTA slide that points to the configured link domain or next action. Keep existing slides unchanged unless a tiny transition helps.'
    default:
      return 'Improve the selected slide while keeping it on-brand.'
  }
}

export async function editSlideWithAI({ aiProvider = 'openrouter', keys, azureOpenAI, model, brain, action, slideIndex = 0, slides = [], caption = '', hashtags = [] }) {
  const prompt = `You are editing one TikTok/Instagram carousel slideshow.

Account context:
- Niche: ${brain.niche || '(unspecified)'}
- Brand: ${brain.appName || '(unspecified)'} — ${brain.appDescription || ''}
- Audience: ${brain.audience || '(unspecified)'}
- Link sticker domain: ${displayLinkDomain(brain.linkUrl) || '(none)'}

Style memory:
${brain.styleMemory || '(none)'}

Task:
${editInstruction(action)}

Selected slide index: ${slideIndex + 1}

Current slideshow:
${JSON.stringify({ slides: slides.map((s) => ({ text: slideText(s), fontStyle: s.fontStyle || null, linkSticker: s.linkSticker || null })), caption, hashtags }, null, 2)}

Return ONLY JSON in this exact shape:
{
  "slides": [
    { "text": "slide text", "fontStyle": "bold | editorial | compact", "linkSticker": null }
  ],
  "caption": "caption",
  "hashtags": ["tag"]
}

Rules:
- Keep 5-7 slides unless the task is adding a CTA.
- Keep every slide around 8 words or fewer.
- Preserve link stickers unless the CTA action needs one.
- Hashtags must not include #.`

  const parsed = await chatJSON({ aiProvider, keys, azureOpenAI, model, prompt })
  const linkDomain = displayLinkDomain(brain?.linkUrl)
  let stickerCount = 0
  const sourceSlides = Array.isArray(slides) ? slides : []
  const nextSlides = (parsed.slides || []).map((rawSlide, i) => {
    const previous = sourceSlides[i] || sourceSlides[sourceSlides.length - 1] || {}
    const linkSticker = sanitizeLinkSticker(rawSlide?.linkSticker || previous.linkSticker, stickerCount, linkDomain)
    if (linkSticker) stickerCount++
    return {
      ...previous,
      id: i < sourceSlides.length && previous.id ? previous.id : `slide-${Date.now()}-${i}`,
      text: slideText(rawSlide),
      fontStyle: sanitizeFontStyle(rawSlide?.fontStyle) || previous.fontStyle,
      ...(linkSticker ? { linkSticker } : {}),
    }
  })
  return {
    slides: nextSlides.length ? nextSlides : sourceSlides,
    caption: typeof parsed.caption === 'string' ? parsed.caption : caption,
    hashtags: Array.isArray(parsed.hashtags) ? parsed.hashtags.map(String) : hashtags,
  }
}
