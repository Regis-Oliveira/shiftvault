# ShiftVault — Implementation Notes

Reference doc for developers picking up the codebase. Covers the data model, the settlement (hour-bank) algorithm, key invariants, and where to extend.

---

## 1. Data model

### Member

```ts
interface Member {
  id: string;            // crypto.randomUUID()
  name: string;          // free-text display name
  email: string;         // lowercased; unique within workspace; the cross-workspace key for HR reconciliation
  avatarBase64?: string; // optional, ≤ 1.5 MB raw
  createdAt: number;     // unix ms
}
```

### Entry

```ts
type EntryKind = "overtime" | "timeoff";

interface Consumption {
  overtimeEntryId: string;
  consumedMin: number;
}

interface Entry {
  id: string;
  memberId: string;
  kind: EntryKind;
  date: string;              // "YYYY-MM-DD" — local-day key, never UTC
  durationMin: number;
  taskUrl?: string;          // required for overtime, ignored for timeoff
  note?: string;
  createdAt: number;
  consumedMin?: number;      // overtime only — minutes already paid out via time-off
  consumptions?: Consumption[]; // time-off only — which OTs this paid from
}
```

### AppSettings

```ts
interface AppSettings {
  id: "app";                    // singleton row key
  themeMode: ThemeMode;         // "light" | "dark" | "system"
  memberLabel: string;          // "Member" / "QA" / "Engineer"
  workspaceName: string;        // shown on sidebar + report header
  maxBalanceMin: number;        // hard-block cap on overtime, default 48h
}
```

---

## 2. IndexedDB schema (v4)

Database `shiftvault`, five stores:

| Store      | Key path | Indexes                  | Notes                                                 |
| ---------- | -------- | ------------------------ | ----------------------------------------------------- |
| `members`  | `id`     | —                        | every member belongs to one `Team` via `teamId`       |
| `entries`  | `id`     | `by-member`, `by-date`   | both indexes are non-unique                           |
| `settings` | `id`     | —                        | always exactly one row with `id: "app"`               |
| `teams`    | `id`     | —                        | sorted client-side by `sortOrder` then `createdAt`    |
| `audit`    | `id`     | `by-timestamp`           | append-only mutation log, newest-first reads          |

### v1 → v2 migration

`src/lib/db.ts` runs cursor migrations on upgrade:

- Each `Member` gets `email: ""` if missing.
- Each `overtime` entry gets `consumedMin: 0` if missing.
- Each `timeoff` entry gets `consumptions: []` if missing.

### v2 → v3 migration

- Creates the `teams` store.
- If no teams exist, inserts a `Default` team (id `default-team`).
- Backfills every `Member.teamId` to that default team's id when missing.

### v3 → v4 migration

- Creates the `audit` store with a `by-timestamp` index.
- No backfill — audit history starts the moment the v4 upgrade runs.

No data is deleted in any migration. `memberBalance = ΣOT − ΣTO` stays exact across the migration. New workspaces also pass through `ensureDefaultTeam()` on boot so a Default team is guaranteed regardless of whether v3 ran or this is a fresh install.

### Reset helper

`_resetDbForTests()` in `src/lib/db.ts` closes + nulls the singleton connection. The test setup (`src/test/setup.ts`) calls it after replacing `globalThis.indexedDB` with a fresh `IDBFactory` before each test.

---

## 3. Settlement model (hour-bank with FIFO)

The user-visible contract:

> Overtime sits in a bank. Logging time-off "withdraws" hours from the bank by consuming the oldest open overtime entries first (FIFO). Consumed entries are kept forever for audit but no longer count toward the open balance.

### Invariants

1. `entry.consumedMin` for any overtime entry satisfies `0 ≤ consumedMin ≤ durationMin`.
2. An overtime entry is **settled** when `consumedMin === durationMin`. It's **partially settled** when `0 < consumedMin < durationMin`.
3. For every time-off entry: `Σ(consumptions[i].consumedMin) === timeoff.durationMin`.
4. For every overtime entry consumed by a time-off: the entry's `consumedMin` reflects the sum of every `consumption.consumedMin` that references it.
5. `memberBalance(entries) === ΣOT.durationMin − ΣTO.durationMin`. This holds even with partial consumption because each consumption updates exactly one OT by exactly the amount it took.

### Algorithm — `planConsumption(memberOTs, requestedMin)`

Source: `src/lib/settlement.ts`.

1. Filter `memberOTs` to entries with `availableMin > 0` (open or partially open).
2. Sort by `date ASC`, then `createdAt ASC` (tiebreaker).
3. Walk the sorted list, taking `min(remaining, availableMin)` from each entry, until `remaining === 0`.
4. If the total available is less than the request, throw `InsufficientHoursError` with `requestedMin` + `availableMin`.

Returns `{ consumptions, updatedOvertime, consumedTotalMin }`. **Pure function** — does not touch IDB; the caller (`DataProvider.addEntry`) persists the result via `commitTimeoffWithConsumption(timeoff, updatedOvertime)`.

### Algorithm — `planRestoration(memberOTs, consumptions)`

Reverses a single time-off's consumption. For each `Consumption`, decrements the referenced overtime's `consumedMin` (clamped to 0). Missing OTs are silently skipped (defensive — if an OT was somehow deleted out-of-band, the time-off delete still succeeds).

### Atomic IDB helpers (`src/lib/db.ts`)

```ts
commitTimeoffWithConsumption(timeoff, updatedOT[])               // single time-off
commitTimeoffBatchWithConsumption(timeoffs[], updatedOT[])       // multi-day range (Plan time off)
commitTimeoffDeletionWithRestore(timeoffId, restoredOT[])        // delete + restore bank
```

All three batch their writes in one `entries`-store transaction so a crash mid-write can't leave the bank inconsistent.

### Batch FIFO over a date range (`DataProvider.addTimeoffBatch`)

When the user picks a range (e.g. May 14 → May 18), each working day becomes its own time-off `Entry` sharing a `note`. The DataProvider walks the dates sequentially against a **working copy** of the member's overtime entries — each day's `planConsumption` sees the `consumedMin` updates from the preceding days. The whole batch is then written in one IDB transaction via `commitTimeoffBatchWithConsumption`. Upfront validation refuses the batch if `totalRequested > Σ(OT.available)` so partial batches never get committed.

Crucially, you can **not** loop over `addEntry` calls — `addEntry` is `useCallback` with `entries` in its deps, so each call captures a stale closure that ignores prior calls' updates. The batch helper computes against fresh state synchronously and commits once.

### Validation (UI level)

`EntryFormDialog` enforces two limits **before** calling `addEntry`:

- **Overtime**: refuse if `currentBalance + durationMin > maxBalanceMin` (the 48h hard cap).
- **Time-off**: refuse if `durationMin > currentBalance` (can't withdraw more than what's banked).

`removeEntry` for overtime throws `ConsumedOvertimeError` if `consumedMin > 0` — UI surfaces the message in a dismissible alert at the top of the member detail page.

---

## 4. Date handling

Stored dates are `"YYYY-MM-DD"` strings representing **local** days. Never UTC, never `.toISOString()`-derived (that introduces an off-by-one for late-night entries).

- Building a stored date from a `Date`: `src/lib/entries.ts::toIsoDate(date)`.
- Parsing a stored date back into a local-midnight `Date`: `src/lib/report.ts::localDateFromIso(iso)` (`parseISO(`${iso}T00:00:00`)`).
- All display-side format strings live in `src/lib/dateFormat.ts` — `DATE_FULL`, `DATE_MEDIUM`, `DATE_SHORT`, `MONTH_YEAR`, `WEEKDAY_FULL`.

---

## 5. Bundle layout

`vite.config.ts` splits `node_modules` into long-cached chunks:

- `vendor` — React, react-router, idb, lucide, misc.
- `radix` — all `radix-ui` primitives.
- `forms` — react-hook-form + zod + resolvers.
- `calendar` — react-day-picker + date-fns (heaviest single dep).

Routes are lazy-loaded with `React.lazy` + `Suspense` in `src/App.tsx`, so the initial load only ships the Dashboard chunk + shared chunks.

---

## 6. Theming

Single source of truth: `src/index.css`.

- `@theme inline { ... }` — light tokens via OKLCH.
- `@layer base .dark { ... }` — dark overrides.
- `@media print` — hides the sidebar + page header; the `#report-preview` card becomes the printed page.
- `@media (prefers-reduced-motion: reduce)` — kills animation durations globally.

`ThemeProvider` (`src/components/ThemeProvider.tsx`) toggles `.dark` on `<html>`, watches `matchMedia("(prefers-color-scheme: dark)")` when in `system` mode, persists choice to `localStorage` key `shiftvault.theme`.

---

## 7. Testing

- Unit tests in `src/lib/__tests__/`. Vitest + jsdom.
- `fake-indexeddb` shims IDB; setup file re-creates the factory + resets the db singleton before each test.
- E2E flow tests in `db-flow.test.ts` cover the FIFO commit + restore paths against real IDB transactions.
- `npm test` watches; `npm run test:run` is the CI mode.

Coverage gaps that intentionally remain:
- React component rendering — covered by manual smoke + the production build. Add component tests if regressions appear.
- DataProvider context — the underlying helpers are tested; the context itself is a thin wrapper.

---

## 8. Export formats — quick reference

| Format | Source helper | Filename pattern | Scope |
| ------ | ------------- | ---------------- | ----- |
| Report JSON | Reports page `JSON.stringify(buildReport(...))` | `shiftvault-report-<period>.json` | Selected members × month range |
| Report CSV | `toCsv(reportPayload)` | `shiftvault-report-<period>.csv` | Selected members × month range |
| Backup JSON | `exportAll()` → `{ schemaVersion: 2, members, entries, settings }` | `shiftvault-backup-YYYY-MM-DD.json` | Entire workspace |
| Full history CSV | `historyToCsv(name, members, entries)` | `shiftvault-history-YYYY-MM-DD.csv` | Every entry, no period |

`importAll(payload, mode)` accepts both `schemaVersion: 1` (auto-upgraded on read) and `2`. Mode is `"merge"` (add to existing, same IDs overwritten) or `"replace"` (wipe first).

## 9. Extension points

| Need                                        | Where to extend                                                                  |
| ------------------------------------------- | -------------------------------------------------------------------------------- |
| New IDB store / field                       | Bump `DB_VERSION` in `src/lib/db.ts` and add a cursor migration in `upgrade()`.  |
| New entry kind beyond overtime / time-off   | `src/types.ts` `EntryKind`, then update math in `src/lib/hours.ts` + settlement. |
| New report export format                    | Add a serializer alongside `toCsv` in `src/lib/report.ts`.                       |
| Page-level theming or layout                | `src/components/PageHeader.tsx` for the eyebrow/title; pages compose from there. |
| Different settlement strategy (LIFO, etc.)  | Replace the sort in `planConsumption` (`src/lib/settlement.ts`).                 |

---

## 10. Settings page (`/settings`)

Four sections in one form layout. `src/pages/Settings.tsx` orchestrates them all.

### Workspace
react-hook-form + zod (`workspaceSchema`) for `workspaceName`, `memberLabel`, `maxBalanceHours`. Submit calls `DataProvider.updateSettings({ ..., maxBalanceMin: hours * 60 })`. Toast on save.

### Appearance
`ToggleGroup` with three items (Light / System / Dark) wired to `ThemeProvider.setMode`. Same store the sidebar's icon toggle writes to.

### Data
- **Export backup (JSON)** — `exportAll()` → `shiftvault-backup-YYYY-MM-DD.json`. Full payload with `schemaVersion: 2`, members, entries, settings.
- **Export full history (CSV)** — `historyToCsv(workspaceName, members, entries)` in `src/lib/report.ts`. **Different from the report builder's CSV** — no period scoping, one row per entry across all members, includes `email` (HR matching key) + `status` column derived from `consumedMin` (`open` / `partial` / `settled` for overtime, `withdrawn` for time-off).
- **Import from JSON** — file picker → `FileReader.readAsText` → `JSON.parse` → shape-validate (`schemaVersion`, `Array.isArray(members)`, `Array.isArray(entries)`) → preview the count in a custom `ImportConfirmDialog` → user picks **Merge** (add on top, existing IDs get overwritten) or **Replace all** (wipe first, destructive). Both run through `importAll(payload, mode)`. After commit, `refresh()` reloads in-memory state from IDB.

### Danger zone
`ConfirmDialog` with destructive tone → `wipeAll()` → `refresh()` → toast → navigate to `/`.

## 11. Teams + multi-team UI

Each member belongs to one team (`Member.teamId`, required). Workspaces always have at least one team — created by the v2→v3 migration or `ensureDefaultTeam()` on first boot. The QA Manager's workspace with a single team displays a flat view (no tab bar); HR's workspace with several teams gets a tab bar above the page header on Dashboard / Calendar / Reports.

### State

`DataProvider` owns `teams` + `activeTeamId`. The active team is persisted to `localStorage` under `shiftvault.activeTeam` so navigation keeps the filter sticky. `ALL_TEAMS = "__all__"` is the no-filter sentinel.

### `useVisibleMembers()`

A hook in `data/DataProvider.tsx` that filters `members` by `activeTeamId`. Returns all members when `activeTeamId === ALL_TEAMS` **or** when there's only one team (so single-team workspaces effectively skip team filtering entirely).

### Constraints

- A team with members assigned can't be deleted — `deleteTeam(id)` throws `TeamHasMembersError` so the UI can show a useful message.
- Team color is an optional `TeamColor` slot. Palette + OKLCH values live in `src/lib/teamColor.ts`. `suggestNextTeamColor(usedColors)` picks the next unused palette slot for new teams.

### UI surfaces

- **Settings → Teams** (`src/components/TeamsManager.tsx`) — list, inline rename, color picker, delete (blocked when members assigned), add new.
- **`TeamTabs`** (`src/components/TeamTabs.tsx`) — sticky pill bar above Dashboard / Calendar / Reports. Hides itself when `teams.length <= 1`.
- **`MemberFormDialog`** — gained a Team `Select`. Pre-selects either the member's current team (edit), the active team filter (when creating from inside a team tab), or the first team.

## 12. Plan time off (range flow)

`src/components/PlanTimeOffDialog.tsx` — multi-day time-off planner triggered from the member detail page alongside the single-day "Log time off" button.

UI is a controlled (not RHF) form because the live preview reacts to every keystroke and selection:
- Two `DayPicker`s (From / To) — reversed ranges auto-swap.
- Hours-per-workday input (default 8, range 0.5–24, half-day friendly).
- "Exclude weekends" checkbox (default true).
- Free-text reason field (optional — structured categories are a later slice).
- Live preview card showing working-day count, total hours, current bank → after-bank, and a tonal border (success / destructive) based on whether the bank covers the request.

`src/lib/workdays.ts` exports `expandRangeToWorkdays(from, to, excludeWeekends): string[]` — pure, swappable input order, weekend handling. Tested in `workdays.test.ts`.

Submit calls `DataProvider.addTimeoffBatch({ memberId, dates, durationMinPerDay, note })`. On success the dialog closes with a toast summarising the range; on `InsufficientHoursError` the inline error explains the deficit precisely.

## 13. Day-cell visualization (Calendar)

Visual encoding on each day cell, implemented in `DayButtonWithDots` inside `src/pages/Calendar.tsx`. Selection state (range start / middle / end, single-day selected) **always wins** over the encoding below so the selection stays unambiguous.

| State | Visual |
| ----- | ------ |
| Day with time-off entries | `bg-warning-soft/60` fill (orange tint) + orange dot |
| Day with only-open overtime | `bg-success-soft/40` fill (green tint) + green dot |
| Day with overtime where every OT entry is fully settled | `ring-1 ring-inset ring-success/40` (green ring, no fill) + green dot |
| Mix of OT + time-off | Time-off fill wins (the louder signal); both dots render |
| Nothing logged | Plain cell |
| Selected (day or range start/end) | `bg-primary text-primary-foreground` overrides everything above |
| Range middle | `bg-accent text-accent-foreground` |

The page description text on Calendar surfaces this encoding so it stays discoverable.

## 14. Structured reason on time-off

`TimeoffReason = "vacation" | "sick" | "comp" | "personal" | "unspecified"` lives in `src/types.ts`. `Entry.timeoffReason` is optional — readers default missing values to `"unspecified"` via `normaliseTimeoffReason`, so legacy entries don't need an IDB migration.

Helpers in `src/lib/timeoffReason.ts`:
- `TIMEOFF_REASONS` — canonical display order
- `timeoffReasonLabel(reason)` — human-readable string
- `normaliseTimeoffReason(reason)` — undefined → "unspecified"
- `timeoffReasonBadge(reason)` — returns `{ variant, className? }` for the chip

Shared chip component `src/components/ReasonBadge.tsx` renders the colored pill. Hides itself for `unspecified` by default so legacy entries don't all sprout a generic badge.

Surfaces:
- **EntryFormDialog** (time-off branch) — Select between Duration and Note
- **PlanTimeOffDialog** — Select alongside the Note field; the batch flow stamps every per-day entry with the same reason
- **MemberDetail TimeoffRow / Calendar entry row / Reports preview entry** — render the chip next to the duration
- **Reports** — "Time-off reason" filter card narrows time-off only; overtime always passes through
- **Report CSV** + **Settings full-history CSV** — `timeoff_reason` column

## 15. HR reconciliation (`/reconcile`)

The HR-side import-and-merge flow for combining a peer's workspace dump into the local one. Pure builder lives in `src/lib/reconcile.ts`; tolerant batch-apply on `DataProvider`; UI in `src/pages/Reconcile.tsx`.

**Identity:** members reconcile by **lowercased trimmed `Member.email`** — never by id, since IDs are workspace-local. Empty emails never match (no false positives on legacy records).

**Builder — `buildReconciliation(localMembers, localEntries, importedMembers, importedEntries)`:**
- Walks each imported member. If their email exists locally → push to `matched`; otherwise → `unmatched` (with `entryCount` for the summary).
- Within each matched pair, classifies every imported entry against the local set by `(kind, date)`:
  - no same-day same-kind local entry → `new` (default-selected)
  - same `durationMin` → `duplicate` (default-unselected)
  - different `durationMin` → `conflict` (default-unselected, surfaced with a warning)
- Sorts each member's diffs newest-first; returns a `totals` block for the header summary card.

**Selection model:** `defaultReconcileSelection(result)` seeds a `Set<string>` of imported entry IDs containing only the `new` ones. The page tracks this set as React state; per-row and per-member master checkboxes mutate it.

**Apply — `DataProvider.applyReconciliation(entries)`:**
- Stamped with local `memberId` by the page before being handed off (emails matched, IDs differ).
- Maintains a **working copy** of overtime entries per member: new OT records are added first, then time-offs are walked in date order, running `planConsumption` against the running working copy each time.
- **Tolerant batch**: if a time-off can't be fully settled (insufficient balance), it's skipped silently rather than aborting — the import still applies everything that does fit, and the toast reports `imported` and `settledTimeoffs` counts so HR sees the gap.
- Commits via `commitTimeoffBatchWithConsumption(timeoffsToAdd, allTouchedOTUpdates)` — single IDB transaction over the whole import, atomic on the database side.

**Conflict policy:** "import adds alongside, never replaces." The reconcile UI surfaces an inline warning showing the local entry's duration so HR can decide; checking the conflict box adds a second entry on the same day.

**Bundle:** the Reconcile chunk is ~12.6 kB raw / 4.1 kB gz, lazy-loaded behind its route.

## 16. Mobile drawer nav

The desktop sidebar uses `hidden sm:flex`, so below the `sm` breakpoint there was no navigation surface at all. `AppShell.tsx` now also renders a `<MobileNav>` at the top of `<main>` (visible only `< sm`) — a hamburger button that opens a left-side `Sheet` (shadcn primitive on top of Radix Dialog).

To avoid drift, the sidebar body lives in a single `<SidebarContents>` component that both the desktop `<aside>` and the mobile `<SheetContent>` render. Tapping any `NavLink` fires an `onNavigate` callback that closes the sheet (`setOpen(false)`); on desktop the prop is undefined and nav clicks are pure routing.

A11y: `SheetTitle` is rendered `sr-only` to satisfy Radix Dialog's title requirement; the hamburger has `aria-label="Open navigation menu"`.

## 17. Member search

`src/lib/searchMembers.ts` exports a single pure helper `matchMembers(query, members)` — trims the query, lowercases, then filters on `name` OR `email` substring. Empty query returns the input unchanged.

Wired in two places:

- **Dashboard** — input above the member grid; filter applies to the grid only. Stat cards and team-tab counts stay reflecting the full active-team list.
- **Reports member checklist** — input above the list. Search filters which rows render; bulk "Select all" and the `selectedIds.size / members.length` heading still operate on the unfiltered list (intentional v1 trade-off; revisit if HR finds it confusing).

6 unit tests in `src/lib/__tests__/searchMembers.test.ts` (empty, whitespace, name match, email match, no match, trim).

## 18. Company holidays

Stored as optional `AppSettings.holidays: string[]` of `"YYYY-MM-DD"` dates. Optional → readers default to `[]`, no IDB migration.

`expandRangeToWorkdays(from, to, excludeWeekends, holidays?: ReadonlySet<string>)` gained an optional fourth arg. When provided, dates in the set are skipped in addition to weekends. `countWorkdaysInRange` passes through.

`HolidaysManager` (Settings card between Teams and Appearance) renders the list, lets HR add via `DayPicker` + Add button, and remove via trash button. Persists via the existing `updateSettings` channel. `PlanTimeOffDialog` reads `settings.holidays`, builds a `Set` once via `useMemo`, and passes it to `expandRangeToWorkdays` so the live preview and the batched commit both honor the same skip set.

4 new tests in `workdays.test.ts` cover holiday inside the range, holiday-on-weekend no-op (already excluded), weekend-holiday with weekends included, all-workdays-holidays returns empty.

## 19. Member archive (soft-delete)

`Member.archivedAt?: number` — optional timestamp; absence means active. `removeMember` still exists (and now records a `member.delete` audit event with the cascaded entry count); archive is the recommended path that preserves entry history for back-dated reports.

DataProvider gains `archiveMember(id)` / `unarchiveMember(id)` callbacks (thin wrappers around `saveMember` that set/clear the field). `useVisibleMembers()` filters out archived in addition to the team filter, so Dashboard / Calendar / Reports / team-tab counts hide archived members consistently. A new `useArchivedMembers()` hook returns just the archived set, for Dashboard's "Archived (N)" expandable disclosure at the bottom of the page (cards render at `opacity-70`).

MemberDetail surfaces archive state with a banner above the page header + a Restore button; the entry-add buttons (Log overtime, Log time off, Plan time off) hide when archived. The destructive delete remains as a separate "Delete forever" action whose copy nudges users toward Archive first.

## 20. Audit log (`/audit`, IDB v4)

Append-only mutation log. Every state-changing call writes an event after the primary commit. Failures to write audit events are caught and logged via `console.error` — never block the primary mutation, so editing remains reliable even if the audit store has trouble.

**Event kinds (`AuditEventKind` union):**

| Domain    | Kinds                                                         |
| --------- | ------------------------------------------------------------- |
| Members   | `member.add` / `update` / `delete` / `archive` / `unarchive`  |
| Entries   | `entry.add` / `entry.delete` / `entry.update` *(reserved)*    |
| Time off  | `timeoff.batch` (range flow)                                  |
| Teams     | `team.add` / `team.update` / `team.delete`                    |
| Workspace | `settings.update` / `import.merge` / `import.replace` / `wipe`|
| HR flow   | `reconcile.apply`                                             |

Each event: `{ id, timestamp, kind, summary, payload? }`. `summary` is the free-text human-readable line shown in `/audit`. `payload` carries structured detail (`memberId`, counts, etc.) for future filtering.

**Write helpers** (`src/lib/db.ts`):
- `appendAuditEvent(event)` — writes one record.
- `listAuditEvents(limit?)` — returns events newest-first; `limit` slices the result.

**DataProvider** wraps each mutation with a `recordAudit(kind, summary, payload)` call (defined at module top, wraps `appendAuditEvent` with try/catch). Settings handles `import.merge` / `import.replace` / `wipe` directly (page-level) — the wipe path appends *after* `wipeAll` so the wipe entry is the first record of the freshly-cleared log.

**Page:** lazy-loaded `/audit` route shows newest-first with a free-text filter input that matches both `summary` and `kind`. Sidebar nav item (`ActivityIcon`) sits between Reconcile and Settings.

**Export/Import:** `ExportPayload.schemaVersion` bumps to 4 with optional `audit: AuditEvent[]`. `importAll` accepts v1/v2/v3 payloads (no audit) and v4 (audit included).

## 21. Team-aware labels

`memberLabel` setting was historically the only label driving Dashboard CTAs and Reports headings. For HR's multi-team workspace it doesn't fit — the QA team's button shouldn't say "New Engineer."

Resolution logic on Reports + Dashboard:

```ts
const activeTeam = activeTeamId === ALL_TEAMS ? null : teams.find((t) => t.id === activeTeamId);
const singleTeam = teams.length === 1 ? teams[0] : null;
const label = activeTeam?.name ?? singleTeam?.name ?? "Member";
```

- Specific team active → team name ("New QA")
- Single-team workspace (no team selected because there's nothing to choose) → that one team's name (gives the QA Manager "New QA" naturally)
- Multi-team workspace + "All teams" → generic "Member" / "Members"

`settings.memberLabel` is kept around as a workspace-default for the member-add form placeholders and CSV exports.

## 22. Roadmap notes

All locked + post-roadmap slices are now ✅. Lower-priority follow-ups remain in the backlog (calendar holiday visualization, Reports search/select sync, audit-log size cap, light-theme parity sweep).
