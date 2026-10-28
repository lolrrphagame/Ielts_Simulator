import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { localDataRoot } from "../../src/lib/server/local-data";

test("Reading Start New is blank; Resume retains answers/notes; A-J bank has ten clean entries in two columns", async ({
  page,
}) => {
  expect(localDataRoot()).toContain("test-runs");
  await page.goto("/exam/19/1/reading/practice");
  await expect(page.locator(".reading-workspace")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Start New Attempt", exact: true })
    .click();
  await expect(
    page.getByLabel("Answer for question 1", { exact: true }),
  ).toHaveValue("");
  const first = new URL(page.url()).searchParams.get("attempt")!;
  await page
    .getByLabel("Answer for question 1", { exact: true })
    .selectOption("TRUE");
  const paragraph = page.locator('[data-text-id="p1-paragraph-1"]');
  await paragraph.evaluate((el) => {
    const r = document.createRange();
    r.selectNodeContents(el);
    const s = window.getSelection()!;
    s.removeAllRanges();
    s.addRange(r);
  });
  await page
    .getByRole("toolbar", { name: "Selection actions" })
    .getByRole("button", { name: "Highlight", exact: true })
    .click();
  await page.locator(".personal-study-notes summary").click();
  await page
    .getByLabel("Review notes", { exact: true })
    .fill("Notes for the first attempt only.");
  await expect(page.locator(".study-status")).toContainText(
    "Saved on this device",
  );
  await page
    .getByRole("button", { name: "Choose Attempt", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Start New Attempt", exact: true })
    .click();
  await expect(page.getByLabel("Answer for question 1", { exact: true })).toHaveValue("");
  const second = new URL(page.url()).searchParams.get("attempt")!;
  expect(second).toMatch(/^[a-f0-9-]{36}$/);
  expect(second).not.toBe(first);
  for (const part of [1, 2, 3]) {
    await page
      .getByRole("button", { name: `Passage ${part}`, exact: true })
      .click();
    expect(
      await page
        .locator(
          ".reading-questions input[type=radio]:checked, .reading-questions input[type=checkbox]:checked",
        )
        .count(),
    ).toBe(0);
    expect(
      await page
        .locator(
          ".reading-questions select, .reading-questions input:not([type=radio]):not([type=checkbox])",
        )
        .evaluateAll((elements) =>
          elements.every((el) => (el as HTMLInputElement).value === ""),
        ),
    ).toBe(true);
  }
  await expect(page.locator(".annotation-highlight")).toHaveCount(0);
  await expect(page.getByLabel("Review notes", { exact: true })).toHaveValue(
    "",
  );
  const content = JSON.parse(
    await readFile(
      "../private-content/Cambridge19/T1_Reading/reviewed.json",
      "utf8",
    ),
  );
  const bank = content.passages[2].groups[1].bank;
  await expect(page.locator(".reading-phrase-bank dt")).toHaveText([
    ..."ABCDEFGHIJ",
  ]);
  await expect(page.locator(".reading-phrase-bank dd")).toHaveText(
    bank.map((c: { label: string }) => c.label),
  );
  expect(
    await page
      .locator(".reading-phrase-bank")
      .evaluate(
        (el) => getComputedStyle(el).gridTemplateColumns.split(" ").length,
      ),
  ).toBe(2);
  for (let n = 31; n <= 36; n++)
    await expect(
      page
        .getByLabel(`Answer for question ${n}`, { exact: true })
        .locator("option"),
    ).toHaveText(["—", ..."ABCDEFGHIJ"]);
  await page
    .getByLabel("Answer for question 31", { exact: true })
    .selectOption("J");
  await expect(page.locator(".study-status")).toContainText(
    "Saved on this device",
  );
  await page.reload();
  await expect(
    page.getByLabel("Answer for question 31", { exact: true }),
  ).toHaveValue("J");
  await page
    .getByRole("button", { name: "Choose Attempt", exact: true })
    .click();
  await page.getByLabel("Saved Reading attempt").selectOption(first);
  await page
    .getByRole("button", { name: "Resume Attempt", exact: true })
    .click();
  await expect(
    page.getByLabel("Answer for question 1", { exact: true }),
  ).toHaveValue("TRUE");
  await expect(paragraph.locator(".annotation-highlight")).toHaveCount(1);
  await expect(page.getByLabel("Review notes", { exact: true })).toHaveValue(
    "Notes for the first attempt only.",
  );
  await page.reload();
  await expect(paragraph.locator(".annotation-highlight")).toHaveCount(1);
  const one = JSON.parse(
    await readFile(
      path.join(
        localDataRoot(),
        "study",
        `19-1-reading-practice-${first}.json`,
      ),
      "utf8",
    ),
  );
  const two = JSON.parse(
    await readFile(
      path.join(
        localDataRoot(),
        "study",
        `19-1-reading-practice-${second}.json`,
      ),
      "utf8",
    ),
  );
  expect(one.responses).toEqual({ 1: "TRUE" });
  expect(two.responses).toEqual({ 31: "J" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Passage 3", exact: true }).click();
  expect(
    await page
      .locator(".reading-phrase-bank")
      .evaluate(
        (el) => getComputedStyle(el).gridTemplateColumns.split(" ").length,
      ),
  ).toBe(2);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
