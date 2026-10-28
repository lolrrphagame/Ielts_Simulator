import { localDataRoot } from "../../src/lib/server/local-data";
import { test, expect } from "@playwright/test";
import { readFile, writeFile, unlink } from "node:fs/promises";
import path from "node:path";

const origin = "http://127.0.0.1:3100";
const ids: string[] = [];
test.afterAll(async () => {
  await Promise.all(
    ids.map((id) =>
      unlink(path.join(localDataRoot(), "attempts", `${id}.json`)).catch(() => {}),
    ),
  );
});

test("Cambridge 19 T1: real audio, questions, bookmarks, autosave/resume, submission and library", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/exam/19/1/listening/practice");
  await page.getByRole("button", { name: "Start New Attempt" }).click();
  await expect(
    page.getByLabel("Answer for question 1", { exact: true }),
  ).toBeVisible();
  const draftKey = "ielts:attempt:v1:19-1:practice";
  const attemptId = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)!).id,
    draftKey,
  );
  ids.push(attemptId);
  const key = JSON.parse(
    await readFile(
      path.resolve("../answers/Cambridge19/T1_Listening.json"),
      "utf8",
    ),
  );
  await page
    .getByLabel("Answer for question 1", { exact: true })
    .fill(key[1][0]);
  await page
    .getByRole("button", { name: "Bookmark question 1", exact: true })
    .click();
  await expect(
    page.getByText("Saved on this device", { exact: true }),
  ).toBeVisible();
  await expect
    .poll(() =>
      page
        .locator("audio")
        .evaluate((audio: HTMLAudioElement) => audio.duration),
    )
    .toBeGreaterThan(60);
  await page
    .locator("audio")
    .evaluate((audio: HTMLAudioElement) => audio.play());
  await expect
    .poll(() =>
      page
        .locator("audio")
        .evaluate((audio: HTMLAudioElement) => audio.currentTime),
    )
    .toBeGreaterThan(0);
  await page
    .locator("audio")
    .evaluate((audio: HTMLAudioElement) => audio.pause());
  await page.reload();
  await expect(
    page.getByLabel("Answer for question 1", { exact: true }),
  ).toHaveValue(key[1][0]);
  await expect(
    page.getByRole("button", { name: "Bookmark question 1", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page
    .getByRole("button", { name: "Go to question 21, unanswered", exact: true })
    .click();
  const group = page.getByRole("group", {
    name: /Questions 21.22/,
  });
  await group.getByLabel(key[21][0].toUpperCase(), { exact: true }).check();
  await group.getByLabel(key[21][1].toUpperCase(), { exact: true }).check();
  await expect(group.locator("input:checked")).toHaveCount(2);
  await expect(page.locator(".rendered-content")).toBeVisible();
  await page
    .getByRole("button", { name: "Submit answers", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Confirm submission", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "3 / 40", exact: true }),
  ).toBeVisible();
  await expect(group.locator("input").first()).toBeDisabled();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "3 / 40", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("link", { name: "Back to Library", exact: true })
    .click();
  await expect(page).toHaveURL(
    /volume=19&test=1&skill=listening&mode=practice/,
  );
  await expect(
    page.locator('input[name="Cambridge collection"][value="19"]'),
  ).toBeChecked();
  expect(errors).toEqual([]);
});

test("private endpoints reject unauthenticated and cross-origin requests; range/MIME work", async ({
  request,
}) => {
  const denied = await request.get("/api/private/tests/19-1");
  expect(denied.status()).toBe(403);
  expect(
    (await request.get("/api/private/assets/19-1/audio/section-1")).status(),
  ).toBe(403);
  expect(
    (await request.get("/api/private/assets/19-1/page/page_9")).status(),
  ).toBe(403);
  expect(
    (
      await request.post("/api/local-session", {
        headers: { Origin: "https://evil.test" },
      })
    ).status(),
  ).toBe(403);
  expect(
    (
      await request.post("/api/local-session", {
        headers: { Origin: origin, "X-Forwarded-For": "127.0.0.1" },
      })
    ).status(),
  ).toBe(403);
  expect(
    (
      await request.post("/api/local-session", { headers: { Origin: origin } })
    ).status(),
  ).toBe(204);
  for (const [id, audio, mime] of [
    ["19-1", "section-1", "audio/mpeg"],
    ["20-1", "section-1", "audio/mp4"],
    ["21-1", "full", "audio/mpeg"],
  ]) {
    const response = await request.get(
      `/api/private/assets/${id}/audio/${audio}`,
      { headers: { Range: "bytes=0-1023" } },
    );
    expect(response.status()).toBe(206);
    expect(response.headers()["content-type"]).toBe(mime);
    expect(response.headers()["cache-control"]).toContain("no-store");
    expect((await response.body()).length).toBe(1024);
  }
  expect(
    (
      await request.get("/api/private/assets/19-1/audio/section-1", {
        headers: { Range: "bytes=999999999999-" },
      })
    ).status(),
  ).toBe(416);
  expect(
    (
      await request.get("/api/private/assets/19-1/audio/not-registered")
    ).status(),
  ).toBe(404);
  expect((await request.get("/api/private/tests/19-5")).status()).toBe(404);
  expect((await request.get("/api/private/answers/19-1")).status()).toBe(404);
  expect(
    (
      await request.get("/api/private/tests/19-1", {
        headers: { Host: "evil.test:3100" },
      })
    ).status(),
  ).toBe(403);
  expect(
    (
      await request.post("/api/private/attempts", {
        headers: { Origin: origin },
        data: { testId: "19-1", mode: "invalid" },
      })
    ).status(),
  ).toBe(400);
  for (const url of [
    "/audio/Cambridge19/T1S1.mp3",
    "/answers/Cambridge19/T1_Listening.json",
    "/private-assets/pdfs/Cambridge19/T1_Listening/page_9.png",
  ])
    expect((await request.get(url)).status()).toBe(404);
  const definition = (
    await (await request.get("/api/private/tests/19-1")).json()
  ).data;
  expect(definition).not.toHaveProperty("answers");
  expect(definition).not.toHaveProperty("key");
});

test("exam reload keeps deadline; timeout submits saved answers and locks editing", async ({
  page,
}) => {
  await page.goto("/exam/19/1/listening/exam");
  await page.getByRole("button", { name: "Start New Attempt" }).click();
  await expect(
    page.getByLabel("Answer for question 1", { exact: true }),
  ).toBeVisible();
  const draftKey = "ielts:attempt:v1:19-1:exam";
  const initial = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)!),
    draftKey,
  );
  ids.push(initial.id);
  const file = path.join(localDataRoot(), "attempts", `${initial.id}.json`);
  await page.reload();
  await expect(
    page.getByLabel("Answer for question 1", { exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      (key) => JSON.parse(localStorage.getItem(key)!).deadline,
      draftKey,
    ),
  ).toBe(initial.deadline);
  // Shorten only this test-owned attempt to exercise the real timeout path quickly.
  await expect(
    page.getByText("Saved on this device", { exact: true }),
  ).toBeVisible();
  const record = JSON.parse(await readFile(file, "utf8"));
  record.deadline = Date.now() + 5000;
  await writeFile(file, JSON.stringify(record));
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "0 / 40", exact: true }),
  ).toBeVisible({ timeout: 15000 });
  await expect(
    page.getByLabel("Answer for question 1", { exact: true }),
  ).toBeDisabled();
});

test("mobile workspace fits viewport and supports navigation", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/exam/21/1/listening/practice");
  await page.getByRole("button", { name: "Start New Attempt" }).click();
  await expect(
    page.getByLabel("Answer for question 1", { exact: true }),
  ).toBeVisible();
  ids.push(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem("ielts:attempt:v1:21-1:practice")!).id,
    ),
  );
  await page
    .getByRole("button", { name: "Go to question 40, unanswered", exact: true })
    .click();
  await expect(
    page.getByLabel("Answer for question 40", { exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test("offline edits survive reload and sync after reconnection", async ({
  page,
  context,
}) => {
  await page.goto("/exam/19/1/listening/practice");
  await page.getByRole("button", { name: "Start New Attempt" }).click();
  await expect(
    page.getByLabel("Answer for question 1", { exact: true }),
  ).toBeVisible();
  ids.push(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem("ielts:attempt:v1:19-1:practice")!).id,
    ),
  );
  await context.setOffline(true);
  await page
    .getByLabel("Answer for question 1", { exact: true })
    .fill("offline draft");
  await expect(
    page.getByText("Save failed — local draft retained", { exact: true }),
  ).toBeVisible();
  await context.setOffline(false);
  page.on("dialog", (dialog) => dialog.accept());
  await page.reload();
  await expect(
    page.getByLabel("Answer for question 1", { exact: true }),
  ).toHaveValue("offline draft");
  await expect(
    page.getByText("Saved on this device", { exact: true }),
  ).toBeVisible();
});

for (const volume of ["20", "21"])
  test(`Cambridge ${volume}: browser decodes and plays original audio`, async ({
    page,
  }) => {
    await page.goto(`/exam/${volume}/1/listening/practice`);
    await page.getByRole("button", { name: "Start New Attempt" }).click();
    await expect(
      page.getByLabel("Answer for question 1", { exact: true }),
    ).toBeVisible();
    ids.push(
      await page.evaluate(
        (v) =>
          JSON.parse(localStorage.getItem(`ielts:attempt:v1:${v}-1:practice`)!)
            .id,
        volume,
      ),
    );
    await expect
      .poll(() =>
        page
          .locator("audio")
          .evaluate((audio: HTMLAudioElement) => audio.duration),
      )
      .toBeGreaterThan(60);
    await page
      .locator("audio")
      .evaluate((audio: HTMLAudioElement) => audio.play());
    await expect
      .poll(() =>
        page
          .locator("audio")
          .evaluate((audio: HTMLAudioElement) => audio.currentTime),
      )
      .toBeGreaterThan(0);
    if (volume === "20") {
      await page.locator("audio").evaluate((audio: HTMLAudioElement) => {
        audio.currentTime = audio.duration - 0.1;
      });
      await expect(page.locator("audio")).toHaveAttribute("src", /section-2$/);
      await expect
        .poll(() =>
          page
            .locator("audio")
            .evaluate((audio: HTMLAudioElement) => audio.currentTime),
        )
        .toBeGreaterThan(0);
    }
    await page
      .locator("audio")
      .evaluate((audio: HTMLAudioElement) => audio.pause());
  });
