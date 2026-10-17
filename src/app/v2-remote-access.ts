interface RemoteWriteEnvironment {
  production: boolean;
  protocol: string;
  hostname: string;
}

/** Local previews may read public data, but never contribute to the live service. */
export function isRemoteWriteEnabled(environment?: RemoteWriteEnvironment): boolean {
  const production = environment?.production ?? import.meta.env.PROD;
  const protocol = environment?.protocol ?? globalThis.location?.protocol ?? "";
  const hostname = (environment?.hostname ?? globalThis.location?.hostname ?? "").toLowerCase().replace(/\.$/, "");
  const loopback = hostname === "localhost" || hostname.endsWith(".localhost")
    || /^127\./.test(hostname) || hostname === "[::1]" || hostname === "::1";
  return production && protocol === "https:" && hostname.length > 0 && !loopback;
}
