import type { TimeoffReason } from "@/types";

/** Display order in pickers + filters. Unspecified sits last as the catch-all. */
export const TIMEOFF_REASONS: TimeoffReason[] = [
	"vacation",
	"sick",
	"comp",
	"personal",
	"unspecified"
];

/** Human-readable label used in Selects, badges, and CSV exports. */
export function timeoffReasonLabel(reason: TimeoffReason | undefined): string {
	switch (reason ?? "unspecified") {
		case "vacation":
			return "Vacation";
		case "sick":
			return "Sick";
		case "comp":
			return "Comp day";
		case "personal":
			return "Personal";
		case "unspecified":
			return "Unspecified";
	}
}

/** Defaults a possibly-undefined reason from older entries to "unspecified". */
export function normaliseTimeoffReason(reason: TimeoffReason | undefined): TimeoffReason {
	return reason ?? "unspecified";
}

/** Badge variant name + (optional) extra class for the colored chip per reason. */
export function timeoffReasonBadge(reason: TimeoffReason | undefined): {
	variant: "secondary" | "success" | "warning" | "destructive" | "outline";
	className?: string;
} {
	switch (reason ?? "unspecified") {
		case "vacation":
			return { variant: "secondary" };
		case "sick":
			return { variant: "destructive" };
		case "comp":
			return { variant: "success" };
		case "personal":
			return { variant: "outline" };
		case "unspecified":
			return { variant: "outline", className: "text-muted-foreground" };
	}
}
