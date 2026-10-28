import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
const origin = "http://127.0.0.1:3100";

test("C19 T2: actual Passage 1 notes/TFNG, separate attempts, annotations/resume; unrevised passages and grading stay locked", async ({
  page,
}) => {
  const content = JSON.parse(
    await readFile(
      "../private-content/Cambridge19/T2_Reading/reviewed.json",
      "utf8",
    ),
  );
  const key = JSON.parse(
    await readFile("../answers/Cambridge19/T2_Reading.json", "utf8"),
  );
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/exam/19/2/reading/practice");
  await page
    .getByRole("button", { name: "Start New Attempt", exact: true })
    .click();
  await expect(page.locator(".reading-passage h2")).toHaveText(
    content.passages[0].title,
  );
  const id = new URL(page.url()).searchParams.get("attempt")!;
  for (const p of content.passages[0].paragraphs)
    await expect(page.locator(`[data-text-id="${p.id}"]`)).toHaveText(p.text);
  await expect(page.locator(".reading-note-heading")).toHaveText(
    content.passages[0].groups[0].questions.flatMap(
      (q: { context?: { kind: string; text: string }[] }) =>
        q.context?.filter((b) => b.kind === "heading").map((b) => b.text) ?? [],
    ),
  );
  for (let n = 1; n <= 7; n++)
    await page
      .getByLabel(`Answer for question ${n}`, { exact: true })
      .fill(key[n].at(-1));
  for (let n = 8; n <= 13; n++) {
    const input = page.getByLabel(`Answer for question ${n}`, { exact: true });
    await expect(input.locator("option")).toHaveText([
      "Choose an answer",
      "TRUE",
      "FALSE",
      "NOT GIVEN",
    ]);
    await input.selectOption(key[n][0].toUpperCase());
  }
  const paragraph = page.locator('[data-text-id="p1-paragraph-2"]');
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
    .getByRole("button", { name: "Highlight", exact: true })
    .click();
  await select();
  await page
    .getByRole("toolbar", { name: "Selection actions" })
    .getByRole("button", { name: "Add Note", exact: true })
    .click();
  await page
    .locator(".study-inline-notes textarea")
    .last()
    .fill("Study note for Test 2 only.");
  await expect(page.locator(".study-status")).toContainText(
    "Saved on this device",
  );
  await page.reload();
  await expect(
    page.getByLabel("Answer for question 4", { exact: true }),
  ).toHaveValue(key[4].at(-1));
  await expect(paragraph.locator(".annotation-highlight")).toHaveCount(1);
  await expect(page.locator(".study-inline-notes textarea").last()).toHaveValue(
    "Study note for Test 2 only.",
  );
  await paragraph.locator(".annotation-highlight").click();
  await page.getByRole("button", { name: "Unhighlight", exact: true }).click();
  await expect(paragraph.locator(".annotation-highlight")).toHaveCount(0);
  await expect(paragraph.locator(".annotation-note")).toHaveCount(1);
  await page
    .getByRole("button", { name: "View original scan", exact: true })
    .click();
  await expect(page.getByAltText("Original source scan")).toHaveAttribute(
    "src",
    /page_39\.png$/,
  );
  await expect(page.locator(".optional-scan a")).toHaveCount(4);
  await expect(
    page.getByRole("button", { name: "Submit Reading", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: /^Passage 2/ }).click();
  await expect(page.locator(".practice-review-notice")).toContainText(
    "awaiting human review",
  );
  await expect(
    page.getByLabel("Answer for question 14", { exact: true }),
  ).toBeVisible();
  for (const n of [3]) {
    await page
      .getByRole("button", { name: new RegExp(`Passage ${n}`) })
      .click();
    await expect(page.locator(".practice-review-notice")).toContainText(
      "awaiting human review",
    );
    await expect(
      page.locator(".reading-questions input, .reading-questions select"),
    ).toHaveCount(23);
  }
  const endpoint = `/api/private/study/19-2-reading?mode=practice&attempt=${id}`;
  const saved = (await (await page.request.get(endpoint)).json()).data.draft;
  expect(saved).not.toHaveProperty("submission");
  expect(JSON.stringify(saved)).not.toContain("acceptedAnswers");
  const blocked = await page.request.post(endpoint.replace("?", "/submit?"), {
    headers: { Origin: origin },
    data: saved,
  });
  expect(blocked.status()).toBe(409);
  expect((await (await page.request.get(endpoint)).json()).data.draft).toEqual(
    saved,
  );
  expect(
    (
      await page.request.get(
        `/api/private/study/19-1-reading?mode=practice&attempt=${id}`,
      )
    ).status(),
  ).toBe(404);
  expect(
    (
      await page.request.get(
        `/api/private/study/19-2-reading?mode=exam&attempt=${id}`,
      )
    ).status(),
  ).toBe(403);
  await page
    .getByRole("button", { name: "Choose Attempt", exact: true })
    .click();
  await page.getByLabel("Saved Reading attempt").selectOption(id);
  await page
    .getByRole("button", { name: "Resume Attempt", exact: true })
    .click();
  await expect(
    page.getByLabel("Answer for question 13", { exact: true }),
  ).toHaveValue(key[13][0].toUpperCase());
  await page
    .getByRole("button", { name: "Choose Attempt", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Start New Attempt", exact: true })
    .click();
  await expect(
    page.getByLabel("Answer for question 1", { exact: true }),
  ).toHaveValue("");
  await expect(page.locator(".annotation-note")).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});
