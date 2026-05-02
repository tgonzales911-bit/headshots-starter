# [Headshot AI](https://headshots-starter.vercel.app/) — Professional headshots with AI

Headshot AI is an open-source starter for building an AI headshot product. Users upload training photos in the browser; the app bundles them into a ZIP, stores the archive in **Supabase Storage**, and trains a portrait LoRA on **[Fal.ai](https://fal.ai/)** using the [`fal-ai/flux-lora-portrait-trainer`](https://fal.ai/models/fal-ai/flux-lora-portrait-trainer) model.

Fork the code, adjust branding and flows, and ship your own SaaS.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fleap-ai%2Fheadshots-starter%2Ftree%2Fmain&env=FAL_KEY,APP_WEBHOOK_SECRET,DEPLOYMENT_URL&envDescription=Set%20FAL_KEY%20(Fal.ai)%2C%20APP_WEBHOOK_SECRET%20(arbitrary%20shared%20secret%20for%20webhooks)%2C%20and%20DEPLOYMENT_URL%20(public%20origin%20for%20Fal%20callbacks).%20See%20README%20for%20Supabase%2C%20Blob%2C%20and%20optional%20Stripe%20vars.&project-name=headshots-starter-clone&repository-name=headshots-starter-clone&demo-title=AI%20Headshot%20Generator&demo-description=Next.js%20headshot%20starter%20with%20Fal.ai%20training&integration-ids=oac_VqOgBHqhEoFTPzGkPd7L0iH6&external-id=https%3A%2F%2Fgithub.com%2Fleap-ai%2Fheadshots-starter%2Ftree%2Fmain)

[![Headshot AI Demo](/public/new-demo.png)](https://headshots-starter.vercel.app/)

## Important: `DEPLOYMENT_URL`

The app uses **`DEPLOYMENT_URL`** (not `VERCEL_URL`) as the public origin for **Fal.ai webhooks** (e.g. `https://your-app.vercel.app` or an **ngrok** URL in local dev). Preview deployment URLs are rejected by config validation because they are not stable for callbacks.

## How training works (Fal.ai + JSZip)

1. **Browser:** The user selects **4–10 images**. Each file is uploaded to **[Vercel Blob](https://vercel.com/docs/storage/vercel-blob)** via `/api/train-model/image-upload` (public URLs).
2. **API (`POST /api/train-model`):** After auth and optional credit checks, the server **downloads** those URLs, builds a **single ZIP** in memory with **[JSZip](https://stuk.github.io/jszip/)** (`lib/buildTrainingZip.ts`), and uploads it to a **public** Supabase Storage bucket (default name: **`training-datasets`**).
3. **Trainer:** The ZIP URL is submitted as **`images_data_url`** to `fal-ai/flux-lora-portrait-trainer`.
4. **Webhook Orchestration (`/api/fal/pipeline-webhook`):**
   - Stage 1: trainer completes, extract `.safetensors` LoRA URL.
   - Stage 2: generate 4 base portraits using `fal-ai/flux-lora` with LoRA scale `1.0` and your Assistant Chief prompt template.
   - Stage 3: judge node (`fal-ai/gemini-1.5-flash`) selects the best base image for facial clarity and lighting.
   - Stage 4: selected image is upscaled with `fal-ai/clarity-upscaler`.
   - Stage 5: final refinement with `fal-ai/gemini-3-pro-image-preview/edit`, passing `image_urls` as `[Upscaled_Image, Badge_Ref, Patch_Ref, Brass_Ref]`.
5. **Persistence + notify:** Final production URLs are stored in `headshots` (and mirrored to `images` for existing UI), model status is finalized, and optional email notification is sent.

Training sample thumbnails remain in the `samples` table (original Blob URLs).

Apply the Storage migration so the ZIP bucket exists:

- `supabase/migrations/20260429120000_training_datasets_storage_bucket.sql`

Or create a **public** bucket named `training-datasets` (or set `SUPABASE_TRAINING_DATASETS_BUCKET`) with read access suitable for Fal to fetch the ZIP.

## Stack

- **[Fal.ai](https://fal.ai/)** — `fal-ai/flux-lora-portrait-trainer` (queue + webhooks)
- **[Next.js](https://nextjs.org/)** — App Router, API routes
- **[Supabase](https://supabase.com/)** — Database, auth, Storage (training ZIPs)
- **[JSZip](https://www.npmjs.com/package/jszip)** — Build training archives on the server
- **[Vercel Blob](https://vercel.com/docs/storage/vercel-blob)** — Client-side image uploads before zipping
- **[Resend](https://resend.com/)** (optional) — Email when training completes
- **[Shadcn](https://ui.shadcn.com/)** + **[Tailwind CSS](https://tailwindcss.com/)**
- **[Stripe](https://stripe.com/)** (optional) — Credits (1 credit = 1 train)

[![Headshot AI Explainer](/public/new-explainer.png)](https://headshots-starter.vercel.app/)

## Running locally

### 1. Vercel template (optional)

Use the deploy button above to provision a repo and Supabase. Leave **Create sample tables** enabled so migrations run.

That sets up tables such as `credits`, `images`, `models`, and `samples`. Run these migrations as well:

- `20260429120000_training_datasets_storage_bucket.sql`
- `20260429223000_add_headshots_table.sql`
- `20260429224500_add_pipeline_events_table.sql` (if not already applied)
- `20260429230000_models_prompt_options.sql` (stores background/uniform keys for Flux prompt mapping)

### 2. Clone and install

```bash
git clone <your-repo-url>
cd <your-repo>
npm install
```

### 3. Supabase — Magic Link auth

In the Supabase dashboard: **Authentication → Email Templates → Magic Link**, use:

```html
<h2>Magic Link</h2>
<p>Follow this link to login:</p>
<p><a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email">Log In</a></p>
```

Under **Authentication → URL Configuration**, set **Site URL** and **Redirect URLs** (e.g. `http://localhost:3000/**` for local dev).

### 4. Environment variables (`.env.local`)

| Variable | Required | Description |
| -------- | -------- | ----------- |
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Supabase anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Service role (Storage upload, webhooks) |
| `FAL_KEY` | Yes | [Fal.ai API key](https://fal.ai/dashboard) (`Authorization: Key …`) |
| `APP_WEBHOOK_SECRET` | Yes | Shared secret; must match the value appended to Fal webhook URLs |
| `DEPLOYMENT_URL` | Yes | Public origin for webhooks (no `http` prefix optional — code normalizes) |
| `BLOB_READ_WRITE_TOKEN` | Yes | [Vercel Blob](https://vercel.com/docs/storage/vercel-blob) token for client uploads |
| `SUPABASE_TRAINING_DATASETS_BUCKET` | No | Defaults to `training-datasets` |
| `FAL_TRIGGER_PHRASE` | No | LoRA trigger phrase; default `ohwx {type} portrait` from the form |
| `FAL_ASSISTANT_CHIEF_PROMPT_TEMPLATE` | No | Base generation prompt template for the Assistant Chief uniform portrait |
| `FAL_ASSISTANT_CHIEF_BADGE_REF_URL` | Required for final refine | Badge reference image URL |
| `FAL_ASSISTANT_CHIEF_PATCH_REF_URL` | Required for final refine | Patch reference image URL |
| `FAL_ASSISTANT_CHIEF_BRASS_REF_URL` | Required for final refine | Brass reference image URL |
| `FAL_FINAL_REFINEMENT_PROMPT` | No | Final Gemini prompt with explicit mapping of badge, patch, and brass placement |
| `FAL_MODEL_PORTRAIT_TRAINER` | No | Defaults to `fal-ai/flux-lora-portrait-trainer` |
| `FAL_MODEL_BASE_GENERATION` | No | Defaults to `fal-ai/flux-lora` |
| `FAL_MODEL_JUDGE` | No | Defaults to `fal-ai/gemini-1.5-flash` |
| `FAL_MODEL_UPSCALER` | No | Defaults to `fal-ai/clarity-upscaler` |
| `FAL_MODEL_REFINER` | No | Defaults to `fal-ai/gemini-3-pro-image-preview/edit` |
| `RESEND_API_KEY` | No | Email on training complete |
| `NEXT_PUBLIC_STRIPE_IS_ENABLED` | No | `true` to enable credits UI + billing |
| Stripe keys / price IDs | No | See Stripe section below |

**Local webhooks:** Use **ngrok** (or similar) and set `DEPLOYMENT_URL` to your tunnel origin so Fal can reach `/api/fal/pipeline-webhook`.

### 5. Announcement bar (optional)

```text
NEXT_PUBLIC_ANNOUNCEMENT_ENABLED=true
NEXT_PUBLIC_ANNOUNCEMENT_MESSAGE="Your message here"
```

### 6. Vercel Blob

Create a Blob store in the Vercel project and add **`BLOB_READ_WRITE_TOKEN`** to the environment.

### 7. Resend (optional)

Set **`RESEND_API_KEY`** to notify users when training finishes.

### 8. Stripe (optional)

One credit = one training run.

- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, price IDs, etc.
- Webhook endpoint: `{your-origin}/stripe/subscription-webhook` for `checkout.session.completed`
- Set `NEXT_PUBLIC_STRIPE_IS_ENABLED=true`

See `components/stripe/StripeTable.tsx` and product setup notes in earlier commits if you use the bundled pricing table.

### 9. Dev server

```bash
npm run dev
```

Open `http://localhost:3000`. Train a model from **Overview → Train model** (`/overview/models/train`).

## Fal.ai reference

- Model: [flux-lora-portrait-trainer](https://fal.ai/models/fal-ai/flux-lora-portrait-trainer/api)
- Queue: `POST https://queue.fal.run/fal-ai/flux-lora-portrait-trainer` with `Authorization: Key $FAL_KEY`
- Webhooks: [Fal webhook docs](https://docs.fal.ai/model-endpoints/queue#webhooks) (`fal_webhook` query parameter)
- Pipeline code: `lib/falPipeline.ts`

## How to get good training data

[![Good results Demo](/public/good_results.png)](https://blog.tryleap.ai/create-an-ai-headshot-generator-fine-tune-stable-diffusion-with-leap-api/#step-1-gather-your-image-samples-%F0%9F%93%B8)

- Prefer **close-ups**, face centered.
- **One person** per image.
- Avoid hats, heavy sunglasses, or obscured faces.
- Consistent **aspect ratios** in your set help (e.g. square crops).

[![Avoid multiple faces](/public/multiple_faces.png)](https://blog.tryleap.ai/create-an-ai-headshot-generator-fine-tune-stable-diffusion-with-leap-api/#how-to-avoid-multiple-faces-in-results-%E2%9D%8C)

More detail: [Leap blog — gathering samples](https://blog.tryleap.ai/create-an-ai-headshot-generator-fine-tune-stable-diffusion-with-leap-api/#step-1-gather-your-image-samples-%F0%9F%93%B8).

## Extending the app

- Add additional variants or prompt branches by extending `handleFalPipeline()` stage logic in `lib/falPipeline.ts`.
- Swap any stage model by changing `FAL_MODEL_*` env vars.

## Contributors

<a href="https://github.com/leap-ai/headshots-starter/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=leap-ai/headshots-starter" />
</a>

## Contributing

Issues and PRs are welcome. Use a feature branch and open a PR targeting the main integration branch your maintainers use (often `dev`).

## License

[MIT License](https://choosealicense.com/licenses/mit/).
