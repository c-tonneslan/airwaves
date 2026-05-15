// Server-side proxy that reads the "now playing" track title from a
// shoutcast/icecast stream's interleaved ICY metadata.
//
// How ICY metadata works:
// 1. Client sends an `Icy-MetaData: 1` request header.
// 2. Server responds with `icy-metaint: N`, meaning every Nth byte of the
//    body, a one-byte length prefix is followed by a metadata block.
// 3. The metadata block contains key='value';key='value';... pairs;
//    the one we want is `StreamTitle`.
//
// We read just enough bytes to grab one block and then close the
// connection, so this stays cheap per request. Results are cached for
// 25 seconds at the CDN so a station with 50 listeners doesn't hammer
// its origin.

export const runtime = "edge";

export async function GET(req: Request) {
  const requestUrl = new URL(req.url);
  const streamUrl = requestUrl.searchParams.get("url");

  if (!streamUrl || !/^https?:\/\//.test(streamUrl)) {
    return json({ title: null, error: "missing or invalid url" }, 400);
  }

  // Reject HTTP streams when the page is served over HTTPS — the browser
  // would block the audio anyway, no point fetching metadata for it.
  if (streamUrl.startsWith("http://") && requestUrl.protocol === "https:") {
    return json({ title: null, error: "http stream blocked on https page" }, 200);
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const resp = await fetch(streamUrl, {
      headers: { "Icy-MetaData": "1" },
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!resp.ok || !resp.body) {
      return json({ title: null, error: `stream returned ${resp.status}` }, 200);
    }

    const metaIntRaw = resp.headers.get("icy-metaint");
    const metaInt = metaIntRaw ? parseInt(metaIntRaw, 10) : 0;
    if (!metaInt || !Number.isFinite(metaInt)) {
      // Stream doesn't expose ICY metadata at all (true for many HLS feeds
      // and a fair number of older shoutcast servers).
      await resp.body.cancel();
      return json({ title: null, reason: "no-icy-metadata" }, 200);
    }

    const title = await readFirstMetadata(resp.body, metaInt);
    return json({ title }, 200, { "Cache-Control": "s-maxage=25, stale-while-revalidate=60" });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "fetch failed";
    return json({ title: null, error: msg }, 200);
  }
}

async function readFirstMetadata(
  body: ReadableStream<Uint8Array>,
  metaInt: number,
): Promise<string | null> {
  const reader = body.getReader();
  // Maximum metadata block length per the ICY spec is 16 * 255 = 4080 bytes,
  // plus the one-byte length prefix.
  const target = metaInt + 1 + 4080;
  let buf: Uint8Array = new Uint8Array(0);

  try {
    while (buf.length < metaInt + 1) {
      const { value, done } = await reader.read();
      if (done || !value) break;
      buf = concat(buf, copyToArrayBuffer(value));
      if (buf.length > target) break;
    }

    if (buf.length < metaInt + 1) return null;

    const lenByte = buf[metaInt];
    const metaLen = lenByte * 16;
    if (metaLen === 0) return null;

    while (buf.length < metaInt + 1 + metaLen) {
      const { value, done } = await reader.read();
      if (done || !value) break;
      buf = concat(buf, copyToArrayBuffer(value));
    }

    if (buf.length < metaInt + 1 + metaLen) return null;
    const metaBytes = buf.subarray(metaInt + 1, metaInt + 1 + metaLen);
    const metaStr = new TextDecoder("utf-8", { fatal: false }).decode(metaBytes);
    return parseStreamTitle(metaStr);
  } finally {
    await reader.cancel().catch(() => {});
  }
}

// In the edge runtime ReadableStream chunks can be backed by either a
// plain ArrayBuffer or a SharedArrayBuffer. We normalise to plain
// ArrayBuffer so our internal buffer stays a vanilla Uint8Array and we
// don't have to fight TypeScript over ArrayBufferLike vs ArrayBuffer.
function copyToArrayBuffer(view: Uint8Array): Uint8Array {
  const out = new Uint8Array(view.byteLength);
  out.set(view);
  return out;
}

function parseStreamTitle(meta: string): string | null {
  const match = meta.match(/StreamTitle='((?:[^'\\]|\\.)*)'/);
  if (!match) return null;
  const title = match[1].replace(/\\'/g, "'").trim();
  if (!title || title === "-" || /^unknown/i.test(title)) return null;
  return title;
}

function concat(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.length + b.length);
  out.set(a);
  out.set(b, a.length);
  return out;
}

function json(body: unknown, status: number, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}
