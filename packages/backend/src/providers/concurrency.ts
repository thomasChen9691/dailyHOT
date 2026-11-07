// Caps in-flight model requests for providers with an account-level concurrency limit.
// Queue concurrency (jobs/*.ts) is per queue; this limit covers every step that calls the model.
export interface RequestLimiter {
  run<T>(fn: () => Promise<T>): Promise<T>;
}

export function createLimiter(limit: () => number): RequestLimiter {
  let held = 0;
  const waiters: Array<() => void> = [];

  return {
    async run<T>(fn: () => Promise<T>): Promise<T> {
      const cap = Math.max(0, Math.floor(limit() || 0));
      if (cap <= 0) return fn(); // unset/0 keeps the upstream behaviour: no queueing
      if (held >= cap) await new Promise<void>(resolve => waiters.push(resolve));
      else held += 1;
      try {
        return await fn();
      } finally {
        // A released slot is handed straight to the next waiter, so `held` stays accurate.
        const next = waiters.shift();
        if (next) next();
        else held -= 1;
      }
    },
  };
}
