// Local, file-based persistence. Slidesmith is a single-user tool, so all state
// lives in a small JSON config file + a queue file under the user's home dir.
// No database — post-bridge holds the scheduled posts and results.
//
// A "project" is one brand/account you generate for. Only the Brain and the
// default post-bridge accounts differ per project; the API keys and model are
// global. The queue (generated-but-unscheduled drafts) is per project.
import { homedir } from 'node:os'
import { join } from 'node:path'
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { bundledPackNames } from './library.js'

const DIR = process.env.SLIDESMITH_DIR || join(homedir(), '.slidesmith')
const CONFIG_PATH = join(DIR, 'config.json')
const QUEUE_PATH = join(DIR, 'queue.json')
const ATTRIBUTIONS_PATH = join(DIR, 'attributions.json')
const SLIDESHOWS_PATH = join(DIR, 'slideshows.json')

const DEFAULT_BRAIN = {
  niche: '',
  appName: '',
  appDescription: '',
  audience: '',
  linkUrl: '',
  contentPillars: [],
  styleMemory: '',
}
const DEFAULT_DEFAULTS = { socialAccountIds: [], mode: 'draft' }
const DEFAULT_BRAND_KIT = {
  primaryColor: '#0a0a0a',
  accentColor: '#f97316',
  backgroundColor: '#111827',
  textColor: '#ffffff',
  overlayOpacity: 0.45,
  logoDataUrl: '',
  logoPosition: 'bottom-right',
  fontStyle: 'bold',
}
const DEFAULT_GENERATION_PRESETS = [
  {
    id: 'preset-contrarian',
    name: 'Contrarian take',
    direction: 'Challenge a common belief in this niche, then give a sharper replacement rule with concrete examples.',
  },
  {
    id: 'preset-beginner',
    name: 'Beginner-friendly',
    direction: 'Explain one useful idea for a smart beginner with simple steps, zero jargon, and a clear payoff.',
  },
  {
    id: 'preset-founder-pov',
    name: 'Founder POV',
    direction: 'Write from a first-person operator perspective with a lesson, mistake, or behind-the-scenes decision.',
  },
]

function ensureDir() {
  if (!existsSync(DIR)) mkdirSync(DIR, { recursive: true })
}
function readJson(path, fallback) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch {
    return fallback
  }
}
function writeJson(path, value) {
  ensureDir()
  writeFileSync(path, JSON.stringify(value, null, 2))
}
function newId(prefix) {
  return `${prefix}-${Date.now()}-${Math.round(Math.random() * 1e6)}`
}
function cleanText(value, max = 500) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max)
}
function normalizeGenerationPresets(value) {
  const source = Array.isArray(value) ? value : DEFAULT_GENERATION_PRESETS
  return source
    .map((preset, i) => ({
      id: cleanText(preset?.id, 80) || `preset-${i + 1}`,
      name: cleanText(preset?.name, 80),
      direction: cleanText(preset?.direction, 700),
    }))
    .filter((preset) => preset.name || preset.direction)
}
function makeProject(name, brain, defaults, imagePacks) {
  return {
    id: newId('p'),
    name: name || 'Project 1',
    brain: { ...DEFAULT_BRAIN, ...brain },
    defaults: { ...DEFAULT_DEFAULTS, ...defaults },
    // Which background packs generation draws from. Defaults to all bundled
    // packs so a fresh project generates with images out of the box. Empty = gradients.
    imagePacks: imagePacks ?? bundledPackNames(),
    brandKit: { ...DEFAULT_BRAND_KIT },
    generationPresets: normalizeGenerationPresets(),
    aiCreativeControl: false,
  }
}

// Normalize on every read: fill defaults and migrate the old single-brain shape
// ({ brain, defaults } at top level) into projects[].
export function getConfig() {
  const s = readJson(CONFIG_PATH, {})
  let projects = Array.isArray(s.projects) && s.projects.length
    ? s.projects.map((p) => ({
        id: p.id || newId('p'),
        name: p.name || 'Project',
        brain: { ...DEFAULT_BRAIN, ...p.brain },
        defaults: { ...DEFAULT_DEFAULTS, ...p.defaults },
        imagePacks: p.imagePacks ?? bundledPackNames(),
        brandKit: { ...DEFAULT_BRAND_KIT, ...p.brandKit },
        generationPresets: normalizeGenerationPresets(p.generationPresets),
        aiCreativeControl: !!p.aiCreativeControl,
      }))
    : null

  if (!projects) {
    // Migrate a pre-projects config, or create the first project.
    const p = makeProject(s.brain?.appName || 'Project 1', s.brain, s.defaults)
    projects = [p]
  }

  const activeProjectId = projects.some((p) => p.id === s.activeProjectId)
    ? s.activeProjectId
    : projects[0].id

  const cfg = {
    keys: { postbridge: '', openrouter: '', azureOpenAI: '', apify: '', ...s.keys },
    aiProvider: s.aiProvider || 'openrouter',
    model: s.model || 'openai/gpt-4o-mini',
    azureOpenAI: { endpoint: '', ...s.azureOpenAI },
    pinterestActor: s.pinterestActor || 'fatihtahta/pinterest-scraper-search',
    projects,
    activeProjectId,
  }

  // If we had to synthesize/migrate projects (no valid persisted projects array,
  // or the active id was stale), write it back once so project ids are stable
  // across subsequent reads. Otherwise every read would mint fresh ids.
  const needsPersist =
    !Array.isArray(s.projects) ||
    s.projects.length !== projects.length ||
    s.activeProjectId !== activeProjectId ||
    s.projects.some((p, i) =>
      p.id !== projects[i].id ||
      !Array.isArray(p.generationPresets) ||
      p.aiCreativeControl === undefined
    )
  if (needsPersist) writeJson(CONFIG_PATH, cfg)

  return cfg
}

function writeConfig(cfg) {
  writeJson(CONFIG_PATH, cfg)
  return cfg
}

// Global settings only (keys + model). Project data is edited via the project ops.
export function saveGlobal(patch) {
  const c = getConfig()
  return writeConfig({
    ...c,
    aiProvider: patch.aiProvider ?? c.aiProvider,
    model: patch.model ?? c.model,
    azureOpenAI: { ...c.azureOpenAI, ...patch.azureOpenAI },
    pinterestActor: patch.pinterestActor ?? c.pinterestActor,
    keys: { ...c.keys, ...patch.keys },
  })
}

export function getActiveProject(c = getConfig()) {
  return c.projects.find((p) => p.id === c.activeProjectId) || c.projects[0]
}

export function createProject(name) {
  const c = getConfig()
  const project = makeProject(name || `Project ${c.projects.length + 1}`)
  return writeConfig({ ...c, projects: [...c.projects, project], activeProjectId: project.id })
}

export function updateProject(id, patch) {
  const c = getConfig()
  const projects = c.projects.map((p) =>
    p.id === id
      ? {
          ...p,
          name: patch.name ?? p.name,
          brain: patch.brain ? { ...p.brain, ...patch.brain } : p.brain,
          defaults: patch.defaults ? { ...p.defaults, ...patch.defaults } : p.defaults,
          imagePacks: patch.imagePacks ?? p.imagePacks,
          brandKit: patch.brandKit ? { ...p.brandKit, ...patch.brandKit } : p.brandKit,
          generationPresets: patch.generationPresets !== undefined ? normalizeGenerationPresets(patch.generationPresets) : p.generationPresets,
          aiCreativeControl: patch.aiCreativeControl !== undefined ? !!patch.aiCreativeControl : p.aiCreativeControl,
        }
      : p
  )
  return writeConfig({ ...c, projects })
}

export function deleteProject(id) {
  const c = getConfig()
  let projects = c.projects.filter((p) => p.id !== id)
  if (!projects.length) projects = [makeProject('Project 1')]
  const activeProjectId = c.activeProjectId === id ? projects[0].id : c.activeProjectId
  removeQueueFor(id)
  return writeConfig({ ...c, projects, activeProjectId })
}

export function setActiveProject(id) {
  const c = getConfig()
  if (!c.projects.some((p) => p.id === id)) throw new Error('Unknown project')
  return writeConfig({ ...c, activeProjectId: id })
}

// ── Queue (per project) ───────────────────────────────────────────────────────
function readQueueMap() {
  const m = readJson(QUEUE_PATH, {})
  return m && !Array.isArray(m) ? m : {}
}
function writeQueueMap(m) {
  writeJson(QUEUE_PATH, m)
  return m
}
export function getQueue(projectId) {
  return readQueueMap()[projectId] || []
}
export function setQueue(projectId, items) {
  const m = readQueueMap()
  m[projectId] = items
  writeQueueMap(m)
  return items
}
export function addToQueue(projectId, items) {
  return setQueue(projectId, [...items, ...getQueue(projectId)])
}
export function removeFromQueue(projectId, id) {
  return setQueue(projectId, getQueue(projectId).filter((s) => s.id !== id))
}
function removeQueueFor(projectId) {
  const m = readQueueMap()
  delete m[projectId]
  writeQueueMap(m)
}

// ── Attribution ledger (post-bridge post → source slideshow) ────────────────
function readAttributionMap() {
  const m = readJson(ATTRIBUTIONS_PATH, {})
  return m && typeof m === 'object' && !Array.isArray(m) ? m : {}
}
function writeAttributionMap(m) {
  writeJson(ATTRIBUTIONS_PATH, m)
  return m
}
function cleanArray(value) {
  return Array.isArray(value) ? value.map((v) => String(v || '').trim()).filter(Boolean) : []
}
function cleanGenerationContext(value) {
  if (!value || typeof value !== 'object') return undefined
  const out = {
    ...(value.direction ? { direction: cleanText(value.direction, 500) } : {}),
    ...(value.pillarName ? { pillarName: cleanText(value.pillarName, 240) } : {}),
    ...(value.presetName ? { presetName: cleanText(value.presetName, 240) } : {}),
  }
  return Object.keys(out).length ? out : undefined
}
function snapshotSlide(slide, mediaId, index) {
  return {
    id: String(slide?.id || `slide-${index + 1}`),
    text: cleanText(slide?.text, 220),
    ...(slide?.imageUrl ? { imageUrl: String(slide.imageUrl).slice(0, 1200) } : {}),
    ...(slide?.bgFrom ? { bgFrom: String(slide.bgFrom).slice(0, 16) } : {}),
    ...(slide?.bgTo ? { bgTo: String(slide.bgTo).slice(0, 16) } : {}),
    ...(slide?.fontStyle ? { fontStyle: String(slide.fontStyle).slice(0, 40) } : {}),
    ...(slide?.linkSticker?.text
      ? {
          linkSticker: {
            text: cleanText(slide.linkSticker.text, 80),
            position: cleanText(slide.linkSticker.position, 40),
            style: cleanText(slide.linkSticker.style, 40),
          },
        }
      : {}),
    ...(mediaId ? { mediaId: String(mediaId) } : {}),
  }
}

// ── Slideshow library (all generated source carousels, per project) ──────────
function readSlideshowMap() {
  const m = readJson(SLIDESHOWS_PATH, {})
  return m && typeof m === 'object' && !Array.isArray(m) ? m : {}
}
function writeSlideshowMap(m) {
  writeJson(SLIDESHOWS_PATH, m)
  return m
}
function snapshotSlideshow(slideshow, existing = {}, patch = {}) {
  const now = new Date().toISOString()
  const postBridgePostIds = Array.from(new Set([
    ...cleanArray(existing.postBridgePostIds),
    ...cleanArray(patch.postBridgePostIds),
  ]))
  const next = {
    id: String(slideshow?.id || existing.id || ''),
    hook: cleanText(slideshow?.hook ?? existing.hook, 220),
    caption: cleanText(slideshow?.caption ?? existing.caption, 2200),
    hashtags: cleanArray(slideshow?.hashtags ?? existing.hashtags),
    slides: Array.isArray(slideshow?.slides ?? existing.slides)
      ? (slideshow?.slides ?? existing.slides).slice(0, 35).map((slide, i) => snapshotSlide(slide, slide.mediaId, i))
      : [],
    createdAt: slideshow?.createdAt || existing.createdAt || now,
    rationale: cleanText(slideshow?.rationale ?? existing.rationale, 600),
    ...(cleanGenerationContext(slideshow?.generationContext ?? existing.generationContext)
      ? { generationContext: cleanGenerationContext(slideshow?.generationContext ?? existing.generationContext) }
      : {}),
    libraryStatus: patch.libraryStatus || existing.libraryStatus || 'queued',
    updatedAt: now,
    ...(postBridgePostIds.length ? { postBridgePostIds } : {}),
    ...(patch.scheduledAt !== undefined ? { scheduledAt: patch.scheduledAt } : existing.scheduledAt ? { scheduledAt: existing.scheduledAt } : {}),
    ...(patch.publishedCaption || existing.publishedCaption
      ? { publishedCaption: cleanText(patch.publishedCaption || existing.publishedCaption, 2200) }
      : {}),
  }
  return next
}
export function getSlideshowLibrary(projectId) {
  return readSlideshowMap()[projectId] || []
}
export function upsertSlideshowLibrary(projectId, slideshows, patch = {}) {
  const m = readSlideshowMap()
  const current = m[projectId] || []
  const byId = new Map(current.map((item) => [item.id, item]))
  const incoming = (Array.isArray(slideshows) ? slideshows : [slideshows]).filter((item) => item?.id)
  const incomingIds = new Set(incoming.map((item) => item.id))
  const updates = incoming.map((item) => snapshotSlideshow(item, byId.get(item.id), patch))
  const existingUpdates = new Map(updates.filter((item) => byId.has(item.id)).map((item) => [item.id, item]))
  const newUpdates = updates.filter((item) => !byId.has(item.id))
  m[projectId] = [
    ...newUpdates,
    ...current.map((item) => existingUpdates.get(item.id) || item),
  ].filter((item, index, list) => item?.id && list.findIndex((other) => other.id === item.id) === index)
  writeSlideshowMap(m)
  return m[projectId].filter((item) => !incomingIds.size || item)
}
export function updateSlideshowLibrary(projectId, id, patch = {}) {
  const m = readSlideshowMap()
  const current = m[projectId] || []
  m[projectId] = current.map((item) =>
    item.id === id
      ? snapshotSlideshow({ ...item, ...patch }, item, {
          libraryStatus: patch.libraryStatus || item.libraryStatus,
          scheduledAt: patch.scheduledAt !== undefined ? patch.scheduledAt : item.scheduledAt,
          postBridgePostIds: patch.postBridgePostIds,
          publishedCaption: patch.publishedCaption,
        })
      : item
  )
  writeSlideshowMap(m)
  return m[projectId]
}
export function markSlideshowLibraryStatus(projectId, id, patch = {}) {
  const m = readSlideshowMap()
  const current = m[projectId] || []
  m[projectId] = current.map((item) =>
    item.id === id
      ? {
          ...item,
          ...patch,
          postBridgePostIds: Array.from(new Set([...cleanArray(item.postBridgePostIds), ...cleanArray(patch.postBridgePostIds)])),
          updatedAt: new Date().toISOString(),
        }
      : item
  )
  writeSlideshowMap(m)
  return m[projectId]
}

export function saveAttribution(record) {
  const postBridgePostId = String(record?.postBridgePostId || '').trim()
  if (!postBridgePostId) return null
  const slideshow = record.slideshow || {}
  const mediaIds = cleanArray(record.mediaIds)
  const entry = {
    id: `attr-${Date.now()}-${Math.round(Math.random() * 1e6)}`,
    projectId: String(record.projectId || ''),
    slideshowId: String(record.slideshowId || slideshow.id || ''),
    postBridgePostId,
    postBridgeMediaIds: mediaIds,
    socialAccounts: Array.isArray(record.socialAccounts) ? record.socialAccounts.map(Number).filter(Number.isFinite) : [],
    mode: record.mode === 'schedule' ? 'schedule' : 'draft',
    scheduledAt: record.scheduledAt || null,
    createdAt: new Date().toISOString(),
    publishedCaption: cleanText(record.caption, 2200),
    hook: cleanText(slideshow.hook, 220),
    caption: cleanText(slideshow.caption, 2200),
    hashtags: cleanArray(slideshow.hashtags),
    rationale: cleanText(slideshow.rationale, 600),
    generationContext: cleanGenerationContext(slideshow.generationContext),
    slides: Array.isArray(slideshow.slides)
      ? slideshow.slides.slice(0, 35).map((slide, i) => snapshotSlide(slide, mediaIds[i], i))
      : [],
  }
  if (!entry.generationContext || !Object.keys(entry.generationContext).length) delete entry.generationContext
  const m = readAttributionMap()
  m[postBridgePostId] = entry
  writeAttributionMap(m)
  if (entry.projectId && entry.slideshowId) {
    markSlideshowLibraryStatus(entry.projectId, entry.slideshowId, {
      libraryStatus: entry.mode === 'schedule' ? 'scheduled' : 'draft',
      scheduledAt: entry.scheduledAt,
      postBridgePostIds: [postBridgePostId],
      publishedCaption: entry.publishedCaption,
    })
  }
  return entry
}
export function getAttribution(postBridgePostId) {
  return readAttributionMap()[String(postBridgePostId || '')] || null
}
export function listAttributions(projectId) {
  const records = Object.values(readAttributionMap())
  return projectId ? records.filter((record) => record.projectId === projectId) : records
}

export const CONFIG_DIR = DIR
