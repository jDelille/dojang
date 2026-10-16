# Roster — AI-Powered Business Assistant

Roster is a self-hosted, white-label-capable AI-powered business assistant. It gives a
business (or an agency reselling to its clients) an AI staff member that talks
to leads and customers over chat and voice, finds new leads on Google Maps,
retains existing customers with automated multi-channel outreach, and runs the
pipeline, bookings, invoicing and reputation management around all of it.

You host it. You bring your own API keys. Nothing is proxied through anyone
else's infrastructure.

---

## Requirements

| | |
|---|---|
| Node.js | 20 or newer |
| PostgreSQL | 14 or newer |
| Redis | 6 or newer (required — background jobs run on it) |

Everything else is optional and configurable per workspace from the UI.

---

## Quick start

```bash
# 1. Dependencies
npm install

# 2. Configuration
cp .env.example .env
#    Fill in DATABASE_URL and REDIS_URL, then generate the two secrets:
#      openssl rand -base64 32     -> NEXTAUTH_SECRET
#      openssl rand -base64 32     -> ENCRYPTION_KEY

# 3. Database
npm run db:deploy        # or: npm run db:push  (development)

# 4. Run — both processes are required
npm run dev              # web app          -> http://localhost:3000
npm run workers          # background jobs  (separate terminal)
```

Then open **http://localhost:3000** — a fresh install redirects to the
`/install` wizard, which checks your environment, creates the first admin
account and provisions the first workspace.

Prefer containers for the datastores? `docker compose up -d` starts Postgres
and Redis matching the defaults in `.env.example`.

### Demo data

```bash
npx tsx prisma/seed.ts
```

Seeds a demo workspace with leads, contacts, deals, conversations, retention
rules and reviews. The seed prints the sign-in details when it finishes. The seed
refuses to run if any user already exists, so it cannot clobber a live install.

---

## The two processes

Roster will not work correctly with only the web app running.

| Process | Command | Responsible for |
|---|---|---|
| Web | `npm start` | UI, API, webhooks, streaming AI replies |
| Worker | `npm run workers` | Google Maps lead gathering, retention sequences, appointment reminders, queued outbound sends |

If the worker is not running, jobs queue in Redis and execute once it starts —
nothing is lost, but nothing is sent either.

Under a process manager:

```
pm2 start npm --name roster-web    -- start
pm2 start npm --name roster-worker -- run workers
```

---

## Configuration

### Required

| Variable | Notes |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `REDIS_URL` | Redis connection string |
| `NEXTAUTH_SECRET` | `openssl rand -base64 32` |
| `ENCRYPTION_KEY` | `openssl rand -base64 32` — encrypts stored API keys |
| `NEXT_PUBLIC_APP_URL` | Public origin; used for webhooks, pay links, widget |

> **Keep a backup of `ENCRYPTION_KEY`.** Every third-party credential a
> workspace saves is sealed with it using AES-256-GCM. Change or lose it and
> those stored credentials become unreadable and must be re-entered.

### Optional — set here or per workspace in the UI

AI providers (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`), Twilio, Google Maps
Places, Stripe, Paystack, SMTP, Web Push (VAPID), FCM, Google/Outlook calendar
OAuth, and the Envato personal token. Anything left blank in `.env` can be
filled in later under **Settings → Integrations**, where values are encrypted
per workspace.

Set `ROSTER_TENANCY_MODE=multi` to enable agency mode: sub-accounts, the
role hierarchy, and per-workspace usage metering.

---

## Connecting the services

### Twilio — voice, SMS, WhatsApp

On your Twilio phone number, set:

| Hook | URL |
|---|---|
| A call comes in | `https://your-domain/api/voice/inbound` (HTTP POST) |
| Call status changes | `https://your-domain/api/voice/status` (HTTP POST) |
| A message comes in | `https://your-domain/api/sms/inbound` (HTTP POST) |

Inbound calls are greeted by your agent, transcribed turn by turn, and
summarized into the contact timeline. Any unanswered inbound call triggers an
automatic text back to the caller.

Every webhook validates Twilio's `X-Twilio-Signature`, so nobody else can post
to your install.

### Payments

| Provider | Webhook URL | Event |
|---|---|---|
| Stripe | `https://your-domain/api/invoices/webhooks/stripe` | `checkout.session.completed` |
| Paystack | `https://your-domain/api/invoices/webhooks/paystack` | `charge.success` |

Paste Stripe's signing secret into Settings → Integrations. Payment status
syncs back to the invoice and the contact record automatically.

### Website chat widget

Copy the snippet from **AI Agents → Website widget**, or write it by hand:

```html
<script
  src="https://your-domain/widget.js"
  data-roster-workspace="your-workspace-slug"
  data-roster-host="https://your-domain"
  async
></script>
```

The widget is dependency-free, renders inside a shadow root so it cannot
collide with the host site's CSS, and picks up the workspace's accent color.

### Calendars

Set the Google and/or Microsoft OAuth variables, then connect from
**Appointments → Calendar sync**. Register these redirect URIs with the
provider:

```
https://your-domain/api/appointments/oauth/google/callback
https://your-domain/api/appointments/oauth/outlook/callback
```

### Web Push

```bash
npx web-push generate-vapid-keys
```

Put the public key in `NEXT_PUBLIC_VAPID_PUBLIC_KEY` and the private key in
`VAPID_PRIVATE_KEY`.

---

## Project layout

```
app/
  (marketing)        landing page
  (auth)             login, register
  (dashboard)        the command center + super admin
  api/               every endpoint (see below)
  install/           first-run wizard
  onboarding/        workspace setup wizard
components/
  ui/                buttons, inputs, tables, modals, toasts
  charts/            hand-rolled SVG charts — no charting dependency
  leads|pipeline|inbox|agents|retention|...
lib/
  ai/                provider-agnostic adapter + Claude and OpenAI providers
  integrations/      twilio, googleMaps, stripe, paystack, mailer, push,
                     calendar, envato
  crypto.ts          AES-256-GCM credential vault
  queue.ts           BullMQ setup
  rbac.ts            role hierarchy and permissions
workers/
  leadGather.ts      Google Maps Places → leads
  retentionSender.ts trigger scan + step execution
  reminderScheduler.ts appointment reminders
  outbound.ts        queued SMS/email/push
prisma/schema.prisma
styles/tokens.css    the "Ledger" design tokens
public/widget.js     embeddable chat widget
```

---

## API

| Route | Purpose |
|---|---|
| `/api/auth/*` | NextAuth handlers, registration |
| `/api/workspaces`, `/api/workspaces/[id]` | Tenant CRUD and provisioning |
| `/api/leads`, `/api/leads/[id]` | Lead CRUD |
| `/api/leads/gather` | Queue a Google Maps lead-gen job |
| `/api/contacts`, `/api/contacts/[id]` | CRM contacts + activity timeline |
| `/api/pipeline/deals`, `/api/pipeline/stages` | Kanban board |
| `/api/agents`, `/api/agents/[id]` | AI agent config |
| `/api/agents/[id]/chat` | Streaming chat (SSE) |
| `/api/agents/knowledge` | Per-agent knowledge base |
| `/api/voice/inbound`, `/respond`, `/status` | Twilio voice webhooks |
| `/api/sms/inbound` | Twilio SMS / WhatsApp webhook |
| `/api/retention/rules`, `/[id]`, `/[id]/test` | Automation rules + dry run |
| `/api/appointments`, `/slots`, `/oauth/[provider]` | Booking + calendar sync |
| `/api/reviews`, `/[id]`, `/sync` | Reputation management |
| `/api/invoices`, `/[id]`, `/webhooks/*` | Invoicing and payments |
| `/api/inbox`, `/[id]`, `/send` | Unified inbox |
| `/api/analytics/summary` | Dashboard metrics |
| `/api/license/verify` | Envato purchase code + domain lock |
| `/api/settings/integrations`, `/team` | Credentials and team |
| `/api/widget/config`, `/message` | Public website widget |
| `/api/super-admin/workspaces` | Platform-wide view |

---

## Security notes

- **Tenant isolation.** Every tenant-scoped endpoint runs through
  `withWorkspace()` in `lib/api.ts`, which resolves the workspace from the
  session — a handler cannot widen its own scope. Cross-tenant reads return
  404, not another tenant's data.
- **Credentials at rest.** Third-party secrets are stored as AES-256-GCM
  envelopes. The UI only ever echoes a masked form (`sk-a…9f2a`), and posting
  a masked value back leaves the stored secret untouched.
- **Webhook authenticity.** Twilio requests are signature-checked; Stripe
  events are verified with the signing secret; Paystack with HMAC-SHA512.
- **Privilege escalation.** No user can create or promote an account to a role
  above their own.
- **Opt-outs.** Inbound `STOP` / `START` on SMS are honoured before anything
  else and never reach the AI agent.
- **Installer.** `/install` disables itself as soon as an account exists.

---

## License verification

Enter your Envato purchase code during install, or later under
**Settings → License**. The license binds to the install's domain on first
successful verification; moving it to another domain reports a mismatch rather
than silently re-binding. `localhost` and private ranges are exempt so you can
develop offline.

Verification goes through the license server named in `LICENSE_API_URL`, which
holds the author's Envato token. If neither that nor a local
`ENVATO_PERSONAL_TOKEN` is set, the code is stored and marked unverified rather than
blocking the install.

---

## Scripts

| Command | Does |
|---|---|
| `npm run dev` | Development server |
| `npm run build` / `npm start` | Production build and serve |
| `npm run workers` | Background job processor |
| `npm run typecheck` | TypeScript, no emit |
| `npm run db:push` | Sync schema (development) |
| `npm run db:deploy` | Run migrations (production) |
| `npm run db:studio` | Prisma Studio |

---

## Design system

The UI follows the "Ledger" system defined in `styles/tokens.css`: warm
off-white paper, near-black ink, Signal Amber used sparingly for CTAs and
active states only, 1px borders instead of drop shadows, an 8px spacing grid,
Montserrat for display, Roboto for UI, JetBrains Mono for keys and transcripts.
Dark mode ships from v1.

Chart colors are a validated categorical palette — checked for lightness
banding, chroma, color-vision-deficiency separation and contrast, with a
separately chosen (not flipped) dark-mode set. Every chart carries a legend for
two or more series, direct labels, and a table view for anyone who cannot rely
on color.
