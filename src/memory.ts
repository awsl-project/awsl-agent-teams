/**
 * Shared memory — in-process key-value store for inter-agent communication.
 */

export interface MemoryEntry {
	value: string;
	author: string;
	timestamp: number;
}

export class SharedMemory {
	private store = new Map<string, MemoryEntry>();

	set(key: string, value: string, author: string) {
		this.store.set(key, { value, author, timestamp: Date.now() });
	}

	get(key: string): string | undefined {
		return this.store.get(key)?.value;
	}

	has(key: string): boolean {
		return this.store.has(key);
	}

	keys(): string[] {
		return [...this.store.keys()];
	}

	getEntry(key: string): MemoryEntry | undefined {
		return this.store.get(key);
	}

	/** Context summary for injection into agent prompts */
	getSummary(maxLen = 500): string {
		if (this.store.size === 0) return "(empty)";
		const lines: string[] = [];
		for (const [key, entry] of this.store) {
			const v = entry.value.length > maxLen
				? entry.value.slice(0, maxLen) + "...[truncated]"
				: entry.value;
			lines.push(`### ${key} (by ${entry.author})\n${v}`);
		}
		return lines.join("\n\n");
	}

	/** Serialize to plain object for checkpoint persistence.
	 *  Truncates values over maxLen to keep CHECKPOINT.json manageable. */
	serialize(maxLen = 8000): Record<string, MemoryEntry> {
		const obj: Record<string, MemoryEntry> = {};
		for (const [key, entry] of this.store) {
			obj[key] = entry.value.length > maxLen
				? { ...entry, value: entry.value.slice(0, maxLen) + "\n...[truncated for checkpoint]" }
				: entry;
		}
		return obj;
	}

	/** Restore from serialized checkpoint data */
	restore(data: Record<string, MemoryEntry>): void {
		for (const [key, entry] of Object.entries(data)) {
			// Don't overwrite entries that already exist (fresher data wins)
			if (!this.store.has(key)) {
				this.store.set(key, entry);
			}
		}
	}
}
