/** Polls `check` until it returns truthy or the timeout elapses. */
export async function waitUntil<T>(
  check: () => Promise<T | null | undefined | false>,
  options: { timeoutMs?: number; intervalMs?: number; description?: string } = {},
): Promise<T> {
  const timeoutMs = options.timeoutMs ?? 5000;
  const intervalMs = options.intervalMs ?? 25;
  const deadline = Date.now() + timeoutMs;

  for (;;) {
    const result = await check();
    if (result) return result;
    if (Date.now() > deadline) {
      throw new Error(`waitUntil timed out${options.description ? `: ${options.description}` : ''}`);
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}
