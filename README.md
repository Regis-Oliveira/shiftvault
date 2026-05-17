# ShiftVault

A private, browser-only **Hours Bank** dashboard for tracking team overtime and time off. All data lives in your browser via IndexedDB — no account, no server, no analytics.

Built for two roles using the same app:

- **QA Manager / Team Lead** — logs overtime and time off for their team.
- **HR** — reconciles reports across teams (Engineering, AI, Business, etc.) and approves pay-outs.

## Quickstart

```bash
npm install
npm run dev          # http://localhost:5173
```

## Scripts

| Script             | What it does                                                              |
| ------------------ | ------------------------------------------------------------------------- |
| `npm run dev`      | Vite dev server with HMR                                                  |
| `npm run build`    | Type-check + production bundle to `dist/`                                 |
| `npm run preview`  | Serve the production build locally                                        |
| `npm run lint`     | Biome lint + format check                                                 |
| `npm run lint:fix` | Biome auto-fix                                                            |
| `npm test`         | Vitest in watch mode                                                      |
| `npm run test:run` | Vitest single-run (CI)                                                    |

## Stack

- **Vite 8** + **React 19** + **TypeScript** (strict, `verbatimModuleSyntax`, `erasableSyntaxOnly`)
- **Tailwind CSS v4** (CSS-only config via `@theme inline`) + **shadcn/ui** (new-york style, unified `radix-ui` package) + **tw-animate-css**
- **react-router-dom 7** (lazy route chunks + `Suspense`)
- **react-day-picker 10** for the calendar
- **react-hook-form 7** + **zod 4** for forms
- **idb 8** wrapper around IndexedDB
- **Biome 2** for lint + format
- **Vitest 4** + **@testing-library/react** + **fake-indexeddb** for tests
- **Vercel** for deploy (`vercel.json` with SPA rewrite)

## Project layout

```
src/
├── App.tsx                  Lazy-loaded routes + Suspense
├── main.tsx                 Root mount
├── index.css                Tailwind @theme tokens + dark variant + print + reduced-motion
├── types.ts                 Member, Entry, Consumption, AppSettings, EntryKind
│
├── components/              Feature + UI components
│   ├── AppShell.tsx         Sidebar shell, capped at max-w-[1440px]
│   ├── ThemeProvider.tsx    Light / system / dark with localStorage
│   ├── ThemeToggle.tsx
│   ├── DataProvider.tsx     (lives in data/) — React context over IDB
│   ├── MemberFormDialog.tsx
│   ├── EntryFormDialog.tsx  Logs overtime / time-off; runs FIFO + 48h cap
│   ├── MonthPicker.tsx      Custom shadcn-style year + month grid
│   ├── MemberCard.tsx
│   ├── ConfirmDialog.tsx    AlertDialog wrapper
│   ├── PageHeader.tsx       Eyebrow + title + back-to-Dashboard
│   ├── StatCard.tsx         Shared metric card
│   ├── EmptyStateCard.tsx   Shared empty-state pattern
│   ├── AvatarField.tsx
│   └── ui/                  shadcn primitives over radix-ui
│
├── data/
│   └── DataProvider.tsx     Loads + mutates members/entries/settings; FIFO settlement
│
├── lib/                     Pure helpers
│   ├── db.ts                IndexedDB schema (v2), transactional commits
│   ├── settlement.ts        FIFO planConsumption + planRestoration
│   ├── hours.ts             formatMinutes, memberBalance, totals
│   ├── entries.ts           toIsoDate (local time), groupEntriesByDate, entriesInRange
│   ├── report.ts            buildReport + toCsv + month-string utilities
│   ├── dateFormat.ts        DATE_FULL / DATE_MEDIUM / DATE_SHORT / MONTH_YEAR / WEEKDAY_FULL
│   ├── avatar.ts            readAvatarFile (1.5 MB cap) + initialsFromName
│   ├── id.ts                crypto.randomUUID wrapper
│   └── __tests__/           Vitest suites
│
├── pages/                   Top-level routes (lazy-loaded)
│   ├── Dashboard.tsx        Members grid + stats + empty state
│   ├── MemberDetail.tsx     Profile, balance card, banked vs settled OT, time-off
│   ├── Calendar.tsx         Day / Range modes, member filter, scope-aware stats
│   ├── Reports.tsx          Month-range builder, JSON / CSV / Print
│   ├── Settings.tsx         (placeholder — next milestone)
│   └── NotFound.tsx
│
└── test/
    └── setup.ts             jest-dom + fake-indexeddb + db singleton reset
```

## Architecture in one paragraph

A single `<DataProvider>` context loads `members`, `entries`, and `settings` from IndexedDB on mount and exposes mutation methods. Pages are lazy-loaded route chunks that consume the context via `useShiftVault()`. Adding a time-off triggers a **FIFO consumption plan** (`src/lib/settlement.ts`) that walks the member's open overtime entries (oldest first) and writes the time-off + updated overtime entries in one IDB transaction. Deleting a time-off reverses that — restoring `consumedMin` on the referenced overtime — also in one transaction.

For the full settlement model, IDB schema, and key invariants, see [`IMPLEMENTATION.md`](./IMPLEMENTATION.md).

## Theming

Pinterest-inspired soft neumorphic. Tokens in `src/index.css` (`@theme inline` + `.dark` override) using OKLCH. Slate primary, white cards, light blue-gray background. Three theme modes: light / system / dark, persisted to `localStorage`. Reduced-motion respected globally.

## Privacy

- No login, no account, no server. All state lives in IndexedDB (`shiftvault` database) and `localStorage` (theme preference only).
- Avatars stored as base64 inside IndexedDB.
- Workspace JSON export/import will round-trip the entire dataset between machines (next milestone — see Roadmap).

## Roadmap

1. ✅ **Settlement / hour-bank model** with FIFO consumption
2. ✅ **Settings panel** — workspace identity, theme picker, JSON / CSV export, import, danger-zone wipe
3. ✅ **Teams + multi-team UI** for HR (tab bar across QA, Engineering, AI, Business)
4. ✅ **Plan time off (range flow)** — pick a date range, auto-counts working days × hours, live bank impact preview, atomic batch FIFO
5. ✅ **Day-cell visualization on Calendar** — orange fill for time-off, green fill for open overtime, green ring for fully-settled overtime
6. ✅ **Structured reason on time-off** — vacation / sick / comp / personal categories + Reports filter + CSV columns
7. ✅ **HR reconciliation page** (`/reconcile`) — file import + email-keyed diff + bulk approve with tolerant FIFO settlement

## Deploy

Push to Vercel — `vercel.json` is configured for SPA routing. No env vars needed.
