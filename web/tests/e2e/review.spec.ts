import { test, expect } from "@playwright/test";
import { readFile, writeFile, unlink } from "node:fs/promises";
import path from "node:path";

test("private review, OCR annotations, autosave, Writing crops and verified Speaking", async ({
  page,
}) => {
  const files = [
    "19-1-listening-review",
    "19-1-writing-review",
    "19-1-speaking-review",
  ].map((id) => path.resolve(`.local/study/${id}.json`));
  const originals = await Promise.all(
    files.map((file) => readFile(file).catch(() => null)),
  );
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  try {
    await page.goto("/review");
    await expect(
      page.getByLabel("Conversion unit").locator("option"),
    ).toHaveCount(48);
    await expect(page.locator(".ocr-text")).toBeVisible();
    const originalNotes = await page
      .getByLabel("Review notes", { exact: true })
      .inputValue();
    await page
      .getByLabel("Review notes", { exact: true })
      .fill(originalNotes + "\nPipeline test note");
    await page
      .locator(".ocr-text [data-text-id]")
      .first()
      .evaluate((el) => {
        const range = document.createRange();
        range.selectNodeContents(el);
        const selection = window.getSelection()!;
        selection.removeAllRanges();
        selection.addRange(range);
      });
    await expect(
      page.getByRole("toolbar", { name: "Selection actions" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Highlight", exact: true }).click();
    await expect(
      page.locator(".ocr-text .annotation-highlight").first(),
    ).toBeVisible();
    await expect(page.locator(".review-status")).toContainText(
      "Saved on this device",
    );
    await page.reload();
    await expect(page.getByLabel("Review notes", { exact: true })).toHaveValue(
      originalNotes + "\nPipeline test note",
    );
    await expect(
      page.locator(".ocr-text .annotation-highlight").first(),
    ).toBeVisible();
    await page.getByLabel("Conversion unit").selectOption("19-1-writing");
    const crop = page.getByAltText("Deterministically enhanced crop candidate");
    await expect(crop).toBeVisible();
    await expect
      .poll(() => crop.evaluate((el: HTMLImageElement) => el.naturalWidth))
      .toBeGreaterThan(0);
    await page.getByLabel("Conversion unit").selectOption("19-1-speaking");
    await expect(
      page.getByRole("heading", { name: "Verified speaking cards" }),
    ).toBeVisible();
    await expect(page.locator(".ocr-text article")).toHaveCount(3);
    await page.setViewportSize({ width: 390, height: 844 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.goto("/exam/20/1/reading/exam");
    await expect(page.locator("main [role=alert]")).toContainText(
      "not Verified",
    );
    expect(errors).toEqual([]);
  } finally {
    await page.goto("about:blank");
    for (let i = 0; i < files.length; i++) {
      if (originals[i]) await writeFile(files[i], originals[i]!);
      else await unlink(files[i]).catch(() => {});
    }
  }
});

test("conversion APIs remain private, Exam gate is enforced server-side, no answer keys in content", async ({
  request,
}) => {
  expect((await request.get("/api/private/conversions")).status()).toBe(403);
  expect(
    (
      await request.get("/private-content/Cambridge19/T1_Listening/part-1.json")
    ).status(),
  ).toBe(404);
  await request.post("/api/local-session", {
    headers: { Origin: "http://127.0.0.1:3100" },
  });
  const content = await request.get("/api/private/content/19-1/1");
  expect(content.status()).toBe(200);
  expect(content.headers()["cache-control"]).toContain("no-store");
  const doc = (await content.json()).data;
  expect(doc).not.toHaveProperty("answers");
  expect(doc).not.toHaveProperty("answerKey");
  const blocked = await request.post("/api/private/attempts", {
    headers: { Origin: "http://127.0.0.1:3100" },
    data: { testId: "20-1", mode: "exam" },
  });
  expect(blocked.status()).toBe(403);
  expect(
    (await request.get("/api/private/study/20-1-reading?mode=exam")).status(),
  ).toBe(403);
  expect(
    (await request.get("/api/private/study/19-1-speaking?mode=exam")).status(),
  ).toBe(200);
});
