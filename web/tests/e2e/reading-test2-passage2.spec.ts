import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
const origin = "http://127.0.0.1:3100";

test("T2 P2 practice: matching/completion/choose-two, pending review, scroll/answers/annotations retained", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const draft = JSON.parse(
    await readFile(
      "../private-content/Cambridge19/T2_Reading/practice-draft.json",
      "utf8",
    ),
  );
  const p = draft.document.passages[0];
  const key = JSON.parse(
    await readFile("../answers/Cambridge19/T2_Reading.json", "utf8"),
  );
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/exam/19/2/reading/practice");
  await page
    .getByRole("button", { name: "Start New Attempt", exact: true })
    .click();
  await page
    .getByLabel("Answer for question 4", { exact: true })
    .fill(key[4][0]);
  const id = new URL(page.url()).searchParams.get("attempt")!;
  await page.locator(".reading-passage").evaluate((el) => {
    el.scrollTop = 380;
  });
  await page.locator(".reading-questions").evaluate((el) => {
    el.scrollTop = 230;
  });
  const previousScroll = await page
    .locator(".reading-passage, .reading-questions")
    .evaluateAll((els) => els.map((e) => e.scrollTop));
  await page.getByRole("button", { name: /^Passage 2/ }).click();
  await expect(page.locator(".reading-passage h2")).toHaveText(p.title);
  await expect(page.locator(".study-controls strong")).toContainText(
    "Needs Review",
  );
  await expect(page.locator(".practice-review-notice")).toContainText(
    "awaiting human review",
  );
  await expect(page.locator(".paragraph-label")).toHaveText([..."ABCDEF"]);
  for (const paragraph of p.paragraphs)
    await expect(page.locator(`[data-text-id="${paragraph.id}"]`)).toHaveText(
      paragraph.text,
    );
  await expect(page.locator(".paragraph-choice-strip li")).toHaveText([
    ..."ABCDEF",
  ]);
  await expect(
    page.locator(".reading-paragraph-bank, .matching-bank-caption"),
  ).toHaveCount(0);
  await expect(page.locator(".optional-scan")).toHaveCount(0);
  for (let n = 14; n <= 18; n++) {
    const field = page.getByLabel(`Answer for question ${n}`, { exact: true });
    await expect(field.locator("option")).toHaveText([
      "Choose an answer",
      ..."ABCDEF",
    ]);
    await field.selectOption(key[n][0].toUpperCase());
  }
  for (let n = 19; n <= 22; n++)
    await page
      .getByLabel(`Answer for question ${n}`, { exact: true })
      .fill(key[n].at(-1));
  for (const n of [23, 25]) {
    const group = page.getByRole("group", {
      name: `Questions ${n}–${n + 1}`,
      exact: true,
    });
    for (const value of key[n])
      await group
        .getByRole("checkbox", { name: value.toUpperCase(), exact: true })
        .check();
    await expect(group.locator("input:checked")).toHaveCount(2);
    await expect(group.locator("input:not(:checked)").first()).toBeDisabled();
  }
  const paragraph = page.locator('[data-text-id="p2-paragraph-4"]');
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
    p.paragraphs[3].text,
  );
  await page
    .getByRole("toolbar", { name: "Selection actions" })
    .getByRole("button", { name: "Highlight", exact: true })
    .click();
  await select();
  await page
    .getByRole("toolbar", { name: "Selection actions" })
    .getByRole("button", { name: "Underline", exact: true })
    .click();
  await select();
  await page
    .getByRole("toolbar", { name: "Selection actions" })
    .getByRole("button", { name: "Add Note", exact: true })
    .click();
  await page
    .locator(".study-inline-notes textarea")
    .last()
    .fill("Review this source paragraph.");
  const secondScroll = await page
    .locator(".reading-passage, .reading-questions")
    .evaluateAll((els) => els.map((e) => e.scrollTop));
  await page.getByRole("button", { name: "Passage 1", exact: true }).click();
  expect(
    await page
      .locator(".reading-passage, .reading-questions")
      .evaluateAll((els) => els.map((e) => e.scrollTop)),
  ).toEqual(previousScroll);
  await expect(
    page.getByLabel("Answer for question 4", { exact: true }),
  ).toHaveValue(key[4][0]);
  await page.getByRole("button", { name: /^Passage 2/ }).click();
  expect(
    await page
      .locator(".reading-passage, .reading-questions")
      .evaluateAll((els) => els.map((e) => e.scrollTop)),
  ).toEqual(secondScroll);
  await expect(page.locator(".study-status")).toContainText(
    "Saved on this device",
  );
  await page.reload();
  await expect(
    page.getByLabel("Answer for question 22", { exact: true }),
  ).toHaveValue(key[22].at(-1));
  await expect(paragraph.locator(".annotation-highlight")).toHaveCount(1);
  await expect(page.locator(".study-inline-notes textarea").last()).toHaveValue(
    "Review this source paragraph.",
  );
  await paragraph.locator(".annotation-highlight").click();
  await page.getByRole("button", { name: "Unhighlight", exact: true }).click();
  await expect(paragraph.locator(".annotation-highlight")).toHaveCount(0);
  await expect(paragraph.locator(".annotation-underline")).toHaveCount(1);
  await page
    .getByRole("button", { name: "View original scan", exact: true })
    .click();
  await expect(page.getByAltText("Original source scan")).toHaveAttribute(
    "src",
    /page_43\.png$/,
  );
  await expect(page.locator(".optional-scan a")).toHaveCount(4);
  await page.getByRole("button", { name: /^Passage 3/ }).click();
  await expect(page.locator(".reading-passage")).toContainText("Needs Review");
  await expect(
    page.locator(".reading-questions input, .reading-questions select"),
  ).toHaveCount(0);
  await expect(page.locator(".study-status")).toContainText(
    "Saved on this device",
  );
  const endpoint = `/api/private/study/19-2-reading?mode=practice&attempt=${id}`;
  const before = (await (await page.request.get(endpoint)).json()).data.draft;
  expect(Object.keys(before.responses)).toHaveLength(14);
  expect(before).not.toHaveProperty("submission");
  const blocked = await page.request.post(endpoint.replace("?", "/submit?"), {
    headers: { Origin: origin },
    data: before,
  });
  expect(blocked.status()).toBe(409);
  expect((await (await page.request.get(endpoint)).json()).data.draft).toEqual(
    before,
  );
  expect(
    (
      await page.request.get(
        `/api/private/study/19-2-reading?mode=exam&attempt=${id}`,
      )
    ).status(),
  ).toBe(403);
  await page.getByRole("button", { name: /^Passage 2/ }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});
