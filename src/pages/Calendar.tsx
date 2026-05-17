import { differenceInCalendarDays, endOfMonth, format, startOfMonth } from "date-fns";
import {
	CalendarDaysIcon,
	CalendarRangeIcon,
	ExternalLinkIcon,
	MinusIcon,
	PlusIcon,
	UsersRoundIcon
} from "lucide-react";
import { useMemo, useState } from "react";
import type { DateRange, DayButtonProps } from "react-day-picker";
import { Link } from "react-router-dom";

import { EmptyStateCard } from "@/components/EmptyStateCard";
import { PageHeader } from "@/components/PageHeader";
import { ReasonBadge } from "@/components/ReasonBadge";
import { StatCard } from "@/components/StatCard";
import { TeamTabs } from "@/components/TeamTabs";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Card } from "@/components/ui/card";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue
} from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useShiftVault, useVisibleMembers } from "@/data/DataProvider";
import { initialsFromName } from "@/lib/avatar";
import { DATE_MEDIUM, DATE_SHORT, MONTH_YEAR, WEEKDAY_FULL } from "@/lib/dateFormat";
import { entriesInRange, groupEntriesByDate, toIsoDate } from "@/lib/entries";
import { formatMinutes } from "@/lib/hours";
import { cn } from "@/lib/utils";
import type { Entry, Member } from "@/types";

const ALL_MEMBERS = "__all__";
type Mode = "day" | "range";

export function CalendarPage() {
	const { entries, isLoading } = useShiftVault();
	const members = useVisibleMembers();
	const [memberFilter, setMemberFilter] = useState<string>(ALL_MEMBERS);
	const [month, setMonth] = useState<Date>(startOfMonth(new Date()));
	const [mode, setMode] = useState<Mode>("day");
	const [selectedDay, setSelectedDay] = useState<Date | undefined>(new Date());
	const [selectedRange, setSelectedRange] = useState<DateRange | undefined>(undefined);

	if (isLoading) {
		return <p className="text-muted-foreground text-sm">Loading…</p>;
	}

	if (members.length === 0) {
		return (
			<div className="mx-auto max-w-7xl space-y-6">
				<PageHeader
					eyebrow="Team view"
					title="Calendar"
					description="Month-by-month overview of overtime and time off across the team."
				/>
				<EmptyStateCard
					icon={UsersRoundIcon}
					title="No members yet"
					description="Add a member from the dashboard to start tracking their hours on the calendar."
					action={
						<Button asChild>
							<Link to="/">Go to Dashboard</Link>
						</Button>
					}
				/>
			</div>
		);
	}

	const visibleMemberIds = new Set(members.map((m) => m.id));
	const teamScopedEntries = entries.filter((e) => visibleMemberIds.has(e.memberId));
	const filteredEntries =
		memberFilter === ALL_MEMBERS
			? teamScopedEntries
			: teamScopedEntries.filter((e) => e.memberId === memberFilter);
	const entriesByDate = groupEntriesByDate(filteredEntries);

	// The stats row reflects whatever scope the user is looking at:
	// in Range mode with a range picked, it's the range; otherwise it's the visible month.
	const rangeFrom = mode === "range" ? selectedRange?.from : undefined;
	const rangeTo = mode === "range" ? (selectedRange?.to ?? selectedRange?.from) : undefined;
	const hasRangeSelection = Boolean(rangeFrom && rangeTo);
	const statsEntries =
		hasRangeSelection && rangeFrom && rangeTo
			? entriesInRange(filteredEntries, rangeFrom, rangeTo)
			: entriesInRange(filteredEntries, startOfMonth(month), endOfMonth(month));
	const statsScopeLabel =
		hasRangeSelection && rangeFrom && rangeTo
			? rangeFrom.getTime() === rangeTo.getTime()
				? format(rangeFrom, DATE_MEDIUM)
				: `${format(rangeFrom, DATE_MEDIUM)} — ${format(rangeTo, DATE_MEDIUM)}`
			: format(month, MONTH_YEAR);
	const statsScopeKind = hasRangeSelection ? "Selected range" : "This month";
	const statsOvertimeMin = statsEntries
		.filter((e) => e.kind === "overtime")
		.reduce((sum, e) => sum + e.durationMin, 0);
	const statsTimeOffMin = statsEntries
		.filter((e) => e.kind === "timeoff")
		.reduce((sum, e) => sum + e.durationMin, 0);

	function handleModeChange(next: string) {
		if (next !== "day" && next !== "range") return;
		setMode(next);
		if (next === "range" && selectedDay && !selectedRange) {
			setSelectedRange({ from: selectedDay, to: selectedDay });
		}
		if (next === "day" && selectedRange?.from && !selectedDay) {
			setSelectedDay(selectedRange.from);
		}
	}

	const panelEntries =
		mode === "day"
			? selectedDay
				? (entriesByDate.get(toIsoDate(selectedDay)) ?? [])
				: []
			: selectedRange?.from
				? entriesInRange(
						filteredEntries,
						selectedRange.from,
						selectedRange.to ?? selectedRange.from
					)
				: [];

	return (
		<div className="mx-auto flex max-w-7xl flex-col gap-6 lg:h-full">
			<TeamTabs />
			<PageHeader
				eyebrow="Team view"
				title="Calendar"
				description="Orange cells are days someone was off, green cells are open overtime, a green ring marks overtime that's been paid out. Pick a day or switch to range mode to span months."
				actions={
					<Select value={memberFilter} onValueChange={setMemberFilter}>
						<SelectTrigger className="min-w-[200px]" aria-label="Filter by member">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value={ALL_MEMBERS}>All members</SelectItem>
							{members.map((m) => (
								<SelectItem key={m.id} value={m.id}>
									{m.name}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				}
			/>

			<section className="space-y-3">
				<div className="text-muted-foreground flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-xs">
					<span className="font-medium uppercase tracking-wider">{statsScopeKind}</span>
					<span aria-hidden="true">·</span>
					<span className="text-foreground font-semibold">{statsScopeLabel}</span>
				</div>
				<div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
					<StatCard
						icon={<CalendarDaysIcon aria-hidden="true" className="text-muted-foreground size-4" />}
						label="Entries"
						value={String(statsEntries.length)}
					/>
					<StatCard
						icon={<PlusIcon aria-hidden="true" className="text-success size-4" />}
						label="Overtime"
						value={formatMinutes(statsOvertimeMin)}
					/>
					<StatCard
						icon={<MinusIcon aria-hidden="true" className="text-warning size-4" />}
						label="Time off"
						value={formatMinutes(statsTimeOffMin)}
					/>
				</div>
			</section>

			<div className="grid grid-cols-1 gap-4 lg:min-h-0 lg:flex-1 lg:grid-cols-[auto_1fr]">
				<Card className="gap-3 self-start p-3 sm:p-4">
					<div className="flex items-center justify-between gap-2">
						<ToggleGroup
							type="single"
							value={mode}
							onValueChange={handleModeChange}
							size="sm"
							aria-label="Selection mode"
						>
							<ToggleGroupItem value="day" aria-label="Single day">
								<CalendarDaysIcon aria-hidden="true" />
								<span>Day</span>
							</ToggleGroupItem>
							<ToggleGroupItem value="range" aria-label="Date range">
								<CalendarRangeIcon aria-hidden="true" />
								<span>Range</span>
							</ToggleGroupItem>
						</ToggleGroup>
						{mode === "range" && selectedRange?.from ? (
							<Button
								variant="ghost"
								size="sm"
								className="text-muted-foreground"
								onClick={() => setSelectedRange(undefined)}
							>
								Clear range
							</Button>
						) : null}
					</div>
					{mode === "day" ? (
						<Calendar
							mode="single"
							selected={selectedDay}
							onSelect={setSelectedDay}
							month={month}
							onMonthChange={setMonth}
							components={{
								DayButton: (props) => <DayButtonWithDots {...props} entriesByDate={entriesByDate} />
							}}
						/>
					) : (
						<Calendar
							mode="range"
							selected={selectedRange}
							onSelect={setSelectedRange}
							month={month}
							onMonthChange={setMonth}
							numberOfMonths={2}
							components={{
								DayButton: (props) => <DayButtonWithDots {...props} entriesByDate={entriesByDate} />
							}}
						/>
					)}
				</Card>

				<SelectionPanel
					mode={mode}
					selectedDay={selectedDay}
					selectedRange={selectedRange}
					entries={panelEntries}
					members={members}
					memberFilter={memberFilter}
				/>
			</div>
		</div>
	);
}

interface DayButtonWithDotsProps extends DayButtonProps {
	entriesByDate: Map<string, Entry[]>;
}

function DayButtonWithDots({
	day,
	modifiers,
	className,
	entriesByDate,
	...rest
}: DayButtonWithDotsProps) {
	const iso = toIsoDate(day.date);
	const dayEntries = entriesByDate.get(iso) ?? [];
	const overtimeEntries = dayEntries.filter((e) => e.kind === "overtime");
	const hasOvertime = overtimeEntries.length > 0;
	const hasTimeoff = dayEntries.some((e) => e.kind === "timeoff");
	// "Settled" = every overtime entry on this day has been fully consumed by a time-off.
	const allOvertimeSettled =
		hasOvertime && overtimeEntries.every((e) => (e.consumedMin ?? 0) >= e.durationMin);
	const isSelected = modifiers.selected ?? false;
	const isRangeMiddle = modifiers.range_middle ?? false;
	const isRangeStartOrEnd = (modifiers.range_start ?? false) || (modifiers.range_end ?? false);
	const inversed = isSelected && !isRangeMiddle;
	// Cell-level fill: time-off is the louder signal (someone was actually off),
	// so it wins over an overtime tint on the same day. Selection / range states still override.
	const tint = !isSelected
		? hasTimeoff
			? "bg-warning-soft/60"
			: hasOvertime
				? allOvertimeSettled
					? null // muted — settled OT gets a ring instead, no fill
					: "bg-success-soft/40"
				: null
		: null;

	return (
		<button
			{...rest}
			className={cn(
				"focus-visible:outline-ring relative flex h-(--cell-size) w-(--cell-size) flex-col items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2",
				"data-[disabled=true]:text-muted-foreground/40 data-[disabled=true]:pointer-events-none",
				tint,
				// Settled-overtime accent: only render the ring when there's no fill (open-OT fill
				// would already imply the day matters; the ring is the "this was paid out" marker).
				!isSelected && allOvertimeSettled && !hasTimeoff && "ring-success/40 ring-1 ring-inset",
				isRangeStartOrEnd && "bg-primary text-primary-foreground",
				isRangeMiddle && "bg-accent text-accent-foreground rounded-none",
				!isSelected && "hover:bg-accent hover:text-accent-foreground",
				isSelected && !isRangeStartOrEnd && !isRangeMiddle && "bg-primary text-primary-foreground",
				className
			)}
		>
			<span className="leading-none">{day.date.getDate()}</span>
			{hasOvertime || hasTimeoff ? (
				<span aria-hidden="true" className="absolute bottom-1 flex gap-0.5">
					{hasOvertime ? (
						<span
							className={cn(
								"block size-1.5 rounded-full",
								inversed ? "bg-primary-foreground" : "bg-success"
							)}
						/>
					) : null}
					{hasTimeoff ? (
						<span
							className={cn(
								"block size-1.5 rounded-full",
								inversed ? "bg-primary-foreground" : "bg-warning"
							)}
						/>
					) : null}
				</span>
			) : null}
		</button>
	);
}

interface SelectionPanelProps {
	mode: Mode;
	selectedDay: Date | undefined;
	selectedRange: DateRange | undefined;
	entries: Entry[];
	members: Member[];
	memberFilter: string;
}

function SelectionPanel({
	mode,
	selectedDay,
	selectedRange,
	entries,
	members,
	memberFilter
}: SelectionPanelProps) {
	const memberById = useMemo(() => {
		const map = new Map<string, Member>();
		for (const m of members) map.set(m.id, m);
		return map;
	}, [members]);

	const heading = useMemo(() => {
		if (mode === "day") {
			if (!selectedDay) return null;
			return format(selectedDay, WEEKDAY_FULL);
		}
		if (!selectedRange?.from) return null;
		const from = selectedRange.from;
		const to = selectedRange.to ?? from;
		const sameDay = differenceInCalendarDays(to, from) === 0;
		if (sameDay) return format(from, WEEKDAY_FULL);
		return `${format(from, DATE_MEDIUM)} — ${format(to, DATE_MEDIUM)}`;
	}, [mode, selectedDay, selectedRange]);

	const subheading = useMemo(() => {
		if (mode === "range" && selectedRange?.from) {
			const to = selectedRange.to ?? selectedRange.from;
			const days = differenceInCalendarDays(to, selectedRange.from) + 1;
			return `${days} ${days === 1 ? "day" : "days"} · ${entries.length} ${entries.length === 1 ? "entry" : "entries"}`;
		}
		return undefined;
	}, [mode, selectedRange, entries.length]);

	if (!heading) {
		return (
			<Card className="text-muted-foreground self-start p-8 text-sm">
				{mode === "day"
					? "Pick a day to see its entries."
					: "Pick a start day, then an end day to see entries in that range."}
			</Card>
		);
	}

	const overtimeTotal = entries
		.filter((e) => e.kind === "overtime")
		.reduce((sum, e) => sum + e.durationMin, 0);
	const timeoffTotal = entries
		.filter((e) => e.kind === "timeoff")
		.reduce((sum, e) => sum + e.durationMin, 0);

	return (
		<Card className="flex min-h-0 flex-col gap-4 p-5">
			<div className="flex flex-col gap-1">
				<span className="text-muted-foreground text-[11px] font-medium uppercase tracking-wider">
					{memberFilter === ALL_MEMBERS
						? "Team activity"
						: (memberById.get(memberFilter)?.name ?? "Member")}
				</span>
				<h2 className="text-lg font-semibold tracking-tight">{heading}</h2>
				{subheading ? <p className="text-muted-foreground text-xs">{subheading}</p> : null}
				<div className="mt-1 flex flex-wrap gap-1.5">
					{overtimeTotal > 0 ? (
						<Badge variant="success" className="font-mono text-[11px]">
							<PlusIcon aria-hidden="true" className="size-3" />
							{formatMinutes(overtimeTotal)} overtime
						</Badge>
					) : null}
					{timeoffTotal > 0 ? (
						<Badge variant="warning" className="font-mono text-[11px]">
							<MinusIcon aria-hidden="true" className="size-3" />
							{formatMinutes(timeoffTotal)} time off
						</Badge>
					) : null}
				</div>
			</div>

			{entries.length === 0 ? (
				<p className="text-muted-foreground text-sm">No entries in this selection.</p>
			) : (
				<ul
					className="-mr-2 flex min-h-0 flex-col gap-2 pr-2 lg:flex-1 lg:overflow-y-auto"
					aria-label={`Entries for ${heading}`}
				>
					{entries.map((entry) => (
						<CalendarEntryRow
							key={entry.id}
							entry={entry}
							member={memberById.get(entry.memberId)}
							showDate={mode === "range"}
						/>
					))}
				</ul>
			)}
		</Card>
	);
}

function CalendarEntryRow({
	entry,
	member,
	showDate
}: {
	entry: Entry;
	member: Member | undefined;
	showDate: boolean;
}) {
	const tone = entry.kind === "overtime" ? "success" : "warning";
	const Icon = entry.kind === "overtime" ? PlusIcon : MinusIcon;
	const dateLabel = showDate ? format(new Date(`${entry.date}T00:00:00`), DATE_SHORT) : null;
	return (
		<li className="border-border bg-background flex flex-col gap-2 rounded-lg border p-3">
			<div className="flex items-center justify-between gap-2">
				<Link
					to={member ? `/members/${member.id}` : "/"}
					className="group flex items-center gap-2 rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
				>
					<Avatar className="size-7">
						{member?.avatarBase64 ? <AvatarImage src={member.avatarBase64} alt="" /> : null}
						<AvatarFallback className="text-[10px]">
							{member ? initialsFromName(member.name) : "?"}
						</AvatarFallback>
					</Avatar>
					<span className="text-sm font-medium group-hover:underline">
						{member?.name ?? "Unknown"}
					</span>
					{dateLabel ? <span className="text-muted-foreground text-xs">· {dateLabel}</span> : null}
				</Link>
				<div className="flex items-center gap-1.5">
					{entry.kind === "timeoff" ? <ReasonBadge reason={entry.timeoffReason} /> : null}
					<Badge variant={tone} className="font-mono text-[11px]">
						<Icon aria-hidden="true" className="size-3" />
						{formatMinutes(entry.durationMin)}
					</Badge>
				</div>
			</div>
			{entry.taskUrl ? (
				<a
					href={entry.taskUrl}
					target="_blank"
					rel="noreferrer noopener"
					className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 truncate text-xs underline-offset-2 hover:underline"
				>
					<ExternalLinkIcon aria-hidden="true" className="size-3 shrink-0" />
					<span className="truncate">{entry.taskUrl}</span>
				</a>
			) : null}
			{entry.note ? <p className="text-muted-foreground text-xs">{entry.note}</p> : null}
		</li>
	);
}
