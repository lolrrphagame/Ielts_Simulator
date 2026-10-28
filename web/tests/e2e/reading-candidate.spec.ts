import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";

test("T2 private candidate review: all sources beside real interactive content, isolated notes/answers and no approval shortcut", async ({
  page,
  context,
  request,
}) => {
  const endpoint = "/api/private/reading-candidate/19-2-reading";
  expect((await request.get(endpoint)).status()).toBe(403);
  expect(
    (
      await request.get(
        "/private-content/Cambridge19/T2_Reading/review-candidate.json",
      )
    ).status(),
  ).toBe(404);
  const raw = JSON.parse(
    await readFile(
      "../private-content/Cambridge19/T2_Reading/review-candidate.json",
      "utf8",
    ),
  );
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/review");
  await expect(
    page.getByLabel("Conversion unit").locator("option"),
  ).toHaveCount(48);
  await page.getByLabel("Conversion unit").selectOption("19-2-reading");
  await page
    .getByRole("button", { name: "Review interactive candidate", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: /Interactive review candidate/ }),
  ).toBeVisible();
  await expect(
    page.getByLabel("Candidate source page").locator("option"),
  ).toHaveCount(12);
  await expect(
    page.locator(".reading-candidate-review .workspace-alert"),
  ).toContainText("not human approval");
  const response = await page.request.get(endpoint);
  expect(response.headers()["cache-control"]).toContain("no-store");
  const payload = (await response.json()).data;
  expect(payload.candidate.humanReviewed).toBe(false);
  function noKeys(value: unknown) {
    if (!value || typeof value !== "object") return;
    for (const [key, child] of Object.entries(value)) {
      expect([
        "answers",
        "answerKey",
        "acceptedAnswers",
        "correctAnswer",
        "reviewer",
        "approvedBy",
      ]).not.toContain(key);
      noKeys(child);
    }
  }
  noKeys(payload);
  const seen: number[] = [];
  for (const [i, row] of raw.checklist.entries()) {
    await page.getByLabel("Candidate source page").selectOption(String(i));
    await expect(
      page.getByAltText(`Candidate original ${row.page}`),
    ).toHaveAttribute("src", new RegExp(`${row.page}$`));
    await expect
      .poll(() =>
        page
          .getByAltText(`Candidate original ${row.page}`)
          .evaluate((el: HTMLImageElement) => el.naturalWidth),
      )
      .toBeGreaterThan(0);
    await expect(page.getByLabel("Page review checklist")).toContainText(
      row.checks[0],
    );
    const passage = raw.document.passages.find(
      (p: { id: string }) => p.id === row.passage,
    );
    if (!row.questions.length) {
      for (const p of passage.paragraphs)
        await expect(
          page.locator(`.candidate-converted [data-text-id="${p.id}"]`),
        ).toHaveText(p.text);
    } else {
      for (const n of row.questions) {
        const q = passage.groups
          .flatMap(
            (g: { questions: { number: number; numbers?: number[] }[] }) =>
              g.questions,
          )
          .find((q: { number: number; numbers?: number[] }) =>
            (q.numbers ?? [q.number]).includes(n),
          );
        await expect(page.locator(`#reading-question-${q.number}`)).toHaveCount(
          1,
        );
        seen.push(n);
      }
    }
  }
  expect(new Set(seen).size).toBe(40);
  const geometry = await page
    .locator(".candidate-source, .candidate-converted")
    .evaluateAll((els) =>
      els.map((el) => {
        const r = el.getBoundingClientRect();
        return { x: r.x, y: r.y };
      }),
    );
  expect(Math.abs(geometry[0].y - geometry[1].y)).toBeLessThan(2);
  expect(geometry[1].x).toBeGreaterThan(geometry[0].x);
  await page.getByLabel("Candidate source page").selectOption("10");
  await expect(page.locator(".reading-phrase-bank dt")).toHaveText([
    ..."ABCDEFGHIJK",
  ]);
  await page
    .getByLabel("Answer for question 27", { exact: true })
    .selectOption("A");
  await page
    .getByLabel("Candidate review notes")
    .fill("Human review still pending; sandbox note.");
  await page.getByRole("button", { name: "Passage 2", exact: true }).click();
  const paragraph = page.locator(
    '.candidate-converted [data-text-id="p2-paragraph-1"]',
  );
  const select = () =>
    paragraph.evaluate((el) => {
      const r = document.createRange();
      r.selectNodeContents(el);
      const s = window.getSelection()!;
      s.removeAllRanges();
      s.addRange(r);
    });
  await select();
  await page
    .getByRole("toolbar", { name: "Selection actions" })
    .getByRole("button", { name: "Copy", exact: true })
    .click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    raw.document.passages[1].paragraphs[0].text,
  );
  await page
    .getByRole("toolbar", { name: "Selection actions" })
    .getByRole("button", { name: "Highlight", exact: true })
    .click();
  await expect(paragraph.locator(".annotation-highlight")).toHaveCount(1);
  await select();
  await page
    .getByRole("toolbar", { name: "Selection actions" })
    .getByRole("button", { name: "Add Note", exact: true })
    .click();
  await page
    .getByLabel("Personal note 1", { exact: true })
    .fill("Check source punctuation.");
  await expect(
    page.locator(".reading-candidate-review .review-status"),
  ).toContainText("Saved on this device");
  await page.reload();
  // Unit selection is deliberately explicit after reload; persisted data belongs to review mode.
  await page.getByLabel("Conversion unit").selectOption("19-2-reading");
  await page
    .getByRole("button", { name: "Review interactive candidate", exact: true })
    .click();
  await expect(page.getByLabel("Candidate review notes")).toHaveValue(
    "Human review still pending; sandbox note.",
  );
  await page.getByRole("button", { name: "Passage 2", exact: true }).click();
  await expect(paragraph.locator(".annotation-highlight")).toHaveCount(1);
  await paragraph.locator(".annotation-highlight").click();
  await page.getByRole("button", { name: "Unhighlight", exact: true }).click();
  await expect(paragraph.locator(".annotation-highlight")).toHaveCount(0);
  await expect(paragraph.locator(".annotation-note")).toHaveCount(1);
  await page.getByLabel("Candidate source page").selectOption("6");
  await expect(page.locator(".paragraph-choice-strip li")).toHaveText([
    ..."ABCDEF",
  ]);
  await page.getByLabel("Candidate source page").selectOption("10");
  await expect(
    page.getByLabel("Answer for question 27", { exact: true }),
  ).toHaveValue("A");
  await expect(
    page.getByRole("button", { name: /approve|certify|Submit Reading/i }),
  ).toHaveCount(0);
  expect(
    (
      await page.request.post(endpoint, {
        headers: { Origin: "http://127.0.0.1:3100" },
        data: { humanReviewed: true },
      })
    ).status(),
  ).toBe(404);
  expect(
    (
      await page.request.get("/api/private/study/19-2-reading?mode=exam")
    ).status(),
  ).toBe(403);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.goto("/exam/19/2/reading/practice");
  await page
    .getByRole("button", { name: "Start New Attempt", exact: true })
    .click();
  await expect(
    page.getByLabel("Answer for question 1", { exact: true }),
  ).toHaveValue("");
  await page.getByRole("button", { name: /^Passage 3/ }).click();
  await expect(
    page.getByLabel("Answer for question 27", { exact: true }),
  ).toHaveValue("");
  await expect(
    page.locator(".annotation-highlight, .annotation-note"),
  ).toHaveCount(0);
  expect(errors).toEqual([]);
});
