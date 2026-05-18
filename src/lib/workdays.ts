import { toIsoDate } from "@/lib/entries";

/**
 * Expand an inclusive date range into a list of "YYYY-MM-DD" strings.
 * If `excludeWeekends` is true, Saturday + Sunday are skipped.
 * If `holidays` is provided, dates in that set are skipped too.
 * If `from` > `to`, the inputs are swapped so callers don't have to guard.
 */
export function expandRangeToWorkdays(
	from: Date,
	to: Date,
	excludeWeekends: boolean,
	holidays?: ReadonlySet<string>
): string[] {
	const [start, end] = from.getTime() <= to.getTime() ? [from, to] : [to, from];
	const days: string[] = [];
	const cursor = new Date(start.getFullYear(), start.getMonth(), start.getDate());
	const last = new Date(end.getFullYear(), end.getMonth(), end.getDate());
	while (cursor.getTime() <= last.getTime()) {
		const day = cursor.getDay(); // 0 = Sunday, 6 = Saturday
		const iso = toIsoDate(cursor);
		const isWeekend = day === 0 || day === 6;
		const isHoliday = holidays?.has(iso) ?? false;
		if ((!excludeWeekends || !isWeekend) && !isHoliday) {
			days.push(iso);
		}
		cursor.setDate(cursor.getDate() + 1);
	}
	return days;
}

/** Cheap wrapper around expandRangeToWorkdays — just the count, no allocations to discard. */
export function countWorkdaysInRange(
	from: Date,
	to: Date,
	excludeWeekends: boolean,
	holidays?: ReadonlySet<string>
): number {
	return expandRangeToWorkdays(from, to, excludeWeekends, holidays).length;
}
