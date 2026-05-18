import { format } from "date-fns";
import { CalendarRangeIcon } from "lucide-react";
import { type ReactNode, useEffect, useId, useMemo, useState } from "react";
import { toast } from "sonner";

import { DayPicker } from "@/components/DayPicker";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue
} from "@/components/ui/select";
import { useShiftVault } from "@/data/DataProvider";
import { DATE_MEDIUM } from "@/lib/dateFormat";
import { toIsoDate } from "@/lib/entries";
import { formatMinutes, memberBalance } from "@/lib/hours";
import { InsufficientHoursError } from "@/lib/settlement";
import { TIMEOFF_REASONS, timeoffReasonLabel } from "@/lib/timeoffReason";
import { cn } from "@/lib/utils";
import { expandRangeToWorkdays } from "@/lib/workdays";
import type { Entry, Member, TimeoffReason } from "@/types";

interface Props {
	member: Member;
	entries: Entry[];
	trigger: ReactNode;
}

function parseLocalDate(iso: string): Date | undefined {
	if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return undefined;
	const [y, m, d] = iso.split("-").map(Number);
	const date = new Date(y, m - 1, d);
	return Number.isNaN(date.getTime()) ? undefined : date;
}

export function PlanTimeOffDialog({ member, entries, trigger }: Props) {
	const [open, setOpen] = useState(false);
	const { addTimeoffBatch, settings } = useShiftVault();
	const today = toIsoDate(new Date());
	const fromId = useId();
	const toId = useId();
	const hoursId = useId();
	const weekendsId = useId();
	const noteId = useId();

	const reasonId = useId();
	const [from, setFrom] = useState<string>(today);
	const [to, setTo] = useState<string>(today);
	const [hoursPerDay, setHoursPerDay] = useState<number>(8);
	const [excludeWeekends, setExcludeWeekends] = useState<boolean>(true);
	const [reason, setReason] = useState<TimeoffReason>("unspecified");
	const [note, setNote] = useState<string>("");
	const [submitError, setSubmitError] = useState<string | null>(null);
	const [isSubmitting, setIsSubmitting] = useState(false);

	useEffect(() => {
		if (open) {
			const t = toIsoDate(new Date());
			setFrom(t);
			setTo(t);
			setHoursPerDay(8);
			setExcludeWeekends(true);
			setReason("unspecified");
			setNote("");
			setSubmitError(null);
		}
	}, [open]);

	const fromDate = parseLocalDate(from);
	const toDate = parseLocalDate(to);
	const validRange = Boolean(fromDate && toDate);
	const reversed = validRange && fromDate && toDate && fromDate.getTime() > toDate.getTime();
	const validHours = Number.isFinite(hoursPerDay) && hoursPerDay > 0 && hoursPerDay <= 24;

	const holidaySet = useMemo(() => new Set(settings.holidays ?? []), [settings.holidays]);

	const workdays = useMemo(() => {
		if (!fromDate || !toDate || !validHours) return [];
		return expandRangeToWorkdays(fromDate, toDate, excludeWeekends, holidaySet);
	}, [fromDate, toDate, excludeWeekends, validHours, holidaySet]);

	const durationMinPerDay = validHours ? Math.round(hoursPerDay * 60) : 0;
	const totalMin = durationMinPerDay * workdays.length;
	const currentBalance = memberBalance(entries);
	const afterBalance = currentBalance - totalMin;
	const enoughBank = totalMin === 0 ? true : totalMin <= currentBalance;
	const canSubmit = validRange && validHours && workdays.length > 0 && enoughBank && !isSubmitting;

	async function handleSubmit() {
		if (!canSubmit || !fromDate || !toDate) return;
		setSubmitError(null);
		setIsSubmitting(true);
		try {
			await addTimeoffBatch({
				memberId: member.id,
				dates: workdays,
				durationMinPerDay,
				note,
				timeoffReason: reason
			});
			toast.success(
				workdays.length === 1
					? `Logged ${formatMinutes(durationMinPerDay)} of time off`
					: `Logged ${workdays.length} days of time off for ${member.name}`,
				{
					description: formatRangeLabel(fromDate, toDate),
					duration: 4000
				}
			);
			setOpen(false);
		} catch (err) {
			if (err instanceof InsufficientHoursError) {
				setSubmitError(
					`Not enough banked overtime. Need ${formatMinutes(err.requestedMin)}, have ${formatMinutes(err.availableMin)}.`
				);
			} else {
				setSubmitError(err instanceof Error ? err.message : "Could not plan time off.");
			}
		} finally {
			setIsSubmitting(false);
		}
	}

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>{trigger}</DialogTrigger>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Plan time off · {member.name}</DialogTitle>
					<DialogDescription>
						Pick a date range. Each working day in the range becomes its own time-off entry and
						settles oldest overtime first.
					</DialogDescription>
				</DialogHeader>
				<div className="flex flex-col gap-5">
					<div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
						<div className="flex flex-col gap-1.5">
							<Label htmlFor={fromId}>From</Label>
							<DayPicker id={fromId} value={from} onChange={setFrom} ariaLabel="Start day" />
						</div>
						<div className="flex flex-col gap-1.5">
							<Label htmlFor={toId}>To</Label>
							<DayPicker id={toId} value={to} onChange={setTo} ariaLabel="End day" />
						</div>
					</div>

					<div className="flex flex-col gap-2">
						<Label htmlFor={hoursId}>Hours per workday</Label>
						<Input
							id={hoursId}
							type="number"
							inputMode="decimal"
							min={0.5}
							max={24}
							step={0.5}
							value={hoursPerDay}
							onChange={(event) => setHoursPerDay(Number(event.target.value))}
							aria-invalid={!validHours || undefined}
						/>
						<p className="text-muted-foreground text-xs">
							Default 8h. Use a smaller value for half-days (e.g. 4).
						</p>
					</div>

					<label
						htmlFor={weekendsId}
						className="border-border bg-background flex items-center gap-3 rounded-md border px-3 py-2.5"
					>
						<Checkbox
							id={weekendsId}
							checked={excludeWeekends}
							onCheckedChange={(checked) => setExcludeWeekends(checked === true)}
						/>
						<div className="flex-1">
							<span className="text-sm font-medium">Exclude weekends</span>
							<p className="text-muted-foreground text-xs">
								Saturdays and Sundays in the range are skipped.
							</p>
						</div>
					</label>

					<div className="flex flex-col gap-2">
						<Label htmlFor={reasonId}>Reason</Label>
						<Select value={reason} onValueChange={(v) => setReason(v as TimeoffReason)}>
							<SelectTrigger id={reasonId} className="w-full">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{TIMEOFF_REASONS.map((r) => (
									<SelectItem key={r} value={r}>
										{timeoffReasonLabel(r)}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>

					<div className="flex flex-col gap-2">
						<Label htmlFor={noteId}>
							Note <span className="text-muted-foreground text-xs font-normal">(optional)</span>
						</Label>
						<Input
							id={noteId}
							type="text"
							autoComplete="off"
							placeholder="Extra detail, e.g. ‘Q2 release postmortem'"
							value={note}
							onChange={(event) => setNote(event.target.value)}
						/>
					</div>

					<PreviewBox
						workdayCount={workdays.length}
						totalMin={totalMin}
						currentBalance={currentBalance}
						afterBalance={afterBalance}
						reversed={!!reversed}
						validRange={validRange}
						validHours={validHours}
						enoughBank={enoughBank}
					/>

					{submitError ? (
						<p className="text-destructive text-xs" role="alert">
							{submitError}
						</p>
					) : null}
				</div>

				<DialogFooter>
					<Button
						type="button"
						variant="ghost"
						onClick={() => setOpen(false)}
						disabled={isSubmitting}
					>
						Cancel
					</Button>
					<Button type="button" onClick={handleSubmit} disabled={!canSubmit}>
						<CalendarRangeIcon aria-hidden="true" />
						{workdays.length <= 1 ? "Plan time off" : `Plan ${workdays.length} days of time off`}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

interface PreviewBoxProps {
	workdayCount: number;
	totalMin: number;
	currentBalance: number;
	afterBalance: number;
	reversed: boolean;
	validRange: boolean;
	validHours: boolean;
	enoughBank: boolean;
}

function PreviewBox({
	workdayCount,
	totalMin,
	currentBalance,
	afterBalance,
	reversed,
	validRange,
	validHours,
	enoughBank
}: PreviewBoxProps) {
	const tone =
		!validRange || !validHours || workdayCount === 0 ? "neutral" : enoughBank ? "ok" : "bad";

	return (
		<div
			className={cn(
				"border-border bg-background flex flex-col gap-2 rounded-lg border p-3 text-sm",
				tone === "ok" && "border-success/40",
				tone === "bad" && "border-destructive/50"
			)}
		>
			{reversed ? (
				<p className="text-muted-foreground text-xs">
					<span className="font-medium">Heads up:</span> end is before start — they'll be swapped
					automatically.
				</p>
			) : null}

			{!validRange ? (
				<p className="text-muted-foreground text-xs">Pick both a start and an end day.</p>
			) : !validHours ? (
				<p className="text-muted-foreground text-xs">Hours per day must be between 0.5 and 24.</p>
			) : workdayCount === 0 ? (
				<p className="text-muted-foreground text-xs">
					No working days in the range. Toggle off "Exclude weekends" or pick different days.
				</p>
			) : (
				<>
					<div className="flex items-baseline justify-between gap-2">
						<span className="font-medium">
							{workdayCount} working {workdayCount === 1 ? "day" : "days"}
						</span>
						<span className="font-mono">{formatMinutes(totalMin)}</span>
					</div>
					<div className="text-muted-foreground flex items-baseline justify-between gap-2 text-xs">
						<span>Bank</span>
						<span className="font-mono">
							<span className="text-foreground">{formatMinutes(currentBalance)}</span>
							<span className="mx-1">→</span>
							<span
								className={cn(
									"font-medium",
									enoughBank ? "text-success-foreground" : "text-destructive"
								)}
							>
								{formatMinutes(afterBalance)}
							</span>
						</span>
					</div>
					{!enoughBank ? (
						<p className="text-destructive text-xs">
							Not enough banked overtime to cover the full range.
						</p>
					) : null}
				</>
			)}
		</div>
	);
}

function formatRangeLabel(from: Date, to: Date): string {
	if (from.getTime() === to.getTime()) return format(from, DATE_MEDIUM);
	const [start, end] = from.getTime() <= to.getTime() ? [from, to] : [to, from];
	return `${format(start, DATE_MEDIUM)} → ${format(end, DATE_MEDIUM)}`;
}
