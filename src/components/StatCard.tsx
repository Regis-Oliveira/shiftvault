import type { ReactNode } from "react";

import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface StatCardProps {
	icon?: ReactNode;
	label: string;
	value: string;
	className?: string;
}

export function StatCard({ icon, label, value, className }: StatCardProps) {
	return (
		<Card className={cn("gap-2 p-5", className)}>
			<div className="text-muted-foreground flex items-center gap-2 text-[11px] font-medium uppercase tracking-wider">
				{icon}
				{label}
			</div>
			<div className="font-mono text-2xl font-semibold tracking-tight tabular-nums">{value}</div>
		</Card>
	);
}
