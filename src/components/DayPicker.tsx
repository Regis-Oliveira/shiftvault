import { format } from "date-fns";
import { CalendarIcon } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { DATE_FULL } from "@/lib/dateFormat";
import { toIsoDate } from "@/lib/entries";
import { cn } from "@/lib/utils";

interface DayPickerProps {
	/** Stored value — "YYYY-MM-DD" local-day string, or empty to show the placeholder. */
	value: string;
	onChange: (next: string) => void;
	id?: string;
	ariaLabel?: string;
	placeholder?: string;
	disabled?: boolean;
	/** Latest selectable day (inclusive). Pass `toIsoDate(new Date())` to disable future days. */
	max?: string;
}

function parseLocalDate(iso: string): Date | undefined {
	if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return undefined;
	const [y, m, d] = iso.split("-").map(Number);
	const date = new Date(y, m - 1, d);
	return Number.isNaN(date.getTime()) ? undefined : date;
}

export function DayPicker({
	value,
	onChange,
	id,
	ariaLabel,
	placeholder = "Pick a day",
	disabled = false,
	max
}: DayPickerProps) {
	const selected = parseLocalDate(value);
	const valid = selected !== undefined;
	const [open, setOpen] = useState(false);
	const [month, setMonth] = useState<Date>(selected ?? new Date());

	// Depend on the primitive `value` string, not on `selected` — `parseLocalDate` returns a fresh
	// Date object each render, which would re-fire this effect and trigger an infinite setState loop.
	useEffect(() => {
		if (open) setMonth(parseLocalDate(value) ?? new Date());
	}, [open, value]);

	const maxDate = max ? parseLocalDate(max) : undefined;
	const todayIso = toIsoDate(new Date());
	const triggerLabel = valid ? format(selected, DATE_FULL) : placeholder;

	function pick(date: Date | undefined) {
		if (!date) return;
		onChange(toIsoDate(date));
		setOpen(false);
	}

	function pickToday() {
		onChange(todayIso);
		setOpen(false);
	}

	const todayDisabled = maxDate
		? toIsoDate(maxDate) < todayIso // shouldn't happen — max should be ≥ today
		: false;

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<button
					type="button"
					id={id}
					aria-label={ariaLabel}
					aria-haspopup="dialog"
					aria-invalid={!valid || undefined}
					disabled={disabled}
					className={cn(
						"border-input bg-card flex h-10 w-full items-center gap-2 rounded-md border px-3 text-sm shadow-xs transition-[color,box-shadow]",
						"focus-visible:border-ring focus-visible:ring-ring/40 outline-none focus-visible:ring-[3px]",
						"aria-invalid:ring-destructive/30 aria-invalid:border-destructive",
						"disabled:pointer-events-none disabled:opacity-50",
						!valid && "text-muted-foreground"
					)}
				>
					<CalendarIcon aria-hidden="true" className="text-muted-foreground size-4 shrink-0" />
					<span className="flex-1 truncate text-left font-medium">{triggerLabel}</span>
				</button>
			</PopoverTrigger>
			<PopoverContent className="w-auto p-0" align="start">
				<Calendar
					mode="single"
					selected={selected}
					onSelect={pick}
					month={month}
					onMonthChange={setMonth}
					disabled={maxDate ? { after: maxDate } : undefined}
				/>
				<div className="flex items-center justify-between gap-2 border-t px-3 py-2">
					<Button
						type="button"
						variant="ghost"
						size="sm"
						onClick={pickToday}
						disabled={todayDisabled}
					>
						Today
					</Button>
					{valid ? <span className="text-muted-foreground text-xs">{triggerLabel}</span> : null}
				</div>
			</PopoverContent>
		</Popover>
	);
}
