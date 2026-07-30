# Merchant Payments Dashboard

A payments dashboard for a small business owner: sign up, see account health at a
glance, search and drill into transactions, and initiate payouts to a bank
account. Payouts are **mocked but asynchronous** — accepted immediately,
then carried to a terminal state by signed webhook callbacks from a mock
payment provider, the way a real payout rail works. The team can have more
than one login, with real server-enforced roles; transactions and payouts
export to CSV; and the dashboard breaks revenue down by composition and by
payment method, not just a single volume line.

**Stack:** React + TypeScript (Vite, Tailwind, shadcn-style components,
TanStack Query) · NestJS + TypeScript · PostgreSQL (Drizzle ORM).

---

## Quick start

Requirements: Node 20+, npm, and either Docker **or** a local PostgreSQL 16+ binary.

```bash
npm install
cp .env.example apps/api/.env

# Postgres — pick one:
npm run db:up                 # Docker Compose (postgres + adminer on :8080)
# — or, if you don't have Docker —
npm run db:local:init         # initializes a project-local cluster on :5433

npm run db:migrate            # apply the schema
npm run db:seed               # seed realistic demo data
npm run dev                   # API on :3000, web on :5173
```

Open **http://localhost:5173** and sign in with the seeded demo account:

```
demo@northwindcoffee.test / Password123!       (OWNER)
ops@northwindcoffee.test / Password123!         (ACCOUNTANT)
support@northwindcoffee.test / Password123!     (SUPPORT)
```

Sign in as each to see the role differences live — `support@` won't show a
"New payout" button, an "Export CSV" button, or the "Team" nav item, and the
API rejects those actions with `403` even if you script around the UI.

API docs (Swagger) are at **http://localhost:3000/api/docs** in development.

A second, isolated merchant (`owner@tidepoolstudio.test` / `Password123!`) is
also seeded — it exists purely to make tenant isolation something you can
click through, not just take on faith.

### Running tests

```bash
npm run test -w @andpayments/api        # unit tests
npm run test:e2e -w @andpayments/api    # integration tests against a real Postgres
```

The e2e suite needs `TEST_DATABASE_URL` migrated once:
`DATABASE_URL=$TEST_DATABASE_URL npm run db:migrate` (run from `apps/api`,
with `TEST_DATABASE_URL` from your `.env`).

---

## Architecture

```
apps/
├── api/    NestJS — REST API, Drizzle ORM, auth, the async payout engine
└── web/    React (Vite) — dashboard, transactions, payouts UI
```

**Backend modules** (`apps/api/src/`), grouped by domain:

- `auth/` — login/signup/refresh business logic (the request-time JWT
  strategy and guards live in `common/auth/` instead — see below).
- `user/` — `user.schema.ts` (merchants, users, refresh tokens) plus
  `user/team/` (invitations, role management).
- `payments/` — `transactions/`, `payouts/` (with `payouts/bank-accounts/`
  and `payouts/psp/`, the mock payment provider and webhook receiver nested
  inside it), and `ledger/` (balance computation) as siblings.
- `dashboard/` — reads across `user/` and `payments/` for the summary and
  chart endpoints.
- `common/` — `common/db/` (Drizzle connection, relations, shared helpers),
  `common/auth/` (JWT strategy, JWT guard, roles guard — the actual
  request-time middleware), `common/config/`, decorators, the global error
  filter, money and CSV utilities.

Each module owns its own Drizzle table definitions (`<module>.schema.ts`),
colocated with the code that queries them; `common/db/schema.ts` is just a
barrel re-export and `common/db/relations.ts` centralizes the `relations()`
declarations (kept in one leaf file to avoid circular imports between
modules).

**Two rules hold everywhere in the backend:**

1. **Tenant scope comes from the authenticated principal, never from the
   request.** A `@CurrentUser()` decorator reads `merchantId` off the verified
   JWT; every service method takes it as an explicit first argument. There is
   no code path where a request body or query string can select which
   merchant's data gets touched.
2. **Money is an integer count of minor units plus a currency, always.**
   Nothing does arithmetic on a float dollar amount. Formatting to a decimal
   string happens once, at the UI's display edge.

## Key design decisions

### The payout flow is genuinely asynchronous

`POST /payouts` validates the request, **reserves the balance immediately**
by writing a debit to the ledger, and returns `202 Accepted` with the payout
in `PENDING` — it does not wait for the payout to "complete," because a real
payout doesn't complete synchronously either. A `MockPspService` then delivers
real, signed HTTP webhooks back to the API (`POST /webhooks/payouts`) that
carry the payout through `PROCESSING → PAID`, or straight to `FAILED`. The
frontend discovers these transitions by polling (`GET /payouts/:id`) at a
short interval that stops on its own once the payout reaches a terminal state.

This is deliberately over-built relative to "just fake it with a `setTimeout`"
because the interesting engineering in a payout flow — signature verification,
webhook idempotency, illegal-transition handling, compensating the ledger on
failure — only shows up if the accept and the completion are actually two
different events. See `apps/api/src/payments/payouts/psp/` and
`apps/api/src/payments/payouts/`.

- **Idempotent by construction.** Every webhook delivery is recorded in a
  `WebhookEvent` table keyed on the provider's event id *before* it's
  applied. A retried delivery collides on that key and is acknowledged
  without touching the payout a second time — this is what makes at-least-once
  delivery safe.
- **An explicit state machine**, not a chain of `if`s. `PENDING → PROCESSING
  → PAID`, with `FAILED` reachable from either non-terminal state, and `PAID`
  reachable directly from `PENDING` (in case an intermediate webhook is lost).
  An illegal or out-of-order transition is recorded and acknowledged with
  `200`, never rejected — a real provider retries forever on an error
  response, so disagreeing about state must never become a redelivery loop.
- **Failure reverses the ledger by appending, not editing.** A `FAILED`
  payout gets a compensating `PAYOUT_REVERSAL` entry; the original debit is
  left standing. The balance is always the sum of an append-only ledger, so
  it's auditable after the fact and can't drift from a cached counter.
- **Concurrency-safe acceptance.** The balance check that gates a new payout
  re-reads the ledger inside a `Serializable` transaction immediately before
  inserting the debit, so two concurrent payout requests cannot both spend
  the same balance.
- **Dev-only "simulate" controls.** `POST /payouts/:id/simulate` (disabled
  when `NODE_ENV=production`) forces the mock provider to emit a webhook
  *now* instead of waiting for its timer — visible in the UI as a "Simulate"
  menu on an in-flight payout. It calls the exact same code path as the
  automatic timers; there's no separate "fake" route.

### Auth

- Argon2id password hashing; a constant-time-equivalent login path (a dummy
  hash is verified against on an unknown email, so response timing doesn't
  reveal which addresses have accounts).
- Access + refresh JWTs in `httpOnly`, `sameSite=lax` cookies — never in
  `localStorage`, so client-side JS (including an XSS payload) can't read
  them.
- Refresh tokens are stored as SHA-256 hashes and **rotated** on every use.
  Presenting an already-rotated token is treated as theft and revokes the
  entire token family, not just that one token.
- A global `JwtAuthGuard` protects every route by default; `@Public()` is the
  explicit, reviewable exception — used exactly twice (auth endpoints, and
  the webhook receiver, which is protected by signature instead).

### Database schema

The schema is plain TypeScript, split one file per owning module (e.g.
`apps/api/src/payments/payouts/payouts.schema.ts`), with the reasoning inline
as comments. `apps/api/drizzle/` holds the generated SQL migrations. The two
decisions most worth knowing about going in:

- **The ledger (`LedgerEntry`) is the single source of truth for balances** —
  `available = Σ amount WHERE state = AVAILABLE`. There is no stored balance
  column anywhere to keep in sync.
- **Every merchant-owned table carries `merchantId` directly**, even where it
  could be reached through a join, so tenant scoping is one indexed predicate
  on every query rather than something that depends on the join shape.

### Roles, CSV export, and revenue charts

- **Three roles, enforced server-side.** `OWNER` has full access; `ACCOUNTANT`
  can view everything, export, and initiate payouts, but can't manage the team;
  `SUPPORT` is view-only. A `RolesGuard` (`apps/api/src/common/auth/roles.guard.ts`)
  runs globally right after `JwtAuthGuard`: no `@Roles()` metadata means "any
  authenticated role" (the behavior every endpoint already had), so adding the
  guard couldn't silently lock anyone out of an endpoint nobody meant to
  restrict — `@Roles(...)` is the opt-in restriction, the same shape as
  `@Public()`. The frontend hides buttons a role can't use
  (`apps/web/src/lib/permissions.ts`), but that's UX only — every check is
  re-run on the server, which you can confirm directly: log in as
  `support@northwindcoffee.test` and `curl -b <cookies> -X POST
  http://localhost:3000/api/payouts` (or `/transactions/export`) returns
  `403` regardless of what the UI shows.
- **Adding a teammate is a real invite, not a backdoor.** An owner invites by
  email from `/team`; a `TeamMailService` "sends" the email by logging it
  (the same honesty `MockPspService` has about not moving real money) and, in
  non-production only, hands the raw link back so the flow is clickable
  without an inbox. The invite token is stored as a SHA-256 hash, never in
  plaintext — the same scheme `TokenService` already used for refresh tokens,
  factored out to `apps/api/src/common/crypto.ts` so both share it.
- **A merchant can never end up with zero owners.** Demoting or removing the
  last `OWNER` is rejected with `400` by `TeamService`'s
  `assertNotLastOwner`, checked by counting remaining owners before the
  write — not left to a database constraint, which has no clean way to
  express "at least one row like this must remain" across a whole table.
- **CSV export reuses the list query's own filter builder.** `GET
  /transactions/export` calls the exact same `TransactionsService.buildWhere`
  the paginated list endpoint uses, just without the cursor — so "what you
  filtered is what you exported" isn't a separate code path that could drift.
  It's a plain `<a href download>` on the frontend, not a fetch-a-blob dance:
  a normal top-level GET carries the session cookie the same as any other
  request to the API's origin, and the response's `Content-Disposition`
  header is what turns it into a download.
- **The revenue charts follow the dataviz palette rules, not just "looks
  fine."** The naive order for the three-series revenue-composition chart
  (fees/net/refunds as orange/blue/red) fails the skill's validator — the
  orange-red pair is too close for both colorblind and normal vision. Net
  revenue's blue is placed *between* them instead, which passes every check
  in both light and dark mode (`scripts/validate_palette.js`); see the
  comment in `apps/web/src/features/dashboard/revenue-chart.tsx` for the
  exact numbers. The method-breakdown bars use the skill's own pre-validated
  four-color default order, plus visible value labels as the required
  "relief" for the two bars that fall under 3:1 contrast on a light
  background.

### Frontend

- All server state lives in TanStack Query — no separate client-state store.
- Transaction filters live in the URL query string, so a filtered view is a
  shareable link and the back button steps through filter changes.
- A single axios response interceptor handles token refresh: on a 401, it
  triggers one shared `/auth/refresh` call (coalesced across concurrent
  requests) and retries the original request once.
- The dashboard's chart uses a single validated sequential hue (see
  `apps/web/src/features/dashboard/volume-chart.tsx`) rather than a
  multi-color palette, since it's one series.

---

## What's out of scope, on purpose

- **No real money movement, obviously** — the "bank" is `MockPspService`.
- **No email verification / password reset** — signup issues a session
  directly. A real product would gate on a verified email before granting
  payout access.
- **No multi-currency payouts** — the merchant has one `defaultCurrency`;
  the schema supports more but the UI and rules assume one.
- **Bank account creation/verification isn't exposed** — accounts are seeded
  (one verified, one pending) and one is created automatically at signup.
  Wiring up a real verification flow (micro-deposits, Plaid-style linking) is
  a distinct project.
- **The mock PSP's timers are in-memory** — a server restart mid-payout
  leaves it `PENDING` (the correct, recoverable state) rather than resuming
  automatically; the dev-only simulate endpoint can carry it forward by hand.
  A production version of this would use a durable queue.
- **No real email delivery.** `TeamMailService` logs the invite link instead
  of sending anything, the same way the payout flow mocks a bank instead of
  moving money — see the code comment there for why.
- **CSV export is synchronous and capped.** `GET /transactions/export` /
  `/payouts/export` build the whole file in one request, capped at 50,000 rows
  with a logged warning if a filter matches more. A dataset large enough to
  need an async export-and-download-when-ready flow is out of scope at this
  app's size.

## Project layout reference

```
apps/api/src/
  auth/                   signup, login, refresh rotation, invite acceptance business logic
  user/
    user.schema.ts        merchants, users, refresh tokens
    team/                 invitations, member role changes, the last-owner guard
  payments/
    transactions/         filtering, search, cursor pagination, detail view, CSV export
    payouts/               validation rules, state machine, the accept endpoint, CSV export
      bank-accounts/      read-only list of payout destinations
      psp/                mock provider, webhook signing/verification, webhook receiver
    ledger/               balance computation from the append-only ledger
  dashboard/              summary metrics, volume/revenue series, method breakdown
  common/
    auth/                 JWT strategy, JWT guard, roles guard (request-time middleware)
    db/                   Drizzle connection/module, centralized relations, shared query helpers
    config/               environment validation
    decorators, filters, crypto/csv/money/reference utils

apps/api/
  drizzle/         generated SQL migrations (drizzle-kit generate)
  db/seed.ts       seed script (drizzle-kit has no nested-write sugar, so this is
                   plain sequential inserts inside a transaction)

apps/web/src/
  pages/           route-level components (auth, dashboard, transactions, payouts, team)
  features/        data hooks + feature-specific UI, grouped by domain
  components/ui/   shadcn-style primitives (button, card, dialog, select, …)
  lib/             api client, money formatting, theme context, permissions, utils
```