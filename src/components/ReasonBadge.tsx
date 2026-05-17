import { Badge } from "@/components/ui/badge";
import {
	normaliseTimeoffReason,
	timeoffReasonBadge,
	timeoffReasonLabel
} from "@/lib/timeoffReason";
import { cn } from "@/lib/utils";
import type { TimeoffReason } from "@/types";

interface ReasonBadgeProps {
	reason: TimeoffReason | undefined;
	/** Render even for `unspecified`. Defaults to false so default entries don't add visual noise. */
	showUnspecified?: boolean;
	className?: string;
}

/**
 * Shared chip for time-off reason. Returns null for `unspecified` unless `showUnspecified` is set
 * (used in the form Select where every option must be visible). Everywhere else it's invisible
 * by default so legacy entries don't all sprout a generic badge.
 */
export function ReasonBadge({ reason, showUnspecified = false, className }: ReasonBadgeProps) {
	const normalised = normaliseTimeoffReason(reason);
	if (normalised === "unspecified" && !showUnspecified) return null;
	const { variant, className: badgeClass } = timeoffReasonBadge(normalised);
	return (
		<Badge variant={variant} className={cn("text-[10px]", badgeClass, className)}>
			{timeoffReasonLabel(normalised)}
		</Badge>
	);
}
