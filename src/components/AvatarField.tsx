import { ImagePlusIcon, Trash2Icon } from "lucide-react";
import { useId, useRef, useState } from "react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { initialsFromName, readAvatarFile } from "@/lib/avatar";

interface AvatarFieldProps {
	name: string;
	value: string | undefined;
	onChange: (next: string | undefined) => void;
}

export function AvatarField({ name, value, onChange }: AvatarFieldProps) {
	const [error, setError] = useState<string | null>(null);
	const inputRef = useRef<HTMLInputElement>(null);
	const inputId = useId();

	async function handleFile(file: File) {
		setError(null);
		try {
			const dataUrl = await readAvatarFile(file);
			onChange(dataUrl);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Could not read image.");
		}
	}

	return (
		<div className="flex items-center gap-4">
			<Avatar className="size-16">
				{value ? <AvatarImage src={value} alt="" /> : null}
				<AvatarFallback>{initialsFromName(name || "?")}</AvatarFallback>
			</Avatar>
			<div className="flex flex-col gap-2">
				<input
					ref={inputRef}
					id={inputId}
					type="file"
					accept="image/*"
					className="sr-only"
					aria-label="Upload member avatar image"
					onChange={(event) => {
						const file = event.target.files?.[0];
						if (file) void handleFile(file);
						event.target.value = "";
					}}
				/>
				<div className="flex flex-wrap items-center gap-2">
					<Button
						type="button"
						variant="outline"
						size="sm"
						onClick={() => inputRef.current?.click()}
					>
						<ImagePlusIcon aria-hidden="true" />
						{value ? "Replace" : "Upload"}
					</Button>
					{value ? (
						<Button type="button" variant="ghost" size="sm" onClick={() => onChange(undefined)}>
							<Trash2Icon aria-hidden="true" />
							Remove
						</Button>
					) : null}
				</div>
				{error ? (
					<p className="text-destructive text-xs" role="alert">
						{error}
					</p>
				) : (
					<p className="text-muted-foreground text-xs">PNG or JPG up to 1.5 MB.</p>
				)}
			</div>
		</div>
	);
}
