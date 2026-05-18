export type ThemeMode = "light" | "dark" | "system";

export type EntryKind = "overtime" | "timeoff";

export type EntryStatus = "open" | "settled";

/**
 * Sub-category for a time-off entry. Optional on the type — older entries that predate this
 * field are treated as `unspecified` by readers, so no IDB migration is needed.
 */
export type TimeoffReason = "vacation" | "sick" | "comp" | "personal" | "unspecified";

/** Named palette slots for team color tags. Resolved to OKLCH in `src/lib/teamColor.ts`. */
export type TeamColor =
	| "slate"
	| "sky"
	| "emerald"
	| "amber"
	| "rose"
	| "violet"
	| "teal"
	| "fuchsia";

export interface Team {
	id: string;
	name: string;
	color?: TeamColor;
	sortOrder: number;
	createdAt: number;
}

export interface Member {
	id: string;
	name: string;
	/**
	 * Canonical workplace identifier — used to reconcile records between workspaces
	 * (e.g. when HR imports the QA manager's report). Required for every member;
	 * the create/edit form enforces a valid format and workspace-unique value.
	 */
	email: string;
	/**
	 * The team this member belongs to. Required since IDB v3; on legacy migrations
	 * the migration code backfills this with the auto-created "Default" team's id.
	 */
	teamId: string;
	avatarBase64?: string;
	createdAt: number;
}

/** One overtime entry the time-off withdrew from. */
export interface Consumption {
	overtimeEntryId: string;
	consumedMin: number;
}

export interface Entry {
	id: string;
	memberId: string;
	kind: EntryKind;
	/** ISO date string (YYYY-MM-DD) representing the day the work or time-off happened. */
	date: string;
	durationMin: number;
	/** Required for overtime entries; ignored for timeoff. */
	taskUrl?: string;
	note?: string;
	createdAt: number;
	/**
	 * Overtime-only: how many of its minutes have been consumed by time-off entries.
	 * `consumedMin === durationMin` means the entry is fully settled.
	 * Always a number for new entries (default 0); may be undefined on legacy v1 records
	 * — readers should treat undefined as 0.
	 */
	consumedMin?: number;
	/**
	 * Time-off-only: which overtime entries this time-off pulled from and by how much.
	 * Empty / undefined on legacy v1 records.
	 */
	consumptions?: Consumption[];
	/**
	 * Time-off-only: optional sub-category. Missing means "unspecified" — readers should
	 * default to that without bumping the schema version.
	 */
	timeoffReason?: TimeoffReason;
}

export interface AppSettings {
	id: "app";
	themeMode: ThemeMode;
	memberLabel: string;
	workspaceName: string;
	maxBalanceMin: number;
	/**
	 * Optional set of company holiday dates ("YYYY-MM-DD"). When present, the plan-time-off
	 * range flow skips these dates as non-working. Missing on legacy records — readers should
	 * default to `[]`. No IDB migration needed.
	 */
	holidays?: string[];
}
