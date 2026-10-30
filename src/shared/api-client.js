(function () {
  class SharedClient {
    constructor(role = 'customer') {
      this.role = role;
      this.data = null;
      this.timer = null;
      this.error = null;
      this.onchange = null;
      this.pending = false;
    }
    async api(body, query = '') {
      const start = performance.now(),
        response = await fetch('/api/workspace' + query, {
          method: body ? 'POST' : 'GET',
          credentials: 'same-origin',
          cache: 'no-store',
          headers: {
            ...(body ? { 'Content-Type': 'application/json' } : {}),
            ...(this.role === 'investigator' ? { 'X-Shield-Role': 'investigator' } : {}),
          },
          body: body ? JSON.stringify(body) : undefined,
          signal: AbortSignal.timeout(20000),
        });
      const data = await response.json();
      if (!response.ok)
        throw Object.assign(Error(data.error || 'Shared service unavailable.'), {
          status: response.status,
        });
      return { data, ms: performance.now() - start };
    }
    async pull(force = false) {
      if (this.pending) {
        await this.pending;
        if (force) return this.pull();
        return;
      }
      this.pending = (async () => {
        try {
          const previousError = this.error,
            r = await this.api(undefined, this.data ? '?since=' + this.data.revision : '');
          this.error = null;
          if (r.data.unchanged) {
            if (previousError) this.onchange?.(this.data);
            return;
          }
          if (this.data?.revision !== r.data.revision) {
            this.data = r.data;
            this.onchange?.(this.data);
          }
        } catch (e) {
          this.error = e;
          this.onchange?.(null, e);
        }
      })();
      try {
        await this.pending;
      } finally {
        this.pending = null;
      }
    }
    async start() {
      await this.api({ action: 'bootstrap' });
      await this.pull();
      if (!this.timer)
        this.timer = setInterval(() => {
          if (!document.hidden) this.pull();
        }, 1500);
    }
    stop() {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
  window.ShieldSharedClient = SharedClient;
})();
