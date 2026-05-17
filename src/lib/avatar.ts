const MAX_AVATAR_BYTES = 1.5 * 1024 * 1024; // 1.5 MB raw

export interface AvatarReadError {
	message: string;
}

export async function readAvatarFile(file: File): Promise<string> {
	if (!file.type.startsWith("image/")) {
		throw new Error("Avatar must be an image file.");
	}
	if (file.size > MAX_AVATAR_BYTES) {
		throw new Error("Avatar must be smaller than 1.5 MB.");
	}
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => {
			const result = reader.result;
			if (typeof result !== "string") {
				reject(new Error("Unable to read image."));
				return;
			}
			resolve(result);
		};
		reader.onerror = () => reject(new Error("Failed to read the file."));
		reader.readAsDataURL(file);
	});
}

export function initialsFromName(name: string): string {
	const trimmed = name.trim();
	if (!trimmed) return "?";
	const parts = trimmed.split(/\s+/);
	if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
	return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}
