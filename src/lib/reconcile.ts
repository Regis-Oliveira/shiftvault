import type { Entry, Member } from "@/types";

/** Classification for a single imported entry against the local dataset. */
export type EntryDiffStatus = "new" | "duplicate" | "conflict";

export interface EntryDiff {
	imported: Entry;
	status: EntryDiffStatus;
	/** When status is `duplicate` or `conflict`, the matching local entry. */
	localMatch?: Entry;
}

/** A pair of matched members (same email) plus per-entry diffs. */
export interface MemberDiff {
	local: Member;
	imported: Member;
	entries: EntryDiff[];
	counts: { new: number; duplicate: number; conflict: number };
}

export interface UnmatchedImportedMember {
	imported: Member;
	entryCount: number;
}

export interface ReconciliationResult {
	/** Members present on both sides matched by email. */
	matched: MemberDiff[];
	/** Imported members whose email doesn't exist in the local workspace yet. */
	unmatched: UnmatchedImportedMember[];
	/** Total counts across the whole import — handy for the page header summary. */
	totals: {
		matchedMembers: number;
		unmatchedMembers: number;
		newEntries: number;
		duplicateEntries: number;
		conflictEntries: number;
	};
}

function normaliseEmail(email: string | undefined): string {
	return (email ?? "").trim().toLowerCase();
}

/**
 * Diff an imported workspace dump against the local one.
 *
 * Matching rules (kept simple on purpose — HR can refine later by hand):
 * - Members match by **lowercased email**. Empty emails never match.
 * - Within a matched pair, an entry "matches" a local one when `(kind, date)` agree.
 *   - If `durationMin` is equal too → `duplicate` (skip-by-default).
 *   - If `durationMin` differs → `conflict` (skip-by-default, flagged for human review).
 *   - No same-day/same-kind local entry → `new` (the typical case; on by default).
 */
export function buildReconciliation(
	localMembers: Member[],
	localEntries: Entry[],
	importedMembers: Member[],
	importedEntries: Entry[]
): ReconciliationResult {
	const localByEmail = new Map<string, Member>();
	for (const m of localMembers) {
		const key = normaliseEmail(m.email);
		if (key) localByEmail.set(key, m);
	}

	const localEntriesByMember = new Map<string, Entry[]>();
	for (const e of localEntries) {
		const list = localEntriesByMember.get(e.memberId) ?? [];
		list.push(e);
		localEntriesByMember.set(e.memberId, list);
	}

	const importedEntriesByMember = new Map<string, Entry[]>();
	for (const e of importedEntries) {
		const list = importedEntriesByMember.get(e.memberId) ?? [];
		list.push(e);
		importedEntriesByMember.set(e.memberId, list);
	}

	const matched: MemberDiff[] = [];
	const unmatched: UnmatchedImportedMember[] = [];

	for (const importedMember of importedMembers) {
		const email = normaliseEmail(importedMember.email);
		const local = email ? localByEmail.get(email) : undefined;
		const importedMemberEntries = importedEntriesByMember.get(importedMember.id) ?? [];

		if (!local) {
			unmatched.push({ imported: importedMember, entryCount: importedMemberEntries.length });
			continue;
		}

		const localMemberEntries = localEntriesByMember.get(local.id) ?? [];
		const entries: EntryDiff[] = [];
		const counts = { new: 0, duplicate: 0, conflict: 0 };

		for (const imp of importedMemberEntries) {
			const sameDayKind = localMemberEntries.find(
				(le) => le.kind === imp.kind && le.date === imp.date
			);
			if (!sameDayKind) {
				entries.push({ imported: imp, status: "new" });
				counts.new += 1;
			} else if (sameDayKind.durationMin === imp.durationMin) {
				entries.push({ imported: imp, status: "duplicate", localMatch: sameDayKind });
				counts.duplicate += 1;
			} else {
				entries.push({ imported: imp, status: "conflict", localMatch: sameDayKind });
				counts.conflict += 1;
			}
		}

		// Sort entries newest-first so the review screen reads chronologically backward.
		entries.sort((a, b) =>
			a.imported.date < b.imported.date ? 1 : a.imported.date > b.imported.date ? -1 : 0
		);

		matched.push({ local, imported: importedMember, entries, counts });
	}

	const totals = {
		matchedMembers: matched.length,
		unmatchedMembers: unmatched.length,
		newEntries: matched.reduce((sum, m) => sum + m.counts.new, 0),
		duplicateEntries: matched.reduce((sum, m) => sum + m.counts.duplicate, 0),
		conflictEntries: matched.reduce((sum, m) => sum + m.counts.conflict, 0)
	};

	return { matched, unmatched, totals };
}

/**
 * Default selection: every "new" entry is checked, "duplicate" and "conflict" are unchecked.
 * Returns a Set of imported entry IDs the user has implicitly approved.
 */
export function defaultReconcileSelection(result: ReconciliationResult): Set<string> {
	const selected = new Set<string>();
	for (const m of result.matched) {
		for (const d of m.entries) {
			if (d.status === "new") selected.add(d.imported.id);
		}
	}
	return selected;
}
