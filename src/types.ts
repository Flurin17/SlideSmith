export type ViewKey = 'queue' | 'library' | 'schedule' | 'results' | 'brain' | 'settings';

export type LinkStickerPosition =
  | 'top-left'
  | 'top-right'
  | 'bottom-left'
  | 'bottom-right'
  | 'upper-center'
  | 'lower-center';

export type LinkStickerStyle = 'instagram' | 'tiktok';

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
}

export interface Slideshow {
  id: string;
  hook: string;
  caption: string;
  hashtags: string[];
  slides: Slide[];
  createdAt: string;
  rationale: string;
}

export interface BrainState {
  niche: string;
  appName: string;
  appDescription: string;
  audience: string;
  linkUrl: string;
  styleMemory: string;
}

export interface ProjectDefaults {
  socialAccountIds: number[];
  mode: 'draft' | 'schedule';
}

export interface Project {
  id: string;
  name: string;
  brain: BrainState;
  defaults: ProjectDefaults;
  imagePacks: string[]; // background packs generation draws from ([] = gradients only)
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
}
