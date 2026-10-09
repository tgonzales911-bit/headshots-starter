# BadgeShot

BadgeShot makes AI Class A dress-uniform portraits for the fire service, using the
customer's own photos of their real badge, shoulder patch and collar brass. Every order
is checked by a person before it is delivered.

This repository is the **order app**. The public marketing site is separate and lives at
<https://badgeshot.com>; its "Get Your BadgeShot" buttons link to this app's root URL, so
`/` here is the order start page, not a second marketing site.

## What a customer does

1. Lands on `/`, reads what to have ready, and signs in with an emailed link (no password).
2. Uploads photos of their face plus one photo each of their badge, shoulder patch and
   collar brass (Class A jacket optional), and chooses a backdrop.
3. Pays once through Stripe checkout.
4. Follows the order on `/overview`. When the portraits pass the final check they are
   emailed and available to download, with print-ready exports.

Customer-facing facts (price label, portraits per order, delivery promise, order stages,
backdrops, support address) are defined once in `lib/site.ts`. Change them there, never in
page copy.

## Stack

| Layer | Service |
| --- | --- |
| Web app | Next.js 14 (app router), Tailwind CSS, shadcn/ui, deployed on Vercel |
| Auth, database, storage | Supabase (passwordless email sign-in, Postgres, storage buckets) |
| Image pipeline | fal.ai (face model training, portrait generation, insignia edits) |
| Automated judging | Google Gemini |
| Payment | Stripe checkout |
| Email | Resend |

## Where things live

| Path | What it is |
| --- | --- |
| `lib/site.ts` | Single source of truth for customer-facing facts and status wording |
| `lib/falPipeline.ts` | The portrait pipeline: training, generation, insignia, delivery |
| `app/api/fal/pipeline-webhook/route.ts` | Webhook fal.ai calls as each pipeline stage finishes |
| `lib/judgeNode.ts` | Gemini judge that scores candidates before the human check |
| `app/admin/ops` | Operator dashboard at `/admin/ops` (restricted to `ADMIN_EMAIL` by `middleware.ts`) |
| `app/page.tsx`, `components/homepage/` | Order start page |
| `app/login/` | Passwordless sign-in |
| `app/overview/` | The customer's orders, upload form and results |
| `app/api/stripe/` | Checkout creation, payment verification and Stripe webhook |
| `lib/examples.ts` | Approved real portraits for the start-page gallery (empty until there are some) |
| `supabase/migrations/` | Database schema |
| `public/brand/` | Shield logo, social image and touch icon |

## Design

The app is dark-only. All colour comes from CSS variables in `app/globals.css`, exposed
as Tailwind tokens in `tailwind.config.ts`: one navy scale (`navy-950` to `navy-500`),
one gold (`gold`, `gold-bright`), body text (`steel`, `steel-dim`). Text on gold is always
`navy-950`. Do not add hex colours to components.

Fonts are bundled in `app/fonts/` (Marcellus for headings, Public Sans for text, both
under the SIL Open Font License) and loaded with `next/font/local`.

## Running locally

```bash
npm install
npm run dev
```

Create `.env.local` with the variables below. `npx tsc --noEmit -p .` typechecks the project.

## Environment variables

Names only. Values live in Vercel and in your local `.env.local`; never commit them.
Variables starting with `NEXT_PUBLIC_` are sent to the browser; all others are server-only.

### Core

| Name | Used for |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase public (anon) key for the browser client |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key for server routes and the pipeline |
| `SUPABASE_TRAINING_DATASETS_BUCKET` | Storage bucket that holds uploaded photos and composites |
| `DEPLOYMENT_URL` | Public URL of this app; used for webhooks, links in email and page metadata. Must not be a Vercel preview URL |
| `NEXT_PUBLIC_VERCEL_URL` | Fallback base URL on the operator dashboard |
| `ADMIN_EMAIL` | The one account allowed into `/admin/ops` |
| `CRON_SECRET` | Authorises the scheduled sweep at `/api/admin/ops/sweep` (see `vercel.json`) |
| `APP_WEBHOOK_SECRET` | Shared secret that authenticates pipeline webhook calls |

### fal.ai pipeline

| Name | Used for |
| --- | --- |
| `FAL_KEY` | fal.ai API key |
| `FAL_TRIGGER_PHRASE` | Trigger phrase for the trained face model |
| `FAL_MODEL_PORTRAIT_TRAINER` | Override: face training model |
| `FAL_MODEL_BASE_GENERATION` | Override: portrait generation model |
| `FAL_MODEL_GEMINI_EDIT` | Override: insignia edit model |
| `FAL_MODEL_BG_REMOVAL` | Override: background removal model |
| `FAL_TRAINER_STEPS` | Tuning: training steps |
| `FAL_TRAINER_LEARNING_RATE` | Tuning: training learning rate |
| `FAL_BASE_NUM_CANDIDATES` | Tuning: candidates generated per order |
| `FAL_BASE_INFERENCE_STEPS` | Tuning: generation steps |
| `FAL_BASE_GUIDANCE_SCALE` | Tuning: generation guidance scale |
| `FAL_BASE_LORA_SCALE` | Tuning: strength of the face model |
| `FAL_EDIT_CANDIDATES` | Tuning: candidates per insignia edit |
| `FAL_ASSISTANT_CHIEF_PROMPT_TEMPLATE` | Optional prompt template override |

### Gemini judge

| Name | Used for |
| --- | --- |
| `GEMINI_API_KEY` | Google Gemini API key |
| `GEMINI_JUDGE_MODEL` | Override: model used by the judge |

### Stripe

| Name | Used for |
| --- | --- |
| `NEXT_PUBLIC_STRIPE_IS_ENABLED` | `"true"` turns on paid checkout |
| `STRIPE_SECRET_KEY` | Stripe API key |
| `STRIPE_WEBHOOK_SECRET` | Signing secret for the Stripe webhook |
| `STRIPE_PRICE_ID_ONE_CREDIT` | Stripe price for one order |
| `STRIPE_PRICE_ID_THREE_CREDITS` | Legacy credit pack price, read only by `app/stripe/subscription-webhook` |
| `STRIPE_PRICE_ID_FIVE_CREDITS` | Legacy credit pack price, read only by `app/stripe/subscription-webhook` |

### Email

| Name | Used for |
| --- | --- |
| `RESEND_API_KEY` | Resend API key |
| `RESEND_FROM_EMAIL` | From address for delivery email |
| `EMAIL_FROM` | Alternative from address read alongside `RESEND_FROM_EMAIL` |

### Display

| Name | Used for |
| --- | --- |
| `NEXT_PUBLIC_SUPPORT_EMAIL` | Overrides the support address in `lib/site.ts` |
| `NEXT_PUBLIC_ORDER_PRICE_LABEL` | Overrides the displayed price in `lib/site.ts`. Stripe remains the source of truth for the charge |
| `NEXT_PUBLIC_ANNOUNCEMENT_ENABLED` | `"true"` shows the notice bar above the header |
| `NEXT_PUBLIC_ANNOUNCEMENT_MESSAGE` | Text of that notice |

## Licence

See `LICENSE.md`.
