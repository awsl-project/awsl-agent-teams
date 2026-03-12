/**
 * RunContext — lifecycle-aware lock management.
 *
 * Wraps acquireLock/releaseLock with signal handler registration
 * and auto-release on scope exit.
 */

import { acquireLock, releaseLock, forceReleaseLock, checkLock, formatLockInfo } from "./lock.js"
import { log } from "./log.js"

export interface RunContextOptions {
	description: string
	force?: boolean
}

export class RunContext {
	readonly cwd: string
	readonly sessionId: string
	private released = false
	private signalHandlers: Map<string, (...args: any[]) => void> = new Map()

	private constructor(cwd: string, sessionId: string) {
		this.cwd = cwd
		this.sessionId = sessionId
	}

	/**
	 * Acquire a lock and create a RunContext.
	 * Registers SIGINT/SIGTERM handlers for cleanup.
	 * Throws if the lock cannot be acquired.
	 */
	static acquire(cwd: string, opts: RunContextOptions): RunContext {
		let result = acquireLock(cwd, opts.description)

		if (!result.acquired && opts.force) {
			log.info("context", "Force-releasing existing lock")
			forceReleaseLock(cwd)
			result = acquireLock(cwd, opts.description)
		}

		if (!result.acquired) {
			const msg = result.existingLock
				? formatLockInfo(result.existingLock)
				: "Failed to acquire lock (unknown reason)"
			throw new Error(msg)
		}

		// Read back the lock to get the sessionId
		const lockInfo = checkLock(cwd)
		const sessionId = lockInfo?.sessionId ?? "unknown"

		const ctx = new RunContext(cwd, sessionId)
		ctx.registerSignalHandlers()
		log.info("context", `RunContext acquired (session: ${sessionId})`)
		return ctx
	}

	/**
	 * Try to acquire a lock, returning null instead of throwing on failure.
	 * Useful for queue/polling scenarios.
	 */
	static tryAcquire(cwd: string, opts: RunContextOptions): RunContext | null {
		try {
			return RunContext.acquire(cwd, opts)
		} catch {
			return null
		}
	}

	/**
	 * Release the lock and deregister signal handlers.
	 * No-op if already released. Returns true if released, false if already released.
	 */
	release(): boolean {
		if (this.released) return false

		this.released = true
		this.deregisterSignalHandlers()
		releaseLock(this.cwd)
		log.info("context", "RunContext released")
		return true
	}

	/**
	 * Run a function with auto-release on completion or error.
	 */
	async run<T>(fn: (ctx: RunContext) => Promise<T>): Promise<T> {
		try {
			return await fn(this)
		} finally {
			this.release()
		}
	}

	private registerSignalHandlers(): void {
		for (const signal of ["SIGINT", "SIGTERM"] as const) {
			const handler = () => {
				log.warn("context", `Received ${signal}, releasing lock`)
				this.release()
				process.exit(1)
			}
			this.signalHandlers.set(signal, handler)
			process.on(signal, handler)
		}

		// Catch uncaught exceptions to release lock before crashing
		const exceptionHandler = (err: Error) => {
			log.warn("context", `Uncaught exception, releasing lock: ${err.message}`)
			this.release()
			process.exit(1)
		}
		this.signalHandlers.set("uncaughtException", exceptionHandler)
		process.on("uncaughtException", exceptionHandler)

		// Catch unhandled rejections
		const rejectionHandler = (reason: unknown) => {
			log.warn("context", `Unhandled rejection, releasing lock: ${reason}`)
			this.release()
			process.exit(1)
		}
		this.signalHandlers.set("unhandledRejection", rejectionHandler)
		process.on("unhandledRejection", rejectionHandler)
	}

	private deregisterSignalHandlers(): void {
		for (const [signal, handler] of this.signalHandlers) {
			process.removeListener(signal, handler)
		}
		this.signalHandlers.clear()
	}
}
