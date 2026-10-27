import { timingSafeEqual } from "node:crypto";

export function equalSecret(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function isLocalRequest(req, port) {
  const host = req.headers.host;
  if (
    !["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(req.socket.remoteAddress)
  )
    return false;
  if (![`127.0.0.1:${port}`, `localhost:${port}`].includes(host)) return false;
  // Do not trust proxy headers, even when a proxy connects over loopback.
  if (
    Object.keys(req.headers).some(
      (key) => key === "forwarded" || key.startsWith("x-forwarded-"),
    )
  )
    return false;
  if (req.headers.origin && req.headers.origin !== `http://${host}`)
    return false;
  if (
    req.headers["sec-fetch-site"] &&
    !["same-origin", "none"].includes(req.headers["sec-fetch-site"])
  )
    return false;
  return true;
}
