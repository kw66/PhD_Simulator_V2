// Browser keepalive bodies share a 64 KiB in-flight budget. Serialize writes
// across outboxes and keep room for browser/network overhead. Public reads do
// not join this queue and never consume the keepalive budget.
export const UPLOAD_KEEPALIVE_MAX_BYTES = 48 * 1024;
let writeTail: Promise<void> | null = null;

/** Keep the slot until the response body has been consumed, not just its headers. */
export function serializeRemoteWrite<T>(body: string, send: (keepalive: boolean) => Promise<T>): Promise<T> {
  const execute = (): Promise<T> => send(typeof document !== "undefined"
    && document.visibilityState === "hidden"
    && new TextEncoder().encode(body).byteLength <= UPLOAD_KEEPALIVE_MAX_BYTES);
  const work = writeTail ? writeTail.then(execute) : execute();
  const settled = work.then(() => undefined, () => undefined);
  writeTail = settled;
  void settled.then(() => { if (writeTail === settled) writeTail = null; });
  return work;
}
