import { CalendarDaysIcon, MinusIcon, PlusIcon } from "lucide-react";
import { Link } from "react-router-dom";

import { EntryFormDialog } from "@/components/EntryFormDialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { initialsFromName } from "@/lib/avatar";
import { formatMinutes, memberBalance } from "@/lib/hours";
import type { Entry, Member } from "@/types";

interface MemberCardProps {
	member: Member;
	entries: Entry[];
}

export function MemberCard({ member, entries }: MemberCardProps) {
	const balance = memberBalance(entries);
	const balanceVariant = balance > 0 ? "success" : balance < 0 ? "warning" : "secondary";

	return (
		<Card className="gap-5 p-6">
			<div className="flex items-center justify-between gap-3">
				<Link
					to={`/members/${member.id}`}
					className="group flex items-center gap-3 rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
				>
					<Avatar className="size-11">
						{member.avatarBase64 ? <AvatarImage src={member.avatarBase64} alt="" /> : null}
						<AvatarFallback>{initialsFromName(member.name)}</AvatarFallback>
					</Avatar>
					<div className="flex flex-col text-left">
						<span className="text-sm font-semibold leading-tight group-hover:underline">
							{member.name}
						</span>
						<span className="text-muted-foreground text-xs">
							{entries.length === 1 ? "1 entry" : `${entries.length} entries`}
						</span>
					</div>
				</Link>
				<Badge variant={balanceVariant} className="text-[11px]">
					{formatMinutes(balance)}
				</Badge>
			</div>

			<div className="flex flex-col gap-1">
				<span className="text-muted-foreground text-[11px] font-medium uppercase tracking-wider">
					Balance
				</span>
				<span className="font-mono text-2xl font-semibold tracking-tight tabular-nums">
					{formatMinutes(balance)}
				</span>
			</div>

			<div className="grid grid-cols-2 gap-2">
				<EntryFormDialog
					member={member}
					entries={entries}
					kind="overtime"
					trigger={
						<Button variant="outline" size="sm" className="border-success/40">
							<PlusIcon aria-hidden="true" className="text-success" />
							Overtime
						</Button>
					}
				/>
				<EntryFormDialog
					member={member}
					entries={entries}
					kind="timeoff"
					trigger={
						<Button variant="outline" size="sm" className="border-warning/40">
							<MinusIcon aria-hidden="true" className="text-warning" />
							Time off
						</Button>
					}
				/>
			</div>

			<Button asChild variant="ghost" size="sm" className="text-muted-foreground">
				<Link to={`/members/${member.id}`}>
					<CalendarDaysIcon aria-hidden="true" />
					View details
				</Link>
			</Button>
		</Card>
	);
}
