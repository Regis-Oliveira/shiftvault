import type { Entry } from "@/types";

/** Format minutes as `Hh MMm` (always two-digit minutes). */
export function formatMinutes(min: number): string {
	const sign = min < 0 ? "-" : "";
	const abs = Math.abs(min);
	const h = Math.floor(abs / 60);
	const m = abs % 60;
	return `${sign}${h}h ${m.toString().padStart(2, "0")}m`;
}

/** Net balance in minutes = overtime credited − time-off debited. */
export function memberBalance(entries: Entry[]): number {
	let balance = 0;
	for (const e of entries) {
		if (e.kind === "overtime") balance += e.durationMin;
		else balance -= e.durationMin;
	}
	return balance;
}

/** Sum overtime entries only. */
export function totalOvertime(entries: Entry[]): number {
	return entries.filter((e) => e.kind === "overtime").reduce((acc, e) => acc + e.durationMin, 0);
}

/** Sum time-off entries only. */
export function totalTimeOff(entries: Entry[]): number {
	return entries.filter((e) => e.kind === "timeoff").reduce((acc, e) => acc + e.durationMin, 0);
}
