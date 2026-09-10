// Serialized into benchmark pages only; production needs no hooks or globals.
export function instrument(options: { io: boolean; sizes: boolean }) {
  const mark = (name: string, detail: unknown = null) =>
    performance.mark(`bench:${name}`, { detail });
  const estimate = (value: unknown): number => {
    if (value == null) return 0;
    if (value instanceof Blob) return value.size;
    if (typeof value === 'string') return value.length * 2;
    if (typeof value === 'number') return 8;
    if (typeof value === 'boolean') return 1;
    if (Array.isArray(value)) return value.reduce((sum, item) => sum + estimate(item), 0);
    if (typeof value === 'object')
      return Object.entries(value).reduce(
        (sum, [key, item]) => sum + key.length * 2 + estimate(item),
        0,
      );
    return 0;
  };
  if (options.io) {
    let id = 0;
    const transaction = IDBDatabase.prototype.transaction;
    IDBDatabase.prototype.transaction = function (...args: Parameters<typeof transaction>) {
      const tx = transaction.apply(this, args);
      const txId = ++id;
      mark('tx-start', { id: txId, mode: tx.mode });
      tx.addEventListener('complete', () => mark('tx-complete', { id: txId, mode: tx.mode }));
      tx.addEventListener('abort', () => mark('tx-abort', { id: txId }));
      return tx;
    };
    for (const prototype of [IDBObjectStore.prototype, IDBIndex.prototype]) {
      for (const method of [
        'get',
        'getAll',
        'getKey',
        'getAllKeys',
        'count',
        'put',
        'add',
        'delete',
        'clear',
      ]) {
        const target = prototype as unknown as Record<string, (...args: unknown[]) => IDBRequest>;
        const original = target[method];
        if (!original) continue;
        target[method] = function (...args: unknown[]) {
          const write = ['put', 'add', 'delete', 'clear'].includes(method);
          const request = original.apply(this, args);
          mark(write ? 'write-request' : 'read-request', { method });
          if (write && options.sizes) mark('write-size', { method, bytes: estimate(args[0]) });
          request.addEventListener('success', () =>
            mark(write ? 'write-success' : 'read-success', {
              method,
              bytes: !write && options.sizes ? estimate(request.result) : null,
            }),
          );
          return request;
        };
      }
    }
  }
  const observer = new MutationObserver(() => {
    if (document.querySelector('.library, .play-surface, .create-screen')) {
      mark('ui-committed');
      observer.disconnect();
      requestAnimationFrame(() => requestAnimationFrame(() => mark('paint-proxy')));
    }
  });
  observer.observe(document, { childList: true, subtree: true, attributes: true });
  document.addEventListener(
    'change',
    (event) => {
      if ((event.target as HTMLInputElement)?.type === 'file') {
        performance.clearMarks();
        mark('ocr-start');
      }
    },
    true,
  );
  window.addEventListener('pagehide', () => {
    if (performance.getEntriesByName('bench:ocr-start').length) {
      sessionStorage.setItem(
        'bench:ocr',
        JSON.stringify({
          timeOrigin: performance.timeOrigin,
          marks: performance.getEntriesByType('mark').map((entry) => ({
            ...entry.toJSON(),
            detail: (entry as PerformanceMark).detail,
          })),
        }),
      );
    }
  });
}
