import { test, expect } from "@playwright/test";
import { readFile, writeFile, unlink } from "node:fs/promises";
import path from "node:path";

test("C19 T1 Passage 2: real 14-26, choose-two limits, inline summary, passage navigation and persistent annotations", async ({
  page,
}) => {
  const file = path.resolve(".local/study/19-1-reading-practice.json");
  const previous = await readFile(file).catch(() => null);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  try {
    const content = JSON.parse(
      await readFile(
        "../private-content/Cambridge19/T1_Reading/reviewed.json",
        "utf8",
      ),
    );
    const passage = content.passages.find(
      (p: { id: string }) => p.id === "passage-2",
    );
    const key = JSON.parse(
      await readFile("../answers/Cambridge19/T1_Reading.json", "utf8"),
    );
    await page.goto("/exam/19/1/reading/practice");
    await page
      .getByLabel("Answer for question 1", { exact: true })
      .selectOption(key[1][0].toUpperCase());
    await page.getByRole("button", { name: "Passage 2", exact: true }).click();
    await expect(page.locator(".reading-passage h2")).toHaveText(passage.title);
    await expect(
      page.getByRole("button", { name: "Passage 2", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator(".paragraph-label")).toHaveText([..."ABCDEFG"]);
    for (const p of passage.paragraphs)
      await expect(page.locator(`[data-text-id="${p.id}"]`)).toHaveText(p.text);
    await expect(page.locator(".optional-scan, .review-columns")).toHaveCount(
      0,
    );
    for (const group of passage.groups)
      for (const q of group.questions) {
        if (q.numbers) {
          const choices = page.getByRole("group", {
            name: `Questions ${q.numbers.join("–")}`,
            exact: true,
          });
          await choices
            .getByRole("button", { name: "Clear choices", exact: true })
            .click();
          for (const letter of key[q.number])
            await choices
              .getByRole("checkbox", {
                name: letter.toUpperCase(),
                exact: true,
              })
              .check();
          await expect(choices.locator("input:checked")).toHaveCount(2);
          await expect(
            choices.locator("input:not(:checked)").first(),
          ).toBeDisabled();
          // Deselecting frees a slot; restoring keeps the other response intact.
          await choices
            .getByRole("checkbox", {
              name: key[q.number][0].toUpperCase(),
              exact: true,
            })
            .uncheck();
          await expect(choices.locator("input:disabled")).toHaveCount(0);
          await choices
            .getByRole("checkbox", {
              name: key[q.number][0].toUpperCase(),
              exact: true,
            })
            .check();
        } else if (q.options) {
          const answer = page.getByLabel(`Answer for question ${q.number}`, {
            exact: true,
          });
          await expect(answer.locator("option")).toHaveText([
            "Choose an answer",
            ..."ABCDEFG",
          ]);
          await answer.selectOption(key[q.number][0].toUpperCase());
        } else
          await page
            .getByLabel(`Answer for question ${q.number}`, { exact: true })
            .fill(key[q.number][0]);
      }
    await expect(page.locator(".reading-summary input")).toHaveCount(3);
    const paragraph = page.locator('[data-text-id="p2-paragraph-1"]');
    await paragraph.evaluate((el) => {
      const range = document.createRange();
      range.selectNodeContents(el);
      const selection = window.getSelection()!;
      selection.removeAllRanges();
      selection.addRange(range);
    });
    await page
      .getByRole("toolbar", { name: "Selection actions" })
      .getByRole("button", { name: "Highlight", exact: true })
      .click();
    await expect(page.locator(".study-status")).toContainText(
      "Saved on this device",
    );
    await page.reload();
    await expect(page.locator(".reading-passage h2")).toHaveText(passage.title);
    await expect(paragraph.locator(".annotation-highlight")).toHaveCount(1);
    await expect(
      page.getByLabel("Answer for question 26", { exact: true }),
    ).toHaveValue(key[26][0]);
    await expect(
      page
        .getByRole("group", { name: "Questions 20–21", exact: true })
        .locator("input:checked"),
    ).toHaveCount(2);
    await paragraph.locator(".annotation-highlight").click();
    await page
      .getByRole("button", { name: "Unhighlight", exact: true })
      .click();
    await expect(paragraph.locator(".annotation-highlight")).toHaveCount(0);
    await page
      .getByRole("button", { name: "View original scan", exact: true })
      .click();
    await expect(page.getByAltText("Original source scan")).toHaveAttribute(
      "src",
      /page_19\.png$/,
    );
    await expect(page.locator(".optional-scan a")).toHaveCount(5);
    await page.getByRole("button", { name: /Passage 3/ }).click();
    await expect(page.locator(".reading-passage h2")).toHaveText(
      content.passages[2].title,
    );
    await expect(
      page.locator(".reading-questions input, .reading-questions select"),
    ).toHaveCount(26);
    await page
      .getByRole("button", { name: "View original scan", exact: true })
      .click();
    await expect(page.getByAltText("Original source scan")).toHaveAttribute(
      "src",
      /page_24\.png$/,
    );
    await page.getByRole("button", { name: "Passage 1", exact: true }).click();
    await expect(
      page.getByLabel("Answer for question 1", { exact: true }),
    ).toHaveValue(key[1][0].toUpperCase());
    await page.getByRole("button", { name: "Passage 2", exact: true }).click();
    await expect(
      page.getByLabel("Answer for question 26", { exact: true }),
    ).toHaveValue(key[26][0]);
    await expect(page.locator(".study-status")).toContainText(
      "Saved on this device",
    );
    await page.reload();
    await expect(paragraph.locator(".annotation-highlight")).toHaveCount(0);
    await page.setViewportSize({ width: 390, height: 844 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    expect(errors).toEqual([]);
  } finally {
    await page.goto("about:blank");
    if (previous) await writeFile(file, previous);
    else await unlink(file).catch(() => {});
  }
});
