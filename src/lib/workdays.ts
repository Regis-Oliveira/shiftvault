import { toIsoDate } from "@/lib/entries";

/**
 * Expand an inclusive date range into a list of "YYYY-MM-DD" strings.
 * If `excludeWeekends` is true, Saturday + Sunday are skipped.
 * If `from` > `to`, the inputs are swapped so callers don't have to guard.
 */
export function expandRangeToWorkdays(from: Date, to: Date, excludeWeekends: boolean): string[] {
	const [start, end] = from.getTime() <= to.getTime() ? [from, to] : [to, from];
	const days: string[] = [];
	const cursor = new Date(start.getFullYear(), start.getMonth(), start.getDate());
	const last = new Date(end.getFullYear(), end.getMonth(), end.getDate());
	while (cursor.getTime() <= last.getTime()) {
		const day = cursor.getDay(); // 0 = Sunday, 6 = Saturday
		if (!excludeWeekends || (day !== 0 && day !== 6)) {
			days.push(toIsoDate(cursor));
		}
		cursor.setDate(cursor.getDate() + 1);
	}
	return days;
}

/** Cheap wrapper around expandRangeToWorkdays — just the count, no allocations to discard. */
export function countWorkdaysInRange(from: Date, to: Date, excludeWeekends: boolean): number {
	return expandRangeToWorkdays(from, to, excludeWeekends).length;
}
