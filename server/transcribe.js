// AI image descriptions for background selection. Stored locally and generated
// in a bounded parallel job so enabling AI creative control does not block the UI.
import sharp from 'sharp'
import { chatJSON as chatOpenRouterJSON } from './openrouter.js'
import { chatJSON as chatAzureOpenAIJSON } from './azure-openai.js'
import {
  getLibraryImageFile,
  imageDescriptionStats,
  imagesMissingDescriptions,
  saveImageDescription,
} from './library.js'
import { logger } from './log.js'

const log = logger('transcribe')
const CONCURRENCY = 4


const state = {
  running: false,
  done: 0,
  failed: 0,
  lastError: null,
  startedAt: null,
  finishedAt: null,
}

async function lowQualityImageDataUrl(file) {
  const data = await sharp(file, { animated: false })
    .rotate()
    .resize({
      width: 640,
      height: 640,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .jpeg({
      quality: 45,
      progressive: false,
      mozjpeg: true,
    })
    .toBuffer()
  return `data:image/jpeg;base64,${data.toString('base64')}`
}

async function chatVisionJSON({ aiProvider, keys, azureOpenAI, model, imageUrl, prompt }) {
  const messages = [
    {
      role: 'user',
      content: [
        { type: 'text', text: prompt },
        { type: 'image_url', image_url: { url: imageUrl } },
      ],
    },
  ]
  if (aiProvider === 'azure-openai') {
    return chatAzureOpenAIJSON({
      apiKey: keys.azureOpenAI,
      endpoint: azureOpenAI?.endpoint,
      model,
      messages,
    })
  }
  return chatOpenRouterJSON({ apiKey: keys.openrouter, model, messages })
}

async function describeImage({ aiProvider, keys, azureOpenAI, model, image }) {
  const file = getLibraryImageFile(image.id)
  if (!file) throw new Error(`Image file not found for ${image.id}`)
  const parsed = await chatVisionJSON({
    aiProvider,
    keys,
    azureOpenAI,
    model,
    imageUrl: await lowQualityImageDataUrl(file),
    prompt: `Describe this image for choosing TikTok/Instagram carousel backgrounds.

Return ONLY JSON:
{
  "description": "one concise sentence with subject, setting, mood, dominant colors, and visual density",
  "bestUse": "what kind of slide/message this background fits",
  "avoidFor": "what kind of slide/message it would hurt"
}

Keep the description factual and useful for matching text overlays. Do not mention that you are an AI.`,
  })
  const description = [parsed.description, parsed.bestUse ? `Best for: ${parsed.bestUse}` : '', parsed.avoidFor ? `Avoid for: ${parsed.avoidFor}` : '']
    .filter(Boolean)
    .join(' ')
    .slice(0, 700)
  if (!description) throw new Error(`No description returned for ${image.id}`)
  return saveImageDescription(image.id, {
    description,
    pack: image.pack,
    source: image.source,
  })
}

export function transcriptionStatus(enabled = false) {
  const stats = imageDescriptionStats()
  return {
    enabled: !!enabled,
    running: state.running,
    total: stats.total,
    described: stats.described,
    pending: stats.pending,
    done: state.done,
    failed: state.failed,
    lastError: state.lastError,
    startedAt: state.startedAt,
    finishedAt: state.finishedAt,
  }
}

export function startImageTranscriptionJob({ aiProvider, keys, azureOpenAI, model }) {
  if (state.running) return transcriptionStatus(true)
  const images = imagesMissingDescriptions()
  state.running = true
  state.done = 0
  state.failed = 0
  state.lastError = null
  state.startedAt = new Date().toISOString()
  state.finishedAt = null

  void (async () => {
    log.start(`Transcribing ${images.length} library image${images.length === 1 ? '' : 's'} with ${model}`)
    let next = 0
    const worker = async () => {
      while (next < images.length) {
        const image = images[next++]
        try {
          await describeImage({ aiProvider, keys, azureOpenAI, model, image })
          state.done++
        } catch (e) {
          state.failed++
          state.lastError = e instanceof Error ? e.message : String(e)
          log.warn(`${image.id}: ${state.lastError}`)
        }
        if ((state.done + state.failed) % 5 === 0 || state.done + state.failed === images.length) {
          log.progress(state.done + state.failed, images.length, 'processed')
        }
      }
    }

    try {
      await Promise.all(Array.from({ length: Math.min(CONCURRENCY, Math.max(1, images.length)) }, worker))
      log.ok(`Image transcription finished (${state.done} done, ${state.failed} failed)`)
    } finally {
      state.running = false
      state.finishedAt = new Date().toISOString()
    }
  })()

  return transcriptionStatus(true)
}
