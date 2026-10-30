import { AsyncLocalStorage } from 'node:async_hooks';
export const requestMetrics = new AsyncLocalStorage();
export async function measureDatabase(kind, operation) {
  const start = performance.now();
  try {
    return await operation();
  } finally {
    const metrics = requestMetrics.getStore();
    if (metrics) {
      metrics[kind + 'Ms'] = (metrics[kind + 'Ms'] || 0) + performance.now() - start;
      metrics[kind + 'Calls'] = (metrics[kind + 'Calls'] || 0) + 1;
    }
  }
}
