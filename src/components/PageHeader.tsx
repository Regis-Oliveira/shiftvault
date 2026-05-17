import { ArrowLeftIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";

import { Button } from "@/components/ui/button";

interface PageHeaderProps {
	eyebrow: string;
	title: string;
	description?: ReactNode;
	backTo?: string;
	backLabel?: string;
	actions?: ReactNode;
}

export function PageHeader({
	eyebrow,
	title,
	description,
	backTo = "/",
	backLabel = "Back to Dashboard",
	actions
}: PageHeaderProps) {
	return (
		<div className="space-y-4">
			<Button asChild variant="ghost" size="sm" className="text-muted-foreground -ml-2">
				<Link to={backTo}>
					<ArrowLeftIcon aria-hidden="true" />
					{backLabel}
				</Link>
			</Button>
			<div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
				<div className="space-y-2">
					<p className="text-muted-foreground text-xs font-medium uppercase tracking-wider">
						{eyebrow}
					</p>
					<h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h1>
					{description ? (
						<p className="text-muted-foreground max-w-prose text-sm">{description}</p>
					) : null}
				</div>
				{actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
			</div>
		</div>
	);
}
