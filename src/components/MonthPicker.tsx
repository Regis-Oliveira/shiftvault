import { format } from "date-fns";
import { CalendarIcon, ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatMonthString, isValidMonthString, parseMonthString } from "@/lib/report";
import { cn } from "@/lib/utils";

const MONTH_LABELS = [
	"Jan",
	"Feb",
	"Mar",
	"Apr",
	"May",
	"Jun",
	"Jul",
	"Aug",
	"Sep",
	"Oct",
	"Nov",
	"Dec"
] as const;

const MIN_YEAR = 1970;
const MAX_YEAR = 2100;

interface MonthPickerProps {
	value: string;
	onChange: (next: string) => void;
	id?: string;
	ariaLabel?: string;
	placeholder?: string;
	disabled?: boolean;
}

export function MonthPicker({
	value,
	onChange,
	id,
	ariaLabel,
	placeholder = "Pick a month",
	disabled = false
}: MonthPickerProps) {
	const valid = isValidMonthString(value);
	const today = new Date();
	const currentMonthIso = formatMonthString(today);
	const [open, setOpen] = useState(false);
	const initialYear = valid ? parseMonthString(value).getFullYear() : today.getFullYear();
	const [year, setYear] = useState<number>(initialYear);

	// When opening or when the controlled value changes, re-centre on the selected year.
	useEffect(() => {
		if (open) {
			const fallbackYear = new Date().getFullYear();
			setYear(valid ? parseMonthString(value).getFullYear() : fallbackYear);
		}
	}, [open, value, valid]);

	const selectedMonthIdx = valid ? parseMonthString(value).getMonth() : -1;
	const selectedYear = valid ? parseMonthString(value).getFullYear() : null;
	const triggerLabel = valid ? format(parseMonthString(value), "MMMM yyyy") : placeholder;

	function selectMonth(monthIdx: number) {
		const iso = `${year}-${String(monthIdx + 1).padStart(2, "0")}`;
		onChange(iso);
		setOpen(false);
	}

	function shiftYear(delta: number) {
		setYear((y) => {
			const next = y + delta;
			if (next < MIN_YEAR) return MIN_YEAR;
			if (next > MAX_YEAR) return MAX_YEAR;
			return next;
		});
	}

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
						"border-input bg-card flex h-10 w-full items-center gap-2 rounded-md border px-3 text-sm transition-[color,box-shadow] shadow-xs",
						"focus-visible:border-ring focus-visible:ring-ring/40 focus-visible:ring-[3px] outline-none",
						"aria-invalid:ring-destructive/30 aria-invalid:border-destructive",
						"disabled:pointer-events-none disabled:opacity-50",
						!valid && "text-muted-foreground"
					)}
				>
					<CalendarIcon aria-hidden="true" className="text-muted-foreground size-4 shrink-0" />
					<span className="flex-1 truncate text-left font-medium">{triggerLabel}</span>
				</button>
			</PopoverTrigger>
			<PopoverContent className="w-64 p-3" align="start">
				<div className="flex items-center justify-between">
					<Button
						type="button"
						variant="ghost"
						size="icon"
						aria-label="Previous year"
						disabled={year <= MIN_YEAR}
						onClick={() => shiftYear(-1)}
						className="size-8"
					>
						<ChevronLeftIcon aria-hidden="true" />
					</Button>
					<span className="text-sm font-semibold tracking-tight" aria-live="polite">
						{year}
					</span>
					<Button
						type="button"
						variant="ghost"
						size="icon"
						aria-label="Next year"
						disabled={year >= MAX_YEAR}
						onClick={() => shiftYear(1)}
						className="size-8"
					>
						<ChevronRightIcon aria-hidden="true" />
					</Button>
				</div>
				<div className="mt-3 grid grid-cols-3 gap-1.5">
					{MONTH_LABELS.map((label, idx) => {
						const iso = `${year}-${String(idx + 1).padStart(2, "0")}`;
						const isSelected = selectedYear === year && selectedMonthIdx === idx;
						const isCurrent = iso === currentMonthIso;
						return (
							<button
								key={label}
								type="button"
								aria-pressed={isSelected}
								aria-current={isCurrent ? "date" : undefined}
								onClick={() => selectMonth(idx)}
								className={cn(
									"h-9 rounded-md text-sm font-medium transition-colors",
									"focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
									isSelected
										? "bg-primary text-primary-foreground shadow-[var(--shadow-soft)]"
										: "hover:bg-accent hover:text-accent-foreground",
									!isSelected && isCurrent && "ring-ring/40 ring-1"
								)}
							>
								{label}
							</button>
						);
					})}
				</div>
				<div className="mt-3 flex items-center justify-between gap-2 border-t pt-3">
					<Button
						type="button"
						variant="ghost"
						size="sm"
						onClick={() => {
							onChange(currentMonthIso);
							setOpen(false);
						}}
					>
						This month
					</Button>
					{valid ? <span className="text-muted-foreground text-xs">{triggerLabel}</span> : null}
				</div>
			</PopoverContent>
		</Popover>
	);
}
