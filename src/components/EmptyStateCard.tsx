import type { ComponentType, ReactNode, SVGProps } from "react";

import { Card } from "@/components/ui/card";

interface EmptyStateCardProps {
	icon: ComponentType<SVGProps<SVGSVGElement>>;
	title: string;
	description?: ReactNode;
	action?: ReactNode;
}

export function EmptyStateCard({ icon: Icon, title, description, action }: EmptyStateCardProps) {
	return (
		<Card className="p-10 text-center sm:p-14">
			<div className="bg-secondary text-secondary-foreground mx-auto flex size-14 items-center justify-center rounded-2xl">
				<Icon aria-hidden="true" className="size-7" />
			</div>
			<p className="mt-5 text-base font-semibold">{title}</p>
			{description ? (
				<p className="text-muted-foreground mx-auto mt-2 max-w-md text-sm">{description}</p>
			) : null}
			{action ? <div className="mt-6">{action}</div> : null}
		</Card>
	);
}
