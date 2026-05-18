import { format } from "date-fns";
import { PlusIcon, Trash2Icon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { DayPicker } from "@/components/DayPicker";
import { Button } from "@/components/ui/button";
import { useShiftVault } from "@/data/DataProvider";
import { DATE_FULL } from "@/lib/dateFormat";

function parseLocalDate(iso: string): Date | null {
	if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
	const [y, m, d] = iso.split("-").map(Number);
	const date = new Date(y, m - 1, d);
	return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Manage the workspace's company-holiday list (`settings.holidays`). The plan-time-off range
 * flow uses this set to skip non-working days. Dates persist as "YYYY-MM-DD" strings via the
 * existing `updateSettings` channel — no IDB migration needed (field is optional on legacy
 * records).
 */
export function HolidaysManager() {
	const { settings, updateSettings } = useShiftVault();
	const [draft, setDraft] = useState<string>("");

	const holidays = (settings.holidays ?? []).slice().sort();

	async function handleAdd() {
		if (!draft) return;
		const date = parseLocalDate(draft);
		if (!date) {
			toast.error("Pick a valid date");
			return;
		}
		if (holidays.includes(draft)) {
			toast.info("That date is already a holiday");
			return;
		}
		const next = [...holidays, draft].sort();
		await updateSettings({ holidays: next });
		setDraft("");
		toast.success(`Added ${format(date, DATE_FULL)} as a holiday`);
	}

	async function handleRemove(iso: string) {
		const next = holidays.filter((d) => d !== iso);
		await updateSettings({ holidays: next });
		toast.success("Holiday removed");
	}

	return (
		<div className="flex flex-col gap-3">
			<ul aria-label="Company holidays" className="flex flex-col gap-2">
				{holidays.length === 0 ? (
					<li className="text-muted-foreground text-sm italic">
						No holidays yet. Add one below — they'll be skipped by the Plan time off flow.
					</li>
				) : (
					holidays.map((iso) => {
						const date = parseLocalDate(iso);
						return (
							<li
								key={iso}
								className="border-border bg-background flex items-center justify-between gap-3 rounded-md border px-3 py-2"
							>
								<span className="text-sm font-medium">{date ? format(date, DATE_FULL) : iso}</span>
								<Button
									type="button"
									variant="ghost"
									size="icon"
									aria-label={`Remove ${date ? format(date, DATE_FULL) : iso}`}
									className="text-muted-foreground hover:text-destructive size-8"
									onClick={() => handleRemove(iso)}
								>
									<Trash2Icon className="size-3.5" />
								</Button>
							</li>
						);
					})
				)}
			</ul>

			<div className="flex flex-wrap items-end gap-2">
				<div className="flex flex-1 flex-col gap-1.5">
					<DayPicker
						value={draft}
						onChange={setDraft}
						ariaLabel="Holiday date"
						placeholder="Pick a date"
					/>
				</div>
				<Button type="button" onClick={handleAdd} disabled={!draft}>
					<PlusIcon aria-hidden="true" />
					Add holiday
				</Button>
			</div>
			<p className="text-muted-foreground text-xs">
				Dates listed here are excluded from working-day counts when planning time off across a
				range.
			</p>
		</div>
	);
}
