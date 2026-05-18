import { format } from "date-fns";
import { ActivityIcon, SearchIcon } from "lucide-react";
import { useEffect, useState } from "react";

import { EmptyStateCard } from "@/components/EmptyStateCard";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { DATE_FULL } from "@/lib/dateFormat";
import { listAuditEvents } from "@/lib/db";
import type { AuditEvent } from "@/types";

export function AuditPage() {
	const [events, setEvents] = useState<AuditEvent[] | null>(null);
	const [search, setSearch] = useState("");

	useEffect(() => {
		listAuditEvents().then(setEvents);
	}, []);

	if (events === null) {
		return <p className="text-muted-foreground text-sm">Loading…</p>;
	}

	const q = search.trim().toLowerCase();
	const visible = q
		? events.filter((e) => e.summary.toLowerCase().includes(q) || e.kind.toLowerCase().includes(q))
		: events;

	return (
		<div className="mx-auto max-w-7xl space-y-6">
			<PageHeader
				eyebrow="Workspace"
				title="Activity log"
				description="Every member, entry, settings, and import/wipe change recorded by this workspace, newest first."
			/>

			<div className="mx-auto w-full max-w-3xl space-y-4">
				{events.length === 0 ? (
					<EmptyStateCard
						icon={ActivityIcon}
						title="No activity yet"
						description="Once you add members or log entries, every change shows up here."
					/>
				) : (
					<>
						<div className="relative">
							<SearchIcon
								aria-hidden="true"
								className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
							/>
							<Input
								type="search"
								value={search}
								onChange={(e) => setSearch(e.target.value)}
								placeholder="Filter by summary or event kind"
								className="pl-9"
								aria-label="Filter activity"
							/>
						</div>

						{visible.length === 0 ? (
							<p className="text-muted-foreground text-sm">No events match "{search}".</p>
						) : (
							<Card className="gap-0 p-0">
								<ul className="divide-border divide-y">
									{visible.map((event) => (
										<AuditRow key={event.id} event={event} />
									))}
								</ul>
							</Card>
						)}
					</>
				)}
			</div>
		</div>
	);
}

function AuditRow({ event }: { event: AuditEvent }) {
	const when = new Date(event.timestamp);
	return (
		<li className="flex flex-col gap-1 px-4 py-3">
			<div className="flex flex-wrap items-baseline justify-between gap-2">
				<span className="text-sm">{event.summary}</span>
				<time
					className="text-muted-foreground shrink-0 font-mono text-xs tabular-nums"
					dateTime={when.toISOString()}
				>
					{format(when, DATE_FULL)} · {format(when, "HH:mm:ss")}
				</time>
			</div>
			<span className="text-muted-foreground font-mono text-[10px] uppercase tracking-wider">
				{event.kind}
			</span>
		</li>
	);
}
