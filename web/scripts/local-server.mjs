import { createServer } from "node:http";
import { randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import next from "next";
import { equalSecret, isLocalRequest } from "./local-security.mjs";

const dev = process.argv.includes("--dev");
const port = Number(process.env.PORT || 3000);
if (!Number.isInteger(port) || port < 1024 || port > 65535)
  throw new Error("Invalid PORT");
await mkdir(".local", { recursive: true });
const secretPath = ".local/access-key";
try {
  await writeFile(secretPath, randomBytes(32).toString("hex"), {
    flag: "wx",
    mode: 0o600,
  });
} catch (error) {
  if (error.code !== "EEXIST") throw error;
}
const cookieSecret = (await readFile(secretPath, "utf8")).trim();
// Never use NEXT_PUBLIC_ for either secret. The internal header is overwritten below.
process.env.IELTS_INTERNAL_SECRET = randomBytes(32).toString("hex");
const app = next({ dev, hostname: "127.0.0.1", port });
await app.prepare();
const handle = app.getRequestHandler();
const server = createServer(async (req, res) => {
  delete req.headers["x-ielts-local"];
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "same-origin");
  res.setHeader("X-Frame-Options", "DENY");
  if (!isLocalRequest(req, port)) {
    res.writeHead(403);
    res.end("Local access only");
    return;
  }
  const pathname = new URL(req.url, `http://${req.headers.host}`).pathname;
  if (pathname === "/api/local-session") {
    res.setHeader("Cache-Control", "private, no-store");
    if (
      req.method !== "POST" ||
      req.headers.origin !== `http://${req.headers.host}`
    ) {
      res.writeHead(403);
      res.end("Same-origin POST required");
      return;
    }
    res.setHeader(
      "Set-Cookie",
      `ielts_local=${cookieSecret}; HttpOnly; SameSite=Strict; Path=/`,
    );
    res.writeHead(204);
    res.end();
    return;
  }
  const token = (req.headers.cookie || "")
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith("ielts_local="))
    ?.slice("ielts_local=".length);
  if (equalSecret(token, cookieSecret))
    req.headers["x-ielts-local"] = process.env.IELTS_INTERNAL_SECRET;
  try {
    await handle(req, res);
  } catch {
    if (!res.headersSent) res.writeHead(500);
    res.end("Request failed");
  }
});
server.on("upgrade", (req, socket, head) => {
  if (!isLocalRequest(req, port)) return socket.destroy();
  app.getUpgradeHandler()(req, socket, head);
});
server.listen(port, "127.0.0.1", () =>
  console.log(`IELTS local workspace: http://127.0.0.1:${port}`),
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => {
    server.close();
    void app.close().finally(() => process.exit(0));
  });
