export type ViewKey = 'queue' | 'slideshows' | 'library' | 'schedule' | 'results' | 'brain' | 'settings';

export type LinkStickerPosition =
  | 'top-left'
  | 'top-right'
  | 'bottom-left'
  | 'bottom-right'
  | 'upper-center'
  | 'lower-center';

export type LinkStickerStyle = 'instagram' | 'tiktok';
export type BrandFontStyle = 'bold' | 'editorial' | 'compact';

export interface LinkSticker {
  text: string;
  position: LinkStickerPosition;
  style: LinkStickerStyle;
}

export interface Slide {
  id: string;
  text: string;
  // Generated slides have no source image — they're rendered from text over a
  // gradient. `imageUrl` is kept optional for backwards-compat / future use.
  imageUrl?: string;
  bgFrom?: string;
  bgTo?: string;
  linkSticker?: LinkSticker;
  fontStyle?: BrandFontStyle;
}

export interface Slideshow {
  id: string;
  hook: string;
  caption: string;
  hashtags: string[];
  slides: Slide[];
  createdAt: string;
  rationale: string;
  generationContext?: {
    direction?: string;
    pillarName?: string;
    presetName?: string;
  };
  libraryStatus?: 'queued' | 'scheduled' | 'draft' | 'rejected';
  updatedAt?: string;
  postBridgePostIds?: string[];
  scheduledAt?: string | null;
  publishedCaption?: string;
}

export interface ScheduledSlideAttribution {
  id: string;
  text: string;
  imageUrl?: string;
  bgFrom?: string;
  bgTo?: string;
  linkSticker?: LinkSticker;
  fontStyle?: BrandFontStyle;
  mediaId?: string;
}

export interface SlideshowAttribution {
  id: string;
  projectId: string;
  slideshowId: string;
  postBridgePostId: string;
  postBridgeMediaIds: string[];
  socialAccounts: number[];
  mode: 'draft' | 'schedule';
  scheduledAt: string | null;
  createdAt: string;
  publishedCaption: string;
  hook: string;
  caption: string;
  hashtags: string[];
  rationale: string;
  generationContext?: Slideshow['generationContext'];
  slides: ScheduledSlideAttribution[];
}

export interface BrainState {
  niche: string;
  appName: string;
  appDescription: string;
  audience: string;
  linkUrl: string;
  contentPillars: string[];
  styleMemory: string;
}

export interface ProjectDefaults {
  socialAccountIds: number[];
  mode: 'draft' | 'schedule';
}

export interface BrandKit {
  primaryColor: string;
  accentColor: string;
  backgroundColor: string;
  textColor: string;
  overlayOpacity: number;
  logoDataUrl: string;
  logoPosition: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  fontStyle: BrandFontStyle;
}

export interface GenerationPreset {
  id: string;
  name: string;
  direction: string;
}

export type QueueFeedbackAction = 'more-like-this' | 'too-generic' | 'save-as-template';

export interface Project {
  id: string;
  name: string;
  brain: BrainState;
  defaults: ProjectDefaults;
  imagePacks: string[]; // background packs generation draws from ([] = gradients only)
  brandKit: BrandKit;
  generationPresets: GenerationPreset[];
  aiCreativeControl: boolean;
}

export interface AppConfig {
  keys: { postbridge: string; openrouter: string; azureOpenAI: string; apify: string };
  aiProvider: 'openrouter' | 'azure-openai';
  model: string;
  azureOpenAI: { endpoint: string };
  pinterestActor: string;
  projects: Project[];
  activeProjectId: string;
}

export interface LibraryImage {
  id: string;
  url: string;
  pack: string;
  source: 'bundled' | 'scraped';
  description?: string;
}

export interface LibraryPack {
  name: string;
  source: 'bundled' | 'scraped';
  count: number;
  covers: string[];
}

export interface ModelOption {
  id: string;
  name: string;
}

export interface SocialAccount {
  id: number;
  platform: string;
  username: string;
}

// Shapes returned by post-bridge (mapped in lib/api.ts).
export interface ScheduledPost {
  id: string;
  caption: string;
  status: string; // scheduled | processing | posted | draft
  scheduledAt: string | null;
  mediaUrls: string[];
  socialAccounts: number[];
  isDraft: boolean;
  attribution?: SlideshowAttribution;
}

export interface PostResult {
  id: string;
  platform: string;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  coverImageUrl: string | null;
  shareUrl: string | null;
  description: string | null;
  lastSyncedAt: string | null;
  attribution?: SlideshowAttribution;
}

export interface LearnFromWinnersResponse {
  applied: boolean;
  brain: BrainState;
  learnedMemory: string;
  sourcePostIds: string[];
}

export interface WebsiteDescriptionResponse {
  url: string;
  appName: string;
  appDescription: string;
  audience: string;
  niche: string;
}

export interface ImageTranscriptionStatus {
  enabled: boolean;
  running: boolean;
  total: number;
  described: number;
  pending: number;
  done: number;
  failed: number;
  lastError: string | null;
  startedAt: string | null;
  finishedAt: string | null;
}

export interface GenerationProgressStatus {
  id: string;
  status: 'queued' | 'running' | 'done' | 'error';
  phase: 'queued' | 'writing' | 'backgrounds' | 'saving' | 'done' | 'error';
  message: string;
  done: number;
  total: number;
  percent: number;
  error: string | null;
  resultCount: number;
}
