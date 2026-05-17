import { type IDBPDatabase, openDB } from "idb";
import type { AppSettings, Entry, Member, Team } from "@/types";

const DB_NAME = "shiftvault";
/**
 * Version 1 — initial schema: members, entries, settings.
 * Version 2 — settlement fields:
 *             - overtime entries gain `consumedMin: 0` (default)
 *             - timeoff entries gain `consumptions: []` (default)
 *             - members gain `email: ""` (legacy migration default; new members must provide one)
 * Version 3 — teams:
 *             - new `teams` store
 *             - members gain `teamId` (legacy migration backfills the auto-created "Default" team)
 *             No data deleted across any upgrade path.
 */
const DB_VERSION = 3;
const MEMBERS_STORE = "members";
const ENTRIES_STORE = "entries";
const SETTINGS_STORE = "settings";
const TEAMS_STORE = "teams";

const DEFAULT_TEAM_ID = "default-team";

export const DEFAULT_SETTINGS: AppSettings = {
	id: "app",
	themeMode: "system",
	memberLabel: "Member",
	workspaceName: "ShiftVault",
	maxBalanceMin: 48 * 60
};

let db: IDBPDatabase | null = null;

/** Test-only: close + null the singleton so the next call re-opens against a fresh IDB. */
export function _resetDbForTests(): void {
	if (db) db.close();
	db = null;
}

async function getDb(): Promise<IDBPDatabase> {
	if (!db) {
		db = await openDB(DB_NAME, DB_VERSION, {
			async upgrade(database, oldVersion, _newVersion, tx) {
				if (!database.objectStoreNames.contains(MEMBERS_STORE)) {
					database.createObjectStore(MEMBERS_STORE, { keyPath: "id" });
				}
				if (!database.objectStoreNames.contains(ENTRIES_STORE)) {
					const store = database.createObjectStore(ENTRIES_STORE, { keyPath: "id" });
					store.createIndex("by-member", "memberId");
					store.createIndex("by-date", "date");
				}
				if (!database.objectStoreNames.contains(SETTINGS_STORE)) {
					database.createObjectStore(SETTINGS_STORE, { keyPath: "id" });
				}
				if (!database.objectStoreNames.contains(TEAMS_STORE)) {
					database.createObjectStore(TEAMS_STORE, { keyPath: "id" });
				}

				// v1 → v2: backfill `email` on members and `consumedMin`/`consumptions` on entries.
				if (oldVersion < 2 && oldVersion > 0) {
					const memberStore = tx.objectStore(MEMBERS_STORE);
					for await (const cursor of memberStore.iterate()) {
						const m = cursor.value as Member;
						if (m.email === undefined) {
							await cursor.update({ ...m, email: "" });
						}
					}
					const entryStore = tx.objectStore(ENTRIES_STORE);
					for await (const cursor of entryStore.iterate()) {
						const e = cursor.value as Entry;
						const patched: Entry = {
							...e,
							consumedMin: e.consumedMin ?? (e.kind === "overtime" ? 0 : undefined),
							consumptions: e.consumptions ?? (e.kind === "timeoff" ? [] : undefined)
						};
						await cursor.update(patched);
					}
				}

				// v2 → v3: create a "Default" team and backfill every existing member's teamId.
				if (oldVersion < 3 && oldVersion > 0) {
					const teamStore = tx.objectStore(TEAMS_STORE);
					const existingDefault = await teamStore.get(DEFAULT_TEAM_ID);
					if (!existingDefault) {
						const defaultTeam: Team = {
							id: DEFAULT_TEAM_ID,
							name: "Default",
							sortOrder: 0,
							createdAt: Date.now()
						};
						await teamStore.put(defaultTeam);
					}
					const memberStore = tx.objectStore(MEMBERS_STORE);
					for await (const cursor of memberStore.iterate()) {
						const m = cursor.value as Member;
						if (!m.teamId) {
							await cursor.update({ ...m, teamId: DEFAULT_TEAM_ID });
						}
					}
				}
			}
		});
	}
	return db;
}

// ─── Members ─────────────────────────────────────────────────────────────────

export async function listMembers(): Promise<Member[]> {
	const database = await getDb();
	const all: Member[] = await database.getAll(MEMBERS_STORE);
	return all.sort((a, b) => a.createdAt - b.createdAt);
}

export async function getMember(id: string): Promise<Member | undefined> {
	const database = await getDb();
	return database.get(MEMBERS_STORE, id);
}

export async function saveMember(member: Member): Promise<void> {
	const database = await getDb();
	await database.put(MEMBERS_STORE, member);
}

export async function deleteMember(id: string): Promise<void> {
	const database = await getDb();
	const tx = database.transaction([MEMBERS_STORE, ENTRIES_STORE], "readwrite");
	const entriesIdx = tx.objectStore(ENTRIES_STORE).index("by-member");
	const cursorKeys = await entriesIdx.getAllKeys(id);
	await Promise.all([
		tx.objectStore(MEMBERS_STORE).delete(id),
		...cursorKeys.map((k) => tx.objectStore(ENTRIES_STORE).delete(k))
	]);
	await tx.done;
}

// ─── Teams ───────────────────────────────────────────────────────────────────

export async function listTeams(): Promise<Team[]> {
	const database = await getDb();
	const all: Team[] = await database.getAll(TEAMS_STORE);
	return all.sort((a, b) => {
		if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
		return a.createdAt - b.createdAt;
	});
}

export async function saveTeam(team: Team): Promise<void> {
	const database = await getDb();
	await database.put(TEAMS_STORE, team);
}

export class TeamHasMembersError extends Error {
	readonly memberCount: number;
	constructor(memberCount: number) {
		super(
			`Cannot delete this team — it still has ${memberCount} member${memberCount === 1 ? "" : "s"} assigned. Move or remove them first.`
		);
		this.name = "TeamHasMembersError";
		this.memberCount = memberCount;
	}
}

/**
 * Delete a team if no members are assigned to it. Throws TeamHasMembersError otherwise so
 * the UI can show a helpful inline message instead of silently failing.
 */
export async function deleteTeam(id: string): Promise<void> {
	const database = await getDb();
	const all: Member[] = await database.getAll(MEMBERS_STORE);
	const assigned = all.filter((m) => m.teamId === id);
	if (assigned.length > 0) {
		throw new TeamHasMembersError(assigned.length);
	}
	await database.delete(TEAMS_STORE, id);
}

/**
 * Ensure at least one team exists. Called on app boot so brand-new workspaces (no IDB
 * migration history) get a "Default" team automatically, just like upgraded workspaces.
 */
export async function ensureDefaultTeam(): Promise<Team> {
	const database = await getDb();
	const existing: Team[] = await database.getAll(TEAMS_STORE);
	if (existing.length > 0) {
		return existing.sort((a, b) => a.sortOrder - b.sortOrder)[0];
	}
	const team: Team = {
		id: DEFAULT_TEAM_ID,
		name: "Default",
		sortOrder: 0,
		createdAt: Date.now()
	};
	await database.put(TEAMS_STORE, team);
	return team;
}

// ─── Entries ─────────────────────────────────────────────────────────────────

export async function listEntries(memberId?: string): Promise<Entry[]> {
	const database = await getDb();
	const all: Entry[] = memberId
		? await database.getAllFromIndex(ENTRIES_STORE, "by-member", memberId)
		: await database.getAll(ENTRIES_STORE);
	return all.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

export async function saveEntry(entry: Entry): Promise<void> {
	const database = await getDb();
	await database.put(ENTRIES_STORE, entry);
}

export async function deleteEntry(id: string): Promise<void> {
	const database = await getDb();
	await database.delete(ENTRIES_STORE, id);
}

/**
 * Atomic: write a time-off entry while updating the overtime entries it consumed.
 * If any of the OT IDs are missing or have insufficient available minutes the
 * transaction is aborted and an error is thrown.
 */
export async function commitTimeoffWithConsumption(
	timeoff: Entry,
	updatedOvertime: Entry[]
): Promise<void> {
	const database = await getDb();
	const tx = database.transaction(ENTRIES_STORE, "readwrite");
	const store = tx.objectStore(ENTRIES_STORE);
	await Promise.all([store.put(timeoff), ...updatedOvertime.map((ot) => store.put(ot))]);
	await tx.done;
}

/**
 * Atomic: write N new time-off entries + the union of every overtime they touched, in one tx.
 * Used by the "Plan time off" range flow so partial writes can't leave the bank inconsistent.
 */
export async function commitTimeoffBatchWithConsumption(
	timeoffs: Entry[],
	updatedOvertime: Entry[]
): Promise<void> {
	if (timeoffs.length === 0 && updatedOvertime.length === 0) return;
	const database = await getDb();
	const tx = database.transaction(ENTRIES_STORE, "readwrite");
	const store = tx.objectStore(ENTRIES_STORE);
	await Promise.all([
		...timeoffs.map((t) => store.put(t)),
		...updatedOvertime.map((ot) => store.put(ot))
	]);
	await tx.done;
}

/**
 * Atomic: delete a time-off entry and restore the consumed minutes on its referenced overtime entries.
 * Returns the restored overtime entries (after the write) so the caller can refresh local state.
 */
export async function commitTimeoffDeletionWithRestore(
	timeoffId: string,
	restoredOvertime: Entry[]
): Promise<void> {
	const database = await getDb();
	const tx = database.transaction(ENTRIES_STORE, "readwrite");
	const store = tx.objectStore(ENTRIES_STORE);
	await Promise.all([store.delete(timeoffId), ...restoredOvertime.map((ot) => store.put(ot))]);
	await tx.done;
}

// ─── Settings ────────────────────────────────────────────────────────────────

export async function loadSettings(): Promise<AppSettings> {
	const database = await getDb();
	const stored = (await database.get(SETTINGS_STORE, "app")) as AppSettings | undefined;
	return stored ?? DEFAULT_SETTINGS;
}

export async function saveSettings(settings: AppSettings): Promise<void> {
	const database = await getDb();
	await database.put(SETTINGS_STORE, settings);
}

// ─── Bulk export / import ────────────────────────────────────────────────────

export interface ExportPayload {
	/**
	 * 1 = original; 2 = adds consumedMin/consumptions + email; 3 = adds teams + Member.teamId.
	 * importAll auto-upgrades older payloads on read.
	 */
	schemaVersion: 1 | 2 | 3;
	exportedAt: number;
	members: Member[];
	entries: Entry[];
	settings: AppSettings;
	/** Present from v3 onward. v1/v2 payloads have this auto-created during import. */
	teams?: Team[];
}

export async function exportAll(): Promise<ExportPayload> {
	const [members, entries, settings, teams] = await Promise.all([
		listMembers(),
		listEntries(),
		loadSettings(),
		listTeams()
	]);
	return {
		schemaVersion: 3,
		exportedAt: Date.now(),
		members,
		entries,
		settings,
		teams
	};
}

export async function importAll(payload: ExportPayload, mode: "replace" | "merge"): Promise<void> {
	if (![1, 2, 3].includes(payload.schemaVersion)) {
		throw new Error(`Unsupported schema version: ${payload.schemaVersion}`);
	}
	const database = await getDb();
	const tx = database.transaction(
		[MEMBERS_STORE, ENTRIES_STORE, SETTINGS_STORE, TEAMS_STORE],
		"readwrite"
	);
	if (mode === "replace") {
		await Promise.all([
			tx.objectStore(MEMBERS_STORE).clear(),
			tx.objectStore(ENTRIES_STORE).clear(),
			tx.objectStore(TEAMS_STORE).clear()
		]);
	}
	// Upgrade pre-v3 payloads in-place: ensure a Default team exists, then attach it to any
	// members without a teamId. Replace mode wiped teams, so we need to create one here too.
	const upgradedTeams: Team[] =
		payload.teams && payload.teams.length > 0
			? payload.teams
			: [
					{
						id: DEFAULT_TEAM_ID,
						name: "Default",
						sortOrder: 0,
						createdAt: Date.now()
					}
				];
	const defaultTeamId = upgradedTeams[0].id;
	const upgradedMembers = payload.members.map((m) => ({
		...m,
		email: m.email ?? "",
		teamId: m.teamId ?? defaultTeamId
	}));
	const upgradedEntries = payload.entries.map((e) => ({
		...e,
		consumedMin: e.consumedMin ?? (e.kind === "overtime" ? 0 : undefined),
		consumptions: e.consumptions ?? (e.kind === "timeoff" ? [] : undefined)
	}));
	await Promise.all([
		...upgradedTeams.map((t) => tx.objectStore(TEAMS_STORE).put(t)),
		...upgradedMembers.map((m) => tx.objectStore(MEMBERS_STORE).put(m)),
		...upgradedEntries.map((e) => tx.objectStore(ENTRIES_STORE).put(e)),
		tx.objectStore(SETTINGS_STORE).put(payload.settings)
	]);
	await tx.done;
}

export async function wipeAll(): Promise<void> {
	const database = await getDb();
	const tx = database.transaction(
		[MEMBERS_STORE, ENTRIES_STORE, SETTINGS_STORE, TEAMS_STORE],
		"readwrite"
	);
	await Promise.all([
		tx.objectStore(MEMBERS_STORE).clear(),
		tx.objectStore(ENTRIES_STORE).clear(),
		tx.objectStore(SETTINGS_STORE).clear(),
		tx.objectStore(TEAMS_STORE).clear()
	]);
	await tx.done;
}

// ─── Storage quota ───────────────────────────────────────────────────────────

export async function getStorageEstimate(): Promise<{ usage: number; quota: number } | null> {
	if (typeof navigator === "undefined" || !navigator.storage?.estimate) return null;
	try {
		const { usage = 0, quota = 0 } = await navigator.storage.estimate();
		return { usage, quota };
	} catch {
		return null;
	}
}
