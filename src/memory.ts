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
}
