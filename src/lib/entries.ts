import type { Entry } from "@/types";

/** Convert a Date to the local "YYYY-MM-DD" string we store in `entry.date`. */
export function toIsoDate(date: Date): string {
	const y = date.getFullYear();
	const m = String(date.getMonth() + 1).padStart(2, "0");
	const d = String(date.getDate()).padStart(2, "0");
	return `${y}-${m}-${d}`;
}

/** Group entries by their local-date string. */
export function groupEntriesByDate(entries: Entry[]): Map<string, Entry[]> {
	const map = new Map<string, Entry[]>();
	for (const entry of entries) {
		const list = map.get(entry.date);
		if (list) list.push(entry);
		else map.set(entry.date, [entry]);
	}
	return map;
}

/** Filter entries to those whose `date` falls within the [start, end] (inclusive) window. */
export function entriesInRange(entries: Entry[], start: Date, end: Date): Entry[] {
	const startIso = toIsoDate(start);
	const endIso = toIsoDate(end);
	return entries.filter((e) => e.date >= startIso && e.date <= endIso);
}

/**
 * Resolve the task URLs on an entry. Prefers the canonical `taskUrls` array; falls
 * back to the legacy single `taskUrl` for v1 records. Always returns a fresh array.
 */
export function getTaskUrls(entry: Entry): string[] {
	if (entry.taskUrls && entry.taskUrls.length > 0) return [...entry.taskUrls];
	if (entry.taskUrl) return [entry.taskUrl];
	return [];
}
