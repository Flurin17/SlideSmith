# Slidesmith

Generate on-brand TikTok/Instagram **carousel slideshows** with an AI model, then schedule and post them to your connected accounts — all from a clean local dashboard you run yourself.

Slidesmith is **bring-your-own-keys** and **local-first**. There's no SaaS, no sign-up, and no database to set up. It runs on your machine, stores its config in a single file in your home directory, and uses [post-bridge](https://post-bridge.com?atp=clip-factory) to handle the hard parts (media hosting, multi-platform scheduling/posting, and analytics).

---

## How it works

```
You ──▶ Brain (niche, audience, style)
          │
          ▼
   AI generates slideshows ──────▶ Queue (review / approve)
                                      │
                                      ▼
                       Slides rendered to images in the browser
                                      │
                                      ▼
                    post-bridge ──▶ schedules + posts to TikTok / IG / …
                                      │
                                      ▼
                              Results (live analytics)
```

- **Generation** is done by an AI model via **OpenRouter** or **Azure OpenAI v1** — pick a provider in Settings.
- **Slide images** are rendered locally in your browser (text over a gradient *or* a background image from the Library) — no image-gen API, no cost.
- **Backgrounds** come from a bundled **image library** of curated aesthetic packs. Want more? Scrape Pinterest with your own **Apify** key (optional).
- **Scheduling, posting, and analytics** are handled by **post-bridge** (your post-bridge key). That also means **no posting integrations to build and no storage to host.**

## What you need

API keys are entered in the in-app **Settings** screen:

| Key | What it's for | Where to get it |
| --- | --- | --- |
| **OpenRouter** | Runs the AI that writes the slideshows (any model) | [openrouter.ai/keys](https://openrouter.ai/keys) |
| **Azure OpenAI** *(alternative to OpenRouter)* | Runs generation through an Azure OpenAI v1 endpoint | Azure AI Foundry / Azure portal |
| **post-bridge** | Scheduling, posting & analytics | [post-bridge.com](https://post-bridge.com?atp=clip-factory) |
| **Apify** *(optional)* | Scrape extra Pinterest images into the Library | [console.apify.com](https://console.apify.com) |

Connect your social accounts inside post-bridge — they'll show up in Slidesmith automatically.

## Quick start

```bash
git clone <this-repo>
cd slidesmith
npm install
npm run dev
```

Then open the printed Vite URL (default http://localhost:5173). On first run you'll land on **Settings** — choose OpenRouter or Azure OpenAI for generation, paste your keys, hit **Test connection**, and you're set.

`npm run dev` starts two things together:
- the **web UI** (Vite, port 5173)
- the **local server** (Node/Express, port 8787) that holds your keys and talks to your AI provider + post-bridge

### Production / single-process

```bash
npm run build   # build the UI
npm start       # serves the UI + API from one Node process (port 8787)
```

## Using it

1. **Projects** — each project is one brand/account, with its own Brain and default posting accounts. Switch/create them from the top-left. (Your keys and chosen model are shared across all projects.)
2. **Brain** — tell the AI who this project is: niche, app/brand, audience, and style memory. This shapes every generation.
3. **Background packs** (Settings) — pick which image packs this project draws from. *Generate* then auto-applies a background to every slide. Select none for plain gradients.
4. **Queue** — hit *Generate* and the AI writes a batch of slideshows, already wearing backgrounds. Hit **Edit** on any card to preview the carousel and tweak the caption, hashtags, per-slide text, and per-slide background.
5. **Library** — browse the bundled aesthetic packs, or scrape more images from any Pinterest search with your Apify key.
6. **Approve** — pick which connected accounts to post to and either schedule a time or save as a draft in post-bridge. Slidesmith renders each slide to an image and hands it to post-bridge.
7. **Schedule / Results** — track what's queued and how published posts are performing, straight from post-bridge.

### A note on the bundled images

Slidesmith ships with ~140 curated background images organized into aesthetic packs (`public/library/`). They were collected from the web to get you started and may be subject to third-party copyright — they are not licensed stock. Swap in your own via the Library (scrape Pinterest with your own Apify key) if you need images you have the rights to.

## Where your data lives

- **API keys + Brain + settings:** `~/.slidesmith/config.json`
- **Generated-but-not-yet-scheduled drafts:** `~/.slidesmith/queue.json`
- **Scraped library images:** `~/.slidesmith/library/` (bundled packs live in the repo at `public/library/`)
- **Everything else** (media, scheduled posts, results) lives in your post-bridge account.

Your keys never leave your machine except to reach the services they belong to (OpenRouter or Azure OpenAI, post-bridge, and optionally Apify). The Settings UI reads them from your local server, but browser requests to third-party services are not made directly.

You can override the storage location with `SLIDESMITH_DIR` and the server port with `PORT` (see `.env.example`).

## Tech

React 19 + Vite + Tailwind (UI), a small Express server (keys + AI provider + post-bridge proxy), OpenRouter or Azure OpenAI v1 for generation, and the post-bridge API. No database.

## License

[PolyForm Noncommercial 1.0.0](./LICENSE) — free to use, modify, self-host, and share for any **noncommercial** purpose. Commercial use (including reselling, hosting it as a paid service, or bundling it into a product you charge for) is not permitted without separate permission from the author.
