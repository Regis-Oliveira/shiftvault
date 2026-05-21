import { endOfMonth, format, parseISO, startOfMonth } from "date-fns";

import { entriesInRange, getTaskUrls } from "@/lib/entries";
import { memberBalance, totalOvertime, totalTimeOff } from "@/lib/hours";
import { normaliseTimeoffReason } from "@/lib/timeoffReason";
import type { AppSettings, Entry, Member, TimeoffReason } from "@/types";

export interface MemberReport {
	memberId: string;
	name: string;
	overtimeMin: number;
	timeoffMin: number;
	balanceMin: number;
	entries: Entry[];
}

export interface ReportPayload {
	schemaVersion: 2;
	workspaceName: string;
	memberLabel: string;
	period: {
		/** "YYYY-MM" — earliest month included. */
		fromMonth: string;
		/** "YYYY-MM" — latest month included (may equal fromMonth). */
		toMonth: string;
		/** First local day, "YYYY-MM-DD". */
		fromIso: string;
		/** Last local day, "YYYY-MM-DD". */
		toIso: string;
		/** Human label — "May 2026" if single month, "March 2026 — May 2026" otherwise. */
		label: string;
	};
	generatedAt: number;
	members: MemberReport[];
	totals: {
		overtimeMin: number;
		timeoffMin: number;
		balanceMin: number;
		entryCount: number;
		memberCount: number;
	};
}

/** True if `s` matches the HTML month-input format and represents a real month. */
export function isValidMonthString(s: string): boolean {
	if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(s)) return false;
	const date = parseMonthString(s);
	return !Number.isNaN(date.getTime());
}

/** Parse a "YYYY-MM" string into a Date pinned to day 1 (local time). */
export function parseMonthString(month: string): Date {
	const [yearStr, monthStr] = month.split("-");
	const year = Number(yearStr);
	const monthIdx = Number(monthStr) - 1;
	return new Date(year, monthIdx, 1);
}

/** Format a Date into "YYYY-MM". */
export function formatMonthString(date: Date): string {
	const y = date.getFullYear();
	const m = String(date.getMonth() + 1).padStart(2, "0");
	return `${y}-${m}`;
}

export interface BuildReportOptions {
	/** Optional time-off reason filter. Undefined = include all. Includes all overtime regardless. */
	timeoffReason?: TimeoffReason;
	/**
	 * Optional override for the report's member-label heading. Caller is responsible for
	 * pluralization — the renderer prints this string as-is. Defaults to `settings.memberLabel`.
	 * Useful when filtering to a specific team so the heading reflects the team name.
	 */
	memberLabel?: string;
}

/**
 * Build a structured report for the inclusive range [fromMonth, toMonth].
 * Throws if either month is not a valid "YYYY-MM" string — call `isValidMonthString` first.
 */
export function buildReport(
	fromMonth: string,
	toMonth: string,
	selectedMemberIds: string[],
	allMembers: Member[],
	allEntries: Entry[],
	settings: AppSettings,
	options: BuildReportOptions = {}
): ReportPayload {
	if (!isValidMonthString(fromMonth)) {
		throw new RangeError(`Invalid fromMonth: ${JSON.stringify(fromMonth)}`);
	}
	if (!isValidMonthString(toMonth)) {
		throw new RangeError(`Invalid toMonth: ${JSON.stringify(toMonth)}`);
	}

	// Normalise so from <= to (swap if the user picked them backwards).
	const [normalisedFrom, normalisedTo] =
		fromMonth <= toMonth ? [fromMonth, toMonth] : [toMonth, fromMonth];

	const fromDate = parseMonthString(normalisedFrom);
	const toDate = parseMonthString(normalisedTo);
	const from = startOfMonth(fromDate);
	const to = endOfMonth(toDate);
	const fromIso = format(from, "yyyy-MM-dd");
	const toIso = format(to, "yyyy-MM-dd");
	const label =
		normalisedFrom === normalisedTo
			? format(fromDate, "MMMM yyyy")
			: `${format(fromDate, "MMMM yyyy")} — ${format(toDate, "MMMM yyyy")}`;

	const selectedIds = new Set(selectedMemberIds);
	const selectedMembers = allMembers.filter((m) => selectedIds.has(m.id));
	const entriesInWindow = entriesInRange(allEntries, from, to).filter((e) => {
		// Reason filter only narrows time-off; overtime always passes through.
		if (!options.timeoffReason) return true;
		if (e.kind !== "timeoff") return true;
		return normaliseTimeoffReason(e.timeoffReason) === options.timeoffReason;
	});

	const memberReports: MemberReport[] = selectedMembers.map((m) => {
		const entries = entriesInWindow
			.filter((e) => e.memberId === m.id)
			.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
		return {
			memberId: m.id,
			name: m.name,
			overtimeMin: totalOvertime(entries),
			timeoffMin: totalTimeOff(entries),
			balanceMin: memberBalance(entries),
			entries
		};
	});

	const totals = memberReports.reduce(
		(acc, m) => ({
			overtimeMin: acc.overtimeMin + m.overtimeMin,
			timeoffMin: acc.timeoffMin + m.timeoffMin,
			balanceMin: acc.balanceMin + m.balanceMin,
			entryCount: acc.entryCount + m.entries.length,
			memberCount: acc.memberCount + 1
		}),
		{ overtimeMin: 0, timeoffMin: 0, balanceMin: 0, entryCount: 0, memberCount: 0 }
	);

	return {
		schemaVersion: 2,
		workspaceName: settings.workspaceName,
		memberLabel: options.memberLabel ?? settings.memberLabel,
		period: {
			fromMonth: normalisedFrom,
			toMonth: normalisedTo,
			fromIso,
			toIso,
			label
		},
		generatedAt: Date.now(),
		members: memberReports,
		totals
	};
}

/** Escape a single CSV cell — wraps in quotes if it contains a comma, quote, or newline. */
export function csvCell(value: string | number | undefined | null): string {
	if (value === undefined || value === null) return "";
	const s = String(value);
	if (s === "") return "";
	if (/["\n,]/.test(s)) {
		return `"${s.replace(/"/g, '""')}"`;
	}
	return s;
}

const CSV_HEADER = [
	"workspace",
	"period",
	"member",
	"kind",
	"date",
	"duration_min",
	"duration_hours",
	"task_url",
	"timeoff_reason",
	"note"
] as const;

export function toCsv(payload: ReportPayload): string {
	const period =
		payload.period.fromMonth === payload.period.toMonth
			? payload.period.fromMonth
			: `${payload.period.fromMonth}..${payload.period.toMonth}`;
	const lines: string[] = [CSV_HEADER.join(",")];
	for (const memberReport of payload.members) {
		if (memberReport.entries.length === 0) {
			lines.push(
				[
					csvCell(payload.workspaceName),
					csvCell(period),
					csvCell(memberReport.name),
					"",
					"",
					"",
					"",
					"",
					"",
					""
				].join(",")
			);
			continue;
		}
		for (const entry of memberReport.entries) {
			const h = Math.floor(entry.durationMin / 60);
			const m = entry.durationMin % 60;
			const duration = `${h}h ${String(m).padStart(2, "0")}m`;
			lines.push(
				[
					csvCell(payload.workspaceName),
					csvCell(period),
					csvCell(memberReport.name),
					csvCell(entry.kind),
					csvCell(entry.date),
					csvCell(entry.durationMin),
					csvCell(duration),
					csvCell(getTaskUrls(entry).join(" | ")),
					csvCell(entry.kind === "timeoff" ? normaliseTimeoffReason(entry.timeoffReason) : ""),
					csvCell(entry.note ?? "")
				].join(",")
			);
		}
	}
	return lines.join("\n");
}

/** Filename slug for a report payload — "2026-05" or "2026-03_to_2026-05". */
export function reportFilenameSlug(payload: ReportPayload): string {
	if (payload.period.fromMonth === payload.period.toMonth) return payload.period.fromMonth;
	return `${payload.period.fromMonth}_to_${payload.period.toMonth}`;
}

const HISTORY_CSV_HEADER = [
	"workspace",
	"member",
	"email",
	"kind",
	"status",
	"date",
	"duration_min",
	"duration_hours",
	"consumed_min",
	"task_url",
	"timeoff_reason",
	"note",
	"created_at"
] as const;

/**
 * Flatten every entry in the workspace into one CSV — no period scoping.
 * Used by Settings → "Export full history (CSV)" so HR / payroll can see the audit trail.
 */
export function historyToCsv(workspaceName: string, members: Member[], entries: Entry[]): string {
	const memberById = new Map(members.map((m) => [m.id, m]));
	const lines: string[] = [HISTORY_CSV_HEADER.join(",")];
	const sorted = [...entries].sort((a, b) => {
		if (a.date !== b.date) return a.date < b.date ? -1 : 1;
		return a.createdAt - b.createdAt;
	});
	for (const entry of sorted) {
		const member = memberById.get(entry.memberId);
		const h = Math.floor(entry.durationMin / 60);
		const m = entry.durationMin % 60;
		const duration = `${h}h ${String(m).padStart(2, "0")}m`;
		const status =
			entry.kind === "overtime"
				? (entry.consumedMin ?? 0) >= entry.durationMin
					? "settled"
					: (entry.consumedMin ?? 0) > 0
						? "partial"
						: "open"
				: "withdrawn";
		lines.push(
			[
				csvCell(workspaceName),
				csvCell(member?.name ?? "<deleted>"),
				csvCell(member?.email ?? ""),
				csvCell(entry.kind),
				csvCell(status),
				csvCell(entry.date),
				csvCell(entry.durationMin),
				csvCell(duration),
				csvCell(entry.consumedMin ?? 0),
				csvCell(getTaskUrls(entry).join(" | ")),
				csvCell(entry.kind === "timeoff" ? normaliseTimeoffReason(entry.timeoffReason) : ""),
				csvCell(entry.note ?? ""),
				csvCell(new Date(entry.createdAt).toISOString())
			].join(",")
		);
	}
	return lines.join("\n");
}

export function downloadBlob(content: string, filename: string, mime: string): void {
	const blob = new Blob([content], { type: mime });
	const url = URL.createObjectURL(blob);
	const anchor = document.createElement("a");
	anchor.href = url;
	anchor.download = filename;
	anchor.style.display = "none";
	document.body.appendChild(anchor);
	anchor.click();
	document.body.removeChild(anchor);
	URL.revokeObjectURL(url);
}

/** Convert a stored date like "2026-05-14" → a Date at local midnight (no timezone shift). */
export function localDateFromIso(iso: string): Date {
	return parseISO(`${iso}T00:00:00`);
}
