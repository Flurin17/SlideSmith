// Slidesmith local server. Holds the user's API keys, runs AI generation,
// proxies post-bridge (so keys never touch the browser and CORS is a non-issue),
// and serves the built UI in production. In dev, Vite proxies /api here.
import express from 'express'
import { existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  getConfig,
  saveGlobal,
  getActiveProject,
  createProject,
  updateProject,
  deleteProject,
  setActiveProject,
  getQueue,
  setQueue,
  addToQueue,
  removeFromQueue,
  CONFIG_DIR,
} from './store.js'
import { listAccounts, listPosts, listAnalytics, syncAnalytics, uploadMedia, createPost } from './postbridge.js'
import { editSlideWithAI, generateSlideshows } from './generate.js'
import { listModels, validateKey } from './openrouter.js'
import { validateAzureOpenAI } from './azure-openai.js'
import { listLibrary, listPacks, scrapePinterest, removeScraped, getScrapedFile } from './library.js'
import { startImageTranscriptionJob, transcriptionStatus } from './transcribe.js'
import { logger } from './log.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const schedLog = logger('schedule')
const genLog = logger('generate')
const PORT = process.env.PORT || 8787
const generateJobs = new Map()
// Bind loopback only by default. This server returns the user's API keys in
// plaintext (GET /api/config feeds the Settings UI), so listening on all
// interfaces would hand them to anyone on the same network. Set HOST yourself
// only if you know what you're doing (e.g. a firewalled headless box).
const HOST = process.env.HOST || '127.0.0.1'
const app = express()
app.use(express.json({ limit: '50mb' })) // base64 slide images can be large

const scoreResult = (a) => {
  const views = Number(a.view_count || a.views || 0)
  const likes = Number(a.like_count || a.likes || 0)
  const comments = Number(a.comment_count || a.comments || 0)
  const shares = Number(a.share_count || a.shares || 0)
  return views + likes * 8 + comments * 18 + shares * 24
}

const compactNumber = (n) => {
  const value = Number(n || 0)
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`
  return String(value)
}

const cleanPostText = (a, max = 180) => {
  const raw = String(a.video_description || a.description || a.caption || '').replace(/\s+/g, ' ').trim()
  return raw.length > max ? `${raw.slice(0, max - 1).trim()}…` : raw
}

const engagementRate = (a) => {
  const views = Number(a.view_count || a.views || 0)
  if (!views) return 0
  const engaged = Number(a.like_count || a.likes || 0) + Number(a.comment_count || a.comments || 0) + Number(a.share_count || a.shares || 0)
  return (engaged / views) * 100
}

function newJobId() {
  return `gen-${Date.now()}-${Math.round(Math.random() * 1e6)}`
}

function normalizePercent(done, total, phase) {
  if (phase === 'done') return 100
  if (phase === 'saving') return 96
  if (phase === 'backgrounds') {
    const ratio = total ? done / total : 0
    return Math.max(80, Math.min(95, Math.round(80 + ratio * 15)))
  }
  if (phase === 'writing') {
    const ratio = total ? done / total : 0
    return Math.max(2, Math.min(80, Math.round(2 + ratio * 78)))
  }
  if (!total) return 0
  return Math.max(0, Math.min(99, Math.round((done / total) * 100)))
}

function publicJob(job) {
  return {
    id: job.id,
    status: job.status,
    phase: job.phase,
    message: job.message,
    done: job.done,
    total: job.total,
    percent: normalizePercent(job.done, job.total, job.phase),
    error: job.error,
    resultCount: job.resultCount,
  }
}

function updateJob(job, patch) {
  Object.assign(job, patch)
  return publicJob(job)
}

async function generateForActiveProject(body, onProgress = () => {}) {
  const { keys, aiProvider, model, azureOpenAI } = getConfig()
  const project = getActiveProject()
  const count = Math.min(Math.max(Math.round(Number(body?.count) || 4), 1), 100)
  const direction = String(body?.direction || '').trim().slice(0, 500)
  const pillar = String(body?.pillar || '').trim().slice(0, 240)
  const preset = String(body?.preset || '').trim().slice(0, 700)

  const packs = Array.isArray(body?.packs) ? body.packs : project.imagePacks || []
  const pool = packs.length ? listLibrary().filter((i) => packs.includes(i.pack)) : []
  const aiImagePool = project.aiCreativeControl ? pool.filter((i) => i.description) : []
  const slideshows = await generateSlideshows({
    aiProvider,
    keys,
    azureOpenAI,
    model,
    brain: project.brain,
    count,
    direction,
    pillar,
    preset,
    libraryImages: aiImagePool,
    aiCreativeControl: project.aiCreativeControl,
    onProgress,
  })
  if (pool.length) {
    onProgress({ phase: 'backgrounds', done: 0, total: slideshows.length, message: `Assigning backgrounds from ${pool.length} images…` })
    genLog.step(`assigning backgrounds from ${packs.length} pack${packs.length === 1 ? '' : 's'} (${pool.length} images)`)
    let assigned = 0
    for (const show of slideshows) {
      const used = new Set()
      for (const slide of show.slides) {
        if (project.aiCreativeControl && slide.imageUrl) {
          used.add(slide.imageUrl)
          continue
        }
        // Prefer an unused image within this slideshow for visual variety.
        const fresh = pool.filter((i) => !used.has(i.url))
        const pick = (fresh.length ? fresh : pool)[Math.floor(Math.random() * (fresh.length || pool.length))]
        slide.imageUrl = pick.url
        used.add(pick.url)
      }
      assigned++
      onProgress({ phase: 'backgrounds', done: assigned, total: slideshows.length, message: `${assigned} / ${slideshows.length} background sets ready` })
    }
  }

  onProgress({ phase: 'saving', done: 0, total: 1, message: 'Saving to Queue…' })
  addToQueue(project.id, slideshows)
  onProgress({ phase: 'done', done: 1, total: 1, message: `Added ${slideshows.length} slideshow${slideshows.length === 1 ? '' : 's'} to Queue` })
  return slideshows
}

function inferWinnerPatterns(posts) {
  const patterns = new Set()
  const platforms = new Set()
  for (const post of posts) {
    const text = cleanPostText(post, 500)
    const lower = text.toLowerCase()
    const firstLine = text.split(/[.!?\n]/)[0]?.trim() || text
    if (post.platform) platforms.add(String(post.platform))
    if (/\?/.test(firstLine)) patterns.add('Question-led hooks are getting attention.')
    if (/^\d+|\b\d+\b/.test(firstLine)) patterns.add('Numbered or specific hooks are worth repeating.')
    if (/\b(stop|never|mistake|wrong|avoid|don'?t)\b/i.test(firstLine)) patterns.add('Contrarian/problem-avoidance openings are performing.')
    if (/\bhow to\b|\bguide\b|\btemplate\b|\bchecklist\b/i.test(lower)) patterns.add('Practical how-to framing is a useful angle.')
    if (firstLine.length > 0 && firstLine.length <= 70) patterns.add('Keep the first-slide promise short and direct.')
    if ((text.match(/#/g) || []).length >= 3) patterns.add('Hashtag clusters are present on winners; keep tags targeted, not generic.')
  }
  if (platforms.size) patterns.add(`Winning references came from ${Array.from(platforms).join(', ')}; keep platform-native phrasing.`)
  return patterns.size ? Array.from(patterns) : ['Model the hooks, topic angles, and caption tone from these winners.']
}

function buildWinnerLearning(posts) {
  const sorted = [...posts].sort((a, b) => scoreResult(b) - scoreResult(a)).slice(0, 6)
  const lines = [
    `Performance learnings (${new Date().toISOString().slice(0, 10)})`,
    'Use these observed winners when writing future carousels:',
  ]
  for (const pattern of inferWinnerPatterns(sorted)) lines.push(`- ${pattern}`)
  lines.push('', 'Winning post references:')
  sorted.forEach((post, i) => {
    const views = Number(post.view_count || post.views || 0)
    const likes = Number(post.like_count || post.likes || 0)
    const comments = Number(post.comment_count || post.comments || 0)
    const shares = Number(post.share_count || post.shares || 0)
    const rate = engagementRate(post).toFixed(1)
    const text = cleanPostText(post) || '(no caption available)'
    lines.push(`- #${i + 1} ${post.platform || 'post'}: "${text}" (${compactNumber(views)} views, ${compactNumber(likes + comments + shares)} interactions, ${rate}% engagement; shares ${compactNumber(shares)}).`)
  })
  return lines.join('\n')
}

function selectLearningPosts(analytics, postIds) {
  const ids = new Set((Array.isArray(postIds) ? postIds : []).map(String).filter(Boolean).slice(0, 12))
  const candidates = ids.size ? analytics.filter((a) => ids.has(String(a.id))) : analytics
  return [...candidates]
    .filter((a) => scoreResult(a) > 0 || cleanPostText(a))
    .sort((a, b) => scoreResult(b) - scoreResult(a))
    .slice(0, ids.size ? 12 : 5)
}

// DNS-rebinding guard: a malicious website can point its own domain at
// 127.0.0.1 and read API responses from the visitor's browser, bypassing
// same-origin policy. Rejecting unexpected Host headers closes that hole.
const ALLOWED_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', process.env.HOST].filter(Boolean))
app.use((req, res, next) => {
  const host = String(req.headers.host || '').replace(/:\d+$/, '')
  if (!ALLOWED_HOSTS.has(host)) return res.status(403).json({ error: `Forbidden host: ${host}` })
  next()
})

// Wrap async handlers so thrown errors become clean 500 JSON instead of crashes.
const h = (fn) => (req, res) => fn(req, res).catch((e) => {
  console.error(e)
  res.status(500).json({ error: e.message || String(e) })
})

// ── Config ──────────────────────────────────────────────────────────────────
app.get('/api/config', h(async (_req, res) => res.json(getConfig())))
// Global settings only: keys + model. Project data goes through /api/projects.
app.put('/api/config', h(async (req, res) => res.json(saveGlobal(req.body || {}))))

// ── Projects (each = a Brain + default post-bridge accounts) ──────────────────
app.post('/api/projects', h(async (req, res) => res.json(createProject(req.body?.name))))
app.put('/api/projects/:id', h(async (req, res) => res.json(updateProject(req.params.id, req.body || {}))))
app.delete('/api/projects/:id', h(async (req, res) => res.json(deleteProject(req.params.id))))
app.post('/api/projects/:id/activate', h(async (req, res) => res.json(setActiveProject(req.params.id))))

// Validate that the saved keys actually work, so Settings can show a green check.
app.post('/api/config/test', h(async (_req, res) => {
  const { keys } = getConfig()
  const result = { postbridge: false, openrouter: false, azureOpenAI: false, apify: false, errors: {} }
  if (keys.postbridge) {
    try { await listAccounts(keys.postbridge); result.postbridge = true }
    catch (e) { result.errors.postbridge = e.message }
  }
  if (keys.openrouter) {
    try { await validateKey(keys.openrouter); result.openrouter = true }
    catch (e) { result.errors.openrouter = e.message }
  }
  if (keys.azureOpenAI) {
    const { azureOpenAI } = getConfig()
    try { await validateAzureOpenAI({ apiKey: keys.azureOpenAI, endpoint: azureOpenAI.endpoint }); result.azureOpenAI = true }
    catch (e) { result.errors.azureOpenAI = e.message }
  }
  if (keys.apify) {
    try {
      const r = await fetch(`https://api.apify.com/v2/users/me?token=${keys.apify}`)
      if (!r.ok) throw new Error(`invalid key (${r.status})`)
      result.apify = true
    } catch (e) { result.errors.apify = e.message }
  }
  res.json(result)
}))

// Public model catalog for the Settings dropdown.
app.get('/api/models', h(async (_req, res) => res.json(await listModels())))

// ── Queue (generated drafts for the active project, before post-bridge) ───────
app.get('/api/queue', h(async (_req, res) => {
  const project = getActiveProject()
  res.json(getQueue(project.id))
}))

app.post('/api/generate', h(async (req, res) => {
  const slideshows = await generateForActiveProject(req.body || {})
  res.json(slideshows)
}))

app.post('/api/generate/start', h(async (req, res) => {
  const id = newJobId()
  const total = Math.min(Math.max(Math.round(Number(req.body?.count) || 4), 1), 100)
  const job = {
    id,
    status: 'queued',
    phase: 'queued',
    message: 'Queued…',
    done: 0,
    total,
    error: null,
    resultCount: 0,
  }
  generateJobs.set(id, job)
  res.json(publicJob(job))

  void (async () => {
    try {
      updateJob(job, { status: 'running', phase: 'writing', message: 'Starting…' })
      const slideshows = await generateForActiveProject(req.body || {}, (progress) => {
        updateJob(job, {
          status: 'running',
          phase: progress.phase,
          done: progress.done,
          total: progress.total || job.total,
          message: progress.message,
        })
      })
      updateJob(job, {
        status: 'done',
        phase: 'done',
        done: 1,
        total: 1,
        resultCount: slideshows.length,
        message: `Added ${slideshows.length} slideshow${slideshows.length === 1 ? '' : 's'} to Queue`,
      })
    } catch (e) {
      updateJob(job, {
        status: 'error',
        phase: 'error',
        error: e instanceof Error ? e.message : String(e),
        message: e instanceof Error ? e.message : String(e),
      })
    } finally {
      setTimeout(() => generateJobs.delete(id), 10 * 60_000).unref?.()
    }
  })()
}))

app.get('/api/generate/status/:id', h(async (req, res) => {
  const job = generateJobs.get(req.params.id)
  if (!job) return res.status(404).json({ error: 'Generation job not found.' })
  res.json(publicJob(job))
}))

app.post('/api/ai/edit-slide', h(async (req, res) => {
  const { keys, aiProvider, model, azureOpenAI } = getConfig()
  const project = getActiveProject()
  const body = req.body || {}
  const slides = Array.isArray(body.slides) ? body.slides : []
  if (!slides.length) throw new Error('No slides to edit.')
  res.json(await editSlideWithAI({
    aiProvider,
    keys,
    azureOpenAI,
    model,
    brain: project.brain,
    action: String(body.action || 'rewrite'),
    slideIndex: Math.max(0, Math.round(Number(body.slideIndex) || 0)),
    slides,
    caption: String(body.caption || ''),
    hashtags: Array.isArray(body.hashtags) ? body.hashtags.map(String) : [],
  }))
}))

app.delete('/api/queue/:id', h(async (req, res) =>
  res.json(removeFromQueue(getActiveProject().id, req.params.id))
))

// Edit a queued slideshow: caption, hashtags, hook, and/or per-slide text+image.
app.put('/api/queue/:id', h(async (req, res) => {
  const pid = getActiveProject().id
  const patch = req.body || {}
  const allowed = ['slides', 'caption', 'hashtags', 'hook']
  const next = getQueue(pid).map((s) => {
    if (s.id !== req.params.id) return s
    const merged = { ...s }
    for (const k of allowed) if (patch[k] !== undefined) merged[k] = patch[k]
    return merged
  })
  res.json(setQueue(pid, next))
}))

// ── Image library (bundled aesthetic packs + Pinterest scrapes via Apify) ────────
app.get('/api/library', h(async (_req, res) => res.json(listLibrary())))
app.get('/api/library/packs', h(async (_req, res) => res.json(listPacks())))

app.get('/api/library/transcriptions/status', h(async (_req, res) => {
  res.json(transcriptionStatus(!!getActiveProject().aiCreativeControl))
}))

app.post('/api/library/transcriptions/start', h(async (_req, res) => {
  const { keys, aiProvider, model, azureOpenAI } = getConfig()
  res.json(startImageTranscriptionJob({ keys, aiProvider, model, azureOpenAI }))
}))

app.post('/api/library/scrape', h(async (req, res) => {
  const { keys, pinterestActor } = getConfig()
  const { searches, count } = req.body || {}
  res.json(await scrapePinterest({ apiKey: keys.apify, actor: pinterestActor, searches, count }))
}))

app.delete('/api/library/:id', h(async (req, res) => res.json(removeScraped(req.params.id))))

app.get('/api/library/img/:id', h(async (req, res) => {
  const file = getScrapedFile(req.params.id)
  if (!file) return res.status(404).end()
  // dotfiles:'allow' is required — the path lives under ~/.slidesmith, and
  // sendFile blocks dot-segment paths by default (would 404 every scrape).
  res.sendFile(file, { dotfiles: 'allow' })
}))

// ── post-bridge ───────────────────────────────────────────────────────────────
app.get('/api/accounts', h(async (_req, res) => {
  const { keys } = getConfig()
  res.json(await listAccounts(keys.postbridge))
}))

app.get('/api/posts', h(async (_req, res) => {
  const { keys } = getConfig()
  res.json(await listPosts(keys.postbridge))
}))

app.get('/api/results', h(async (_req, res) => {
  const { keys } = getConfig()
  res.json(await listAnalytics(keys.postbridge))
}))

// Pull fresh metrics from the platforms, then hand back the updated analytics.
// post-bridge rate-limits sync (429) — swallow that so the refresh still returns
// whatever's already there.
app.post('/api/results/sync', h(async (_req, res) => {
  const { keys } = getConfig()
  try { await syncAnalytics(keys.postbridge) } catch (e) { console.warn('[results] sync skipped:', e.message) }
  res.json(await listAnalytics(keys.postbridge))
}))

// Build a concise Brain update from selected high-performing analytics.
// Preview first (`apply:false`), then persist into the active project's
// styleMemory when the user confirms.
app.post('/api/results/learn', h(async (req, res) => {
  const { keys } = getConfig()
  const project = getActiveProject()
  const analytics = await listAnalytics(keys.postbridge)
  const winners = selectLearningPosts(analytics, req.body?.postIds)
  if (!winners.length) throw new Error('Pick at least one post with analytics to learn from.')

  const learnedMemory = buildWinnerLearning(winners)
  if (req.body?.apply !== true) {
    return res.json({
      applied: false,
      brain: project.brain,
      learnedMemory,
      sourcePostIds: winners.map((w) => String(w.id)),
    })
  }

  const existing = String(project.brain?.styleMemory || '').trim()
  const brain = {
    ...project.brain,
    styleMemory: existing ? `${existing}\n\n${learnedMemory}` : learnedMemory,
  }
  const nextConfig = updateProject(project.id, { brain })
  res.json({
    applied: true,
    brain: getActiveProject(nextConfig).brain,
    learnedMemory,
    sourcePostIds: winners.map((w) => String(w.id)),
  })
}))

// Schedule a slideshow: upload each rendered slide image to post-bridge, then
// create the post. `slides` are data URLs (PNG) rendered in the browser.
app.post('/api/schedule', h(async (req, res) => {
  const { keys } = getConfig()
  const { id, caption, slides, socialAccounts, scheduledAt, mode } = req.body || {}
  if (!socialAccounts?.length) throw new Error('Pick at least one social account.')
  if (!slides?.length) throw new Error('No slide images to upload.')

  const when = mode === 'schedule' ? (scheduledAt ? `scheduled for ${scheduledAt}` : 'scheduled') : 'draft'
  schedLog.start(`Posting ${id || 'slideshow'} → ${when} · ${socialAccounts.length} account${socialAccounts.length === 1 ? '' : 's'}`)

  // Upload all slides concurrently — post-bridge handles them independently, so
  // there's no reason to wait for each. Results stay in slide order (the index
  // into the array) so the carousel keeps its sequence.
  let done = 0
  const mediaIds = await Promise.all(
    slides.map(async (slide, i) => {
      const buffer = Buffer.from(String(slide).replace(/^data:image\/\w+;base64,/, ''), 'base64')
      const mediaId = await uploadMedia(keys.postbridge, {
        buffer,
        mimeType: 'image/png',
        name: `${id || 'slide'}-${i + 1}.png`,
      })
      schedLog.progress(++done, slides.length, 'slides uploaded')
      return mediaId
    })
  )

  schedLog.step(`creating post on post-bridge…`)
  const post = await createPost(keys.postbridge, {
    caption,
    mediaIds,
    socialAccounts,
    scheduledAt: mode === 'schedule' ? scheduledAt : null,
    isDraft: mode !== 'schedule', // "save as draft" leaves it unprocessed in post-bridge
  })

  if (id) removeFromQueue(getActiveProject().id, id)
  schedLog.ok(`Done — ${mode === 'schedule' ? 'scheduled' : 'saved as draft'}`)
  res.json(post)
}))

// ── Static (production / `npm start`) ─────────────────────────────────────────
const dist = join(__dirname, '..', 'dist')
if (existsSync(dist)) {
  app.use(express.static(dist))
  // SPA fallback: any non-API GET serves index.html. (Express 5 dropped the
  // bare '*' route string, so use a middleware instead of app.get('*').)
  app.use((req, res, next) => {
    if (req.method !== 'GET' || req.path.startsWith('/api/')) return next()
    res.sendFile(join(dist, 'index.html'))
  })
}

app.listen(PORT, HOST, () => {
  console.log(`\n  Slidesmith server → http://localhost:${PORT} (bound to ${HOST})`)
  console.log(`  Config + queue stored in ${CONFIG_DIR}\n`)
})
