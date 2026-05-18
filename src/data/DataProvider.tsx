import {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useState
} from "react";

import {
	appendAuditEvent,
	commitTimeoffBatchWithConsumption,
	commitTimeoffDeletionWithRestore,
	commitTimeoffWithConsumption,
	DEFAULT_SETTINGS,
	deleteEntry,
	deleteMember,
	deleteTeam,
	ensureDefaultTeam,
	listEntries,
	listMembers,
	listTeams,
	loadSettings,
	saveSettings as persistSettings,
	saveEntry,
	saveMember,
	saveTeam
} from "@/lib/db";
import { formatMinutes } from "@/lib/hours";
import { newId } from "@/lib/id";
import {
	InsufficientHoursError,
	isSettled,
	planConsumption,
	planRestoration
} from "@/lib/settlement";
import type {
	AppSettings,
	AuditEvent,
	AuditEventKind,
	Entry,
	Member,
	Team,
	TimeoffReason
} from "@/types";

function audit(
	kind: AuditEventKind,
	summary: string,
	payload?: Record<string, unknown>
): AuditEvent {
	return { id: newId(), timestamp: Date.now(), kind, summary, payload };
}

async function recordAudit(
	kind: AuditEventKind,
	summary: string,
	payload?: Record<string, unknown>
): Promise<void> {
	try {
		await appendAuditEvent(audit(kind, summary, payload));
	} catch (err) {
		// Audit writes must never block primary mutations — log and continue.
		console.error("Failed to record audit event", kind, err);
	}
}

export interface TimeoffBatchInput {
	memberId: string;
	dates: string[];
	durationMinPerDay: number;
	note?: string;
	timeoffReason?: TimeoffReason;
}

/** Stand-in `activeTeamId` value meaning "no team filter — show every member". */
export const ALL_TEAMS = "__all__";

const ACTIVE_TEAM_STORAGE_KEY = "shiftvault.activeTeam";

interface DataContextValue {
	members: Member[];
	entries: Entry[];
	teams: Team[];
	settings: AppSettings;
	isLoading: boolean;
	activeTeamId: string;
	setActiveTeamId: (id: string) => void;
	refresh: () => Promise<void>;
	addMember: (member: Member) => Promise<void>;
	updateMember: (member: Member) => Promise<void>;
	removeMember: (id: string) => Promise<void>;
	archiveMember: (id: string) => Promise<void>;
	unarchiveMember: (id: string) => Promise<void>;
	addTeam: (team: Team) => Promise<void>;
	updateTeam: (team: Team) => Promise<void>;
	removeTeam: (id: string) => Promise<void>;
	addEntry: (entry: Entry) => Promise<void>;
	addTimeoffBatch: (input: TimeoffBatchInput) => Promise<void>;
	applyReconciliation: (entries: Entry[]) => Promise<{ imported: number; settledTimeoffs: number }>;
	updateEntry: (entry: Entry) => Promise<void>;
	removeEntry: (id: string) => Promise<void>;
	updateSettings: (next: Partial<AppSettings>) => Promise<void>;
	entriesForMember: (memberId: string) => Entry[];
}

const DataContext = createContext<DataContextValue | null>(null);

export class ConsumedOvertimeError extends Error {
	constructor() {
		super(
			"This overtime entry has already been paid out as time off. Delete the time-off entry that consumed it first."
		);
		this.name = "ConsumedOvertimeError";
	}
}

function readInitialActiveTeam(): string {
	if (typeof window === "undefined") return ALL_TEAMS;
	try {
		return window.localStorage.getItem(ACTIVE_TEAM_STORAGE_KEY) ?? ALL_TEAMS;
	} catch {
		return ALL_TEAMS;
	}
}

export function DataProvider({ children }: { children: ReactNode }) {
	const [members, setMembers] = useState<Member[]>([]);
	const [entries, setEntries] = useState<Entry[]>([]);
	const [teams, setTeams] = useState<Team[]>([]);
	const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
	const [isLoading, setIsLoading] = useState(true);
	const [activeTeamId, setActiveTeamIdState] = useState<string>(readInitialActiveTeam);

	const refresh = useCallback(async () => {
		// Make sure at least one team exists before we list — handles brand-new workspaces
		// that never went through the v2→v3 migration path.
		await ensureDefaultTeam();
		const [m, e, t, s] = await Promise.all([
			listMembers(),
			listEntries(),
			listTeams(),
			loadSettings()
		]);
		setMembers(m);
		setEntries(e);
		setTeams(t);
		setSettings(s);
	}, []);

	useEffect(() => {
		let cancelled = false;
		(async () => {
			try {
				await refresh();
			} finally {
				if (!cancelled) setIsLoading(false);
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [refresh]);

	const setActiveTeamId = useCallback((id: string) => {
		setActiveTeamIdState(id);
		try {
			window.localStorage.setItem(ACTIVE_TEAM_STORAGE_KEY, id);
		} catch {
			/* localStorage unavailable — non-fatal */
		}
	}, []);

	// If the currently-selected team gets deleted, fall back to "all teams" silently.
	useEffect(() => {
		if (activeTeamId === ALL_TEAMS) return;
		if (teams.length > 0 && !teams.some((t) => t.id === activeTeamId)) {
			setActiveTeamId(ALL_TEAMS);
		}
	}, [activeTeamId, teams, setActiveTeamId]);

	const addMember = useCallback(async (member: Member) => {
		await saveMember(member);
		setMembers((prev) => [...prev, member]);
		await recordAudit("member.add", `Added member "${member.name}"`, {
			memberId: member.id,
			name: member.name,
			email: member.email
		});
	}, []);

	const updateMember = useCallback(async (member: Member) => {
		await saveMember(member);
		setMembers((prev) => prev.map((m) => (m.id === member.id ? member : m)));
		await recordAudit("member.update", `Updated member "${member.name}"`, {
			memberId: member.id,
			name: member.name
		});
	}, []);

	const removeMember = useCallback(
		async (id: string) => {
			const member = members.find((m) => m.id === id);
			const entryCount = entries.filter((e) => e.memberId === id).length;
			await deleteMember(id);
			setMembers((prev) => prev.filter((m) => m.id !== id));
			setEntries((prev) => prev.filter((e) => e.memberId !== id));
			await recordAudit(
				"member.delete",
				`Deleted member "${member?.name ?? id}" (${entryCount} entries removed)`,
				{ memberId: id, name: member?.name, entryCount }
			);
		},
		[members, entries]
	);

	const archiveMember = useCallback(
		async (id: string) => {
			const member = members.find((m) => m.id === id);
			if (!member) return;
			const archived: Member = { ...member, archivedAt: Date.now() };
			await saveMember(archived);
			setMembers((prev) => prev.map((m) => (m.id === id ? archived : m)));
			await recordAudit("member.archive", `Archived "${member.name}"`, {
				memberId: id,
				name: member.name
			});
		},
		[members]
	);

	const unarchiveMember = useCallback(
		async (id: string) => {
			const member = members.find((m) => m.id === id);
			if (!member) return;
			const restored: Member = { ...member };
			delete restored.archivedAt;
			await saveMember(restored);
			setMembers((prev) => prev.map((m) => (m.id === id ? restored : m)));
			await recordAudit("member.unarchive", `Restored "${member.name}"`, {
				memberId: id,
				name: member.name
			});
		},
		[members]
	);

	const addTeam = useCallback(async (team: Team) => {
		await saveTeam(team);
		setTeams((prev) =>
			[...prev, team].sort((a, b) => {
				if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
				return a.createdAt - b.createdAt;
			})
		);
	}, []);

	const updateTeam = useCallback(async (team: Team) => {
		await saveTeam(team);
		setTeams((prev) =>
			prev
				.map((t) => (t.id === team.id ? team : t))
				.sort((a, b) => {
					if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
					return a.createdAt - b.createdAt;
				})
		);
	}, []);

	const removeTeam = useCallback(async (id: string) => {
		await deleteTeam(id); // throws TeamHasMembersError if members are assigned
		setTeams((prev) => prev.filter((t) => t.id !== id));
	}, []);

	const addEntry = useCallback(
		async (entry: Entry) => {
			if (entry.kind === "overtime") {
				const normalised: Entry = {
					...entry,
					consumedMin: entry.consumedMin ?? 0,
					consumptions: undefined
				};
				await saveEntry(normalised);
				setEntries((prev) => [normalised, ...prev]);
				const member = members.find((m) => m.id === entry.memberId);
				await recordAudit(
					"entry.add",
					`${member?.name ?? entry.memberId} logged ${formatMinutes(entry.durationMin)} overtime on ${entry.date}`,
					{
						entryId: entry.id,
						memberId: entry.memberId,
						kind: "overtime",
						date: entry.date,
						durationMin: entry.durationMin
					}
				);
				return;
			}

			// time-off: run FIFO over this member's overtime, then atomically write TO + updated OTs.
			const memberOvertime = entries.filter(
				(e) => e.memberId === entry.memberId && e.kind === "overtime"
			);
			const plan = planConsumption(memberOvertime, entry.durationMin);
			const timeoff: Entry = {
				...entry,
				consumedMin: undefined,
				consumptions: plan.consumptions
			};

			await commitTimeoffWithConsumption(timeoff, plan.updatedOvertime);

			const updatedById = new Map(plan.updatedOvertime.map((ot) => [ot.id, ot]));
			setEntries((prev) => {
				const next = prev.map((e) => updatedById.get(e.id) ?? e);
				return [timeoff, ...next];
			});
			const member = members.find((m) => m.id === entry.memberId);
			await recordAudit(
				"entry.add",
				`${member?.name ?? entry.memberId} took ${formatMinutes(entry.durationMin)} off on ${entry.date}`,
				{
					entryId: entry.id,
					memberId: entry.memberId,
					kind: "timeoff",
					date: entry.date,
					durationMin: entry.durationMin
				}
			);
		},
		[entries, members]
	);

	const addTimeoffBatch = useCallback(
		async (input: TimeoffBatchInput) => {
			if (input.dates.length === 0) return;
			const totalRequested = input.durationMinPerDay * input.dates.length;

			// Work against a mutable copy of the member's overtime entries so each day's FIFO
			// plan sees the consumedMin updates from the preceding days in the batch.
			const memberOT = entries
				.filter((e) => e.memberId === input.memberId && e.kind === "overtime")
				.map((e) => ({ ...e }));

			const totalAvailable = memberOT.reduce(
				(sum, ot) => sum + (ot.durationMin - (ot.consumedMin ?? 0)),
				0
			);
			if (totalAvailable < totalRequested) {
				throw new InsufficientHoursError(totalRequested, totalAvailable);
			}

			const newTimeoffs: Entry[] = [];
			const otByIdLatest = new Map<string, Entry>();
			const createdAtBase = Date.now();

			for (let i = 0; i < input.dates.length; i++) {
				const plan = planConsumption(memberOT, input.durationMinPerDay);
				const updatedById = new Map(plan.updatedOvertime.map((o) => [o.id, o]));
				for (let j = 0; j < memberOT.length; j++) {
					const updated = updatedById.get(memberOT[j].id);
					if (updated) memberOT[j] = updated;
				}
				for (const [id, ot] of updatedById) {
					otByIdLatest.set(id, ot);
				}
				newTimeoffs.push({
					id: newId(),
					memberId: input.memberId,
					kind: "timeoff",
					date: input.dates[i],
					durationMin: input.durationMinPerDay,
					consumedMin: undefined,
					consumptions: plan.consumptions,
					note: input.note?.trim() || undefined,
					timeoffReason: input.timeoffReason ?? "unspecified",
					createdAt: createdAtBase + i
				});
			}

			const finalOvertimes = Array.from(otByIdLatest.values());
			await commitTimeoffBatchWithConsumption(newTimeoffs, finalOvertimes);

			setEntries((prev) => {
				const overridesById = new Map(finalOvertimes.map((o) => [o.id, o]));
				const next = prev.map((e) => overridesById.get(e.id) ?? e);
				return [...newTimeoffs, ...next];
			});
		},
		[entries]
	);

	const applyReconciliation = useCallback(
		async (incoming: Entry[]) => {
			if (incoming.length === 0) return { imported: 0, settledTimeoffs: 0 };

			// Group incoming entries by member so each member's batch FIFO is independent.
			// Order: overtime entries first (so time-off FIFO has something to consume), then
			// time-off, sorted by date ASC within each kind so FIFO walks them chronologically.
			const overtimes = incoming.filter((e) => e.kind === "overtime");
			const timeoffs = incoming.filter((e) => e.kind === "timeoff");

			// Working copy of all OT for FIFO planning — start with current OT entries.
			const otByMember = new Map<string, Entry[]>();
			for (const e of entries) {
				if (e.kind !== "overtime") continue;
				const list = otByMember.get(e.memberId) ?? [];
				list.push({ ...e });
				otByMember.set(e.memberId, list);
			}
			// Add incoming overtime to working copy (so subsequent time-offs can consume them).
			const newOvertimes: Entry[] = [];
			for (const ot of overtimes) {
				const normalised: Entry = {
					...ot,
					consumedMin: 0,
					consumptions: undefined,
					createdAt: ot.createdAt || Date.now()
				};
				newOvertimes.push(normalised);
				const list = otByMember.get(normalised.memberId) ?? [];
				list.push({ ...normalised });
				otByMember.set(normalised.memberId, list);
			}

			// Sort time-offs by date ASC so FIFO consumes in the right chronological order.
			const sortedTimeoffs = [...timeoffs].sort((a, b) =>
				a.date < b.date ? -1 : a.date > b.date ? 1 : 0
			);

			const newTimeoffs: Entry[] = [];
			const finalOTById = new Map<string, Entry>();
			let settledCount = 0;

			for (const to of sortedTimeoffs) {
				const memberOT = otByMember.get(to.memberId) ?? [];
				try {
					const plan = planConsumption(memberOT, to.durationMin);
					const updatedById = new Map(plan.updatedOvertime.map((o) => [o.id, o]));
					for (let i = 0; i < memberOT.length; i++) {
						const updated = updatedById.get(memberOT[i].id);
						if (updated) memberOT[i] = updated;
					}
					otByMember.set(to.memberId, memberOT);
					for (const [id, updated] of updatedById) finalOTById.set(id, updated);
					newTimeoffs.push({
						...to,
						consumedMin: undefined,
						consumptions: plan.consumptions,
						createdAt: to.createdAt || Date.now()
					});
					settledCount += 1;
				} catch {}
			}

			const allEntriesToCommit = [...newOvertimes, ...newTimeoffs];
			const touchedOTs = Array.from(finalOTById.values());
			if (allEntriesToCommit.length === 0 && touchedOTs.length === 0) {
				return { imported: 0, settledTimeoffs: 0 };
			}

			await commitTimeoffBatchWithConsumption(allEntriesToCommit, touchedOTs);

			const overridesById = new Map(touchedOTs.map((o) => [o.id, o]));
			setEntries((prev) => {
				const next = prev.map((e) => overridesById.get(e.id) ?? e);
				return [...allEntriesToCommit, ...next];
			});

			return { imported: allEntriesToCommit.length, settledTimeoffs: settledCount };
		},
		[entries]
	);

	const updateEntry = useCallback(async (entry: Entry) => {
		// Editing isn't surfaced in the UI yet; pass-through for completeness.
		await saveEntry(entry);
		setEntries((prev) => prev.map((e) => (e.id === entry.id ? entry : e)));
	}, []);

	const removeEntry = useCallback(
		async (id: string) => {
			const target = entries.find((e) => e.id === id);
			if (!target) return;
			const member = members.find((m) => m.id === target.memberId);

			if (target.kind === "overtime") {
				if (isSettled(target) || (target.consumedMin ?? 0) > 0) {
					throw new ConsumedOvertimeError();
				}
				await deleteEntry(id);
				setEntries((prev) => prev.filter((e) => e.id !== id));
				await recordAudit(
					"entry.delete",
					`Removed ${member?.name ?? target.memberId}'s ${formatMinutes(target.durationMin)} overtime on ${target.date}`,
					{ entryId: id, memberId: target.memberId, kind: "overtime", date: target.date }
				);
				return;
			}

			// time-off: restore consumed minutes on referenced OTs in one transaction.
			const consumptions = target.consumptions ?? [];
			const memberOvertime = entries.filter(
				(e) => e.memberId === target.memberId && e.kind === "overtime"
			);
			const restored = planRestoration(memberOvertime, consumptions);
			await commitTimeoffDeletionWithRestore(id, restored);
			const restoredById = new Map(restored.map((ot) => [ot.id, ot]));
			setEntries((prev) => prev.filter((e) => e.id !== id).map((e) => restoredById.get(e.id) ?? e));
			await recordAudit(
				"entry.delete",
				`Removed ${member?.name ?? target.memberId}'s ${formatMinutes(target.durationMin)} time off on ${target.date}`,
				{ entryId: id, memberId: target.memberId, kind: "timeoff", date: target.date }
			);
		},
		[entries, members]
	);

	const updateSettings = useCallback(
		async (next: Partial<AppSettings>) => {
			const merged: AppSettings = { ...settings, ...next, id: "app" };
			await persistSettings(merged);
			setSettings(merged);
			await recordAudit("settings.update", "Workspace settings updated", {
				fields: Object.keys(next)
			});
		},
		[settings]
	);

	const entriesForMember = useCallback(
		(memberId: string) => entries.filter((e) => e.memberId === memberId),
		[entries]
	);

	const value = useMemo<DataContextValue>(
		() => ({
			members,
			entries,
			teams,
			settings,
			isLoading,
			activeTeamId,
			setActiveTeamId,
			refresh,
			addMember,
			updateMember,
			removeMember,
			archiveMember,
			unarchiveMember,
			addTeam,
			updateTeam,
			removeTeam,
			addEntry,
			addTimeoffBatch,
			applyReconciliation,
			updateEntry,
			removeEntry,
			updateSettings,
			entriesForMember
		}),
		[
			members,
			entries,
			teams,
			settings,
			isLoading,
			activeTeamId,
			setActiveTeamId,
			refresh,
			addMember,
			updateMember,
			removeMember,
			archiveMember,
			unarchiveMember,
			addTeam,
			updateTeam,
			removeTeam,
			addEntry,
			addTimeoffBatch,
			applyReconciliation,
			updateEntry,
			removeEntry,
			updateSettings,
			entriesForMember
		]
	);

	return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useShiftVault(): DataContextValue {
	const ctx = useContext(DataContext);
	if (!ctx) throw new Error("useShiftVault must be used inside <DataProvider>");
	return ctx;
}

/**
 * Members filtered by the currently-active team. Returns all members when ALL_TEAMS is selected
 * or when there's only one team (so single-team workspaces effectively get a flat view).
 *
 * Wrapped in useMemo so the returned array is reference-stable when the inputs are stable —
 * critical because consumers depend on `members` in `useEffect`. Without memoization,
 * `members.filter(...)` would produce a fresh array every render and infinite-loop any
 * effect that triggers state updates.
 */
export function useVisibleMembers(): Member[] {
	const { members, teams, activeTeamId } = useShiftVault();
	return useMemo(() => {
		const active = members.filter((m) => !m.archivedAt);
		if (activeTeamId === ALL_TEAMS || teams.length <= 1) return active;
		return active.filter((m) => m.teamId === activeTeamId);
	}, [members, teams.length, activeTeamId]);
}

/** Members that have been archived (soft-deleted). Used by the Dashboard restore section. */
export function useArchivedMembers(): Member[] {
	const { members } = useShiftVault();
	return useMemo(() => members.filter((m) => m.archivedAt), [members]);
}
