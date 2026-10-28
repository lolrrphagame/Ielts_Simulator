import "server-only";
import { timingSafeEqual } from "node:crypto";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { parseRange } from "../listening/range";
import { parseTestId, type Mode } from "../listening/schema";
import { audioFiles, loadTest, sourceFiles } from "./assets";
import { accessAttempt, createAttempt, HttpError } from "./attempts";
import { loadQuestionDocument } from "./question-content";
import { conversionDetail, inventory, unitParts } from "./conversion-store";
import { containedFile } from "./assets";
import { studyDraft } from "./study-drafts";
import { isVerified } from "./conversion-store";
import { createReadingAttempt, listReadingAttempts } from "./reading-attempts";
import { loadReadingCandidate } from "./reading-candidate";

const privateHeaders = {
  "Cache-Control": "private, no-store, max-age=0",
  "X-Content-Type-Options": "nosniff",
  "Cross-Origin-Resource-Policy": "same-origin",
  Vary: "Cookie",
};
export function authorized(request: Request): boolean {
  const supplied = Buffer.from(request.headers.get("x-ielts-local") ?? "");
  const expected = Buffer.from(process.env.IELTS_INTERNAL_SECRET ?? "");
  return (
    expected.length >= 32 &&
    supplied.length === expected.length &&
    timingSafeEqual(supplied, expected)
  );
}
async function jsonBody(request: Request): Promise<Record<string, unknown>> {
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    throw new HttpError(415, "JSON required");
  if (Number(request.headers.get("content-length")) > 256000)
    throw new HttpError(413, "Request too large");
  const reader = request.body?.getReader();
  if (!reader) throw new HttpError(400, "Missing request body");
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 256000) {
      await reader.cancel();
      throw new HttpError(413, "Request too large");
    }
    chunks.push(value);
  }
  try {
    const parsed = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
      throw new Error();
    return parsed;
  } catch {
    throw new HttpError(400, "Invalid JSON");
  }
}
function validId(value: string) {
  try {
    return parseTestId(value);
  } catch {
    throw new HttpError(404, "Test not found");
  }
}
async function assetResponse(
  request: Request,
  id: string,
  kind: string,
  assetId: string,
) {
  let files =
    kind === "audio"
      ? await audioFiles(id)
      : kind === "page"
        ? await sourceFiles(id)
        : [];
  if (kind === "converted" && id === "19-1" && assetId === "farley-map")
    files = [
      {
        id: assetId,
        file: await containedFile(
          "private-content/Cambridge19/T1_Listening/media/farley-map.png",
        ),
        filename: "farley-map.png",
      },
    ];
  if (kind === "conversion-source") {
    const { directory } = unitParts(id);
    if (!/^page_\d+\.png$/.test(assetId))
      throw new HttpError(404, "Source not found");
    files = [
      {
        id: assetId,
        file: await containedFile(
          `private-assets/pdfs/${directory}/${assetId}`,
        ),
        filename: assetId,
      },
    ];
  }
  if (kind === "conversion-crop") {
    const { directory } = unitParts(id);
    if (!/^task-1-(original|enhanced)\.png$/.test(assetId))
      throw new HttpError(404, "Crop not found");
    files = [
      {
        id: assetId,
        file: await containedFile(
          `private-content/${directory}/media/${assetId}`,
        ),
        filename: assetId,
      },
    ];
  }
  const asset = files.find((item) => item.id === assetId);
  if (!asset) throw new HttpError(404, "Asset not found");
  const { size } = await stat(asset.file);
  const mime = asset.file.endsWith(".png")
    ? "image/png"
    : asset.file.endsWith(".m4a")
      ? "audio/mp4"
      : "audio/mpeg";
  let range;
  try {
    range = parseRange(request.headers.get("range"), size);
  } catch {
    return new Response(null, {
      status: 416,
      headers: { ...privateHeaders, "Content-Range": `bytes */${size}` },
    });
  }
  const start = range?.start ?? 0;
  const end = range?.end ?? size - 1;
  const headers = {
    ...privateHeaders,
    "Content-Type": mime,
    "Accept-Ranges": "bytes",
    "Content-Length": String(end - start + 1),
    ...(range ? { "Content-Range": `bytes ${start}-${end}/${size}` } : {}),
  };
  if (request.method === "HEAD")
    return new Response(null, { status: range ? 206 : 200, headers });
  const stream = createReadStream(asset.file, { start, end });
  const body = Readable.toWeb(stream) as ReadableStream<Uint8Array>;
  return new Response(body, { status: range ? 206 : 200, headers });
}
export async function privateApi(request: Request, segments: string[]) {
  if (!authorized(request))
    return Response.json(
      { error: "Open the local workspace using npm run dev or npm start." },
      { status: 403, headers: privateHeaders },
    );
  try {
    const [resource, id, action, assetId] = segments;
    if (resource === "reading-candidate" && segments.length === 2 && request.method === "GET") {
      try {
        return Response.json({data:await loadReadingCandidate(id)}, {headers:privateHeaders});
      } catch {
        throw new HttpError(409,"Review candidate is missing, stale or invalid. Prepare it again before review.");
      }
    }
    if (
      resource === "converted" &&
      segments.length === 4 &&
      action === "listening" &&
      ["GET", "HEAD"].includes(request.method)
    )
      return await assetResponse(request, validId(id), "converted", assetId);
    if (
      ["conversion-source", "conversion-crop"].includes(resource) &&
      segments.length === 3 &&
      ["GET", "HEAD"].includes(request.method)
    )
      return await assetResponse(request, id, resource, action);
    if (
      resource === "assets" &&
      segments.length === 4 &&
      ["GET", "HEAD"].includes(request.method)
    )
      return await assetResponse(request, validId(id), action, assetId);
    let value: unknown;
    if(resource === "reading-attempts" && segments.length === 2 && ["GET","POST"].includes(request.method)) {
      const mode=new URL(request.url).searchParams.get("mode") ?? "practice";
      if(mode === "exam" && !(await isVerified(id))) throw new HttpError(403,"Exam Mode is locked: this content is not Verified.");
      return Response.json({data:request.method === "POST" ? await createReadingAttempt(id,mode) : await listReadingAttempts(id,mode)}, {headers:privateHeaders});
    }
    if (
      resource === "study" &&
      ((segments.length === 2 && ["GET", "PUT"].includes(request.method)) ||
       (segments.length === 3 && action === "submit" && request.method === "POST"))
    ) {
      const mode = new URL(request.url).searchParams.get("mode") ?? "practice";
      unitParts(id);
      if (mode === "exam" && !(await isVerified(id)))
        throw new HttpError(
          403,
          "Exam Mode is locked: this content is not Verified. Open Practice or Content Review.",
        );
      const draft = await studyDraft(
        id,
        mode,
        ["PUT","POST"].includes(request.method) ? await jsonBody(request) : undefined,
        new URL(request.url).searchParams.get("attempt") ?? undefined,
        request.method === "POST",
      );
      return Response.json(
        {
          data:
            request.method === "GET"
              ? { detail: await conversionDetail(id), draft }
              : draft,
          serverNow: Date.now(),
        },
        { headers: privateHeaders },
      );
    }
    if (
      resource === "conversions" &&
      segments.length === 1 &&
      request.method === "GET"
    )
      return Response.json(
        { data: await inventory(), serverNow: Date.now() },
        { headers: privateHeaders },
      );
    if (
      resource === "conversions" &&
      segments.length === 2 &&
      request.method === "GET"
    )
      return Response.json(
        { data: await conversionDetail(id), serverNow: Date.now() },
        { headers: privateHeaders },
      );
    if (
      resource === "content" &&
      segments.length === 3 &&
      request.method === "GET"
    ) {
      if (!/^[1-4]$/.test(action))
        throw new HttpError(404, "Content not found");
      value = await loadQuestionDocument(validId(id), Number(action));
    } else if (
      resource === "tests" &&
      segments.length === 2 &&
      request.method === "GET"
    )
      value = await loadTest(validId(id));
    else if (
      resource === "attempts" &&
      segments.length === 1 &&
      request.method === "POST"
    ) {
      const body = await jsonBody(request);
      if (typeof body.testId !== "string")
        throw new HttpError(400, "Missing test ID");
      value = await createAttempt(validId(body.testId), body.mode as Mode);
    } else if (
      resource === "attempts" &&
      segments.length === 2 &&
      request.method === "GET"
    )
      value = await accessAttempt(id);
    else if (
      resource === "attempts" &&
      segments.length === 2 &&
      request.method === "PUT"
    )
      value = await accessAttempt(id, { update: await jsonBody(request) });
    else if (
      resource === "attempts" &&
      segments.length === 3 &&
      action === "submit" &&
      request.method === "POST"
    )
      value = await accessAttempt(id, {
        update: await jsonBody(request),
        submit: true,
      });
    else throw new HttpError(404, "Not found");
    return Response.json(
      { data: value, serverNow: Date.now() },
      { headers: privateHeaders },
    );
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 503;
    return Response.json(
      {
        error:
          error instanceof HttpError
            ? error.message
            : "Local assets are unavailable or invalid. Run npm run audit:assets for details.",
      },
      { status, headers: privateHeaders },
    );
  }
}
