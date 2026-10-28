import { localDataRoot } from "../../src/lib/server/local-data";
import { test, expect } from "@playwright/test";
import { readFile, writeFile, unlink } from "node:fs/promises";
import path from "node:path";

test("C19 T1 Reading: verified paragraphs, split resize, selective unhighlight, notes and answer persistence", async ({
  page,
}) => {
  const file = path.join(localDataRoot(), "study/19-1-reading-practice.json");
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
    const key = JSON.parse(
      await readFile("../answers/Cambridge19/T1_Reading.json", "utf8"),
    );
    await page.goto("/exam/19/1/reading/practice?attempt=legacy");
    await expect(page.locator(".reading-passage h2")).toHaveText(
      content.passages[0].title,
    );
    await expect(page.locator(".review-columns")).toHaveCount(0);
    await expect(page.locator(".optional-scan")).toHaveCount(0);
    const paragraph = page.locator('[data-text-id="p1-paragraph-1"]');
    await expect(paragraph).toHaveText(content.passages[0].paragraphs[0].text);
    await expect(page.locator(".reading-passage article > p")).toHaveCount(12);
    for (const group of content.passages[0].groups)
      for (const q of group.questions) {
        const input = page.getByLabel(`Answer for question ${q.number}`, {
          exact: true,
        });
        if (q.options) await input.selectOption(key[q.number][0].toUpperCase());
        else await input.fill(key[q.number][0]);
      }
    const select = async () =>
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
      .getByRole("button", { name: "Underline", exact: true })
      .click();
    await paragraph.locator(".annotation-highlight").first().click();
    await page
      .getByRole("dialog", { name: "Annotation actions" })
      .getByRole("button", { name: "Unhighlight", exact: true })
      .click();
    await expect(paragraph.locator(".annotation-highlight")).toHaveCount(0);
    await expect(paragraph.locator(".annotation-underline")).toHaveCount(1);
    await paragraph.locator(".annotation-underline").click();
    await page.getByRole("button", { name: "Edit Note", exact: true }).click();
    await page
      .getByLabel("Edit annotation note")
      .fill("Check this paragraph again.");
    await page.getByRole("button", { name: "Close annotation menu" }).click();
    await expect(page.locator(".study-status")).toContainText(
      "Saved on this device",
    );
    await page.reload();
    await expect(
      page.getByLabel("Answer for question 13", { exact: true }),
    ).toHaveValue(key[13][0]);
    await expect(paragraph.locator(".annotation-highlight")).toHaveCount(0);
    await expect(paragraph.locator(".annotation-underline")).toHaveCount(1);
    await expect(
      page.locator(".study-inline-notes textarea").last(),
    ).toHaveValue("Check this paragraph again.");
    const divider = page.getByRole("separator", {
      name: "Resize passage columns",
    });
    await divider.focus();
    await divider.press("ArrowRight");
    await expect(divider).toHaveAttribute("aria-valuenow", "54");
    await page
      .getByRole("button", { name: "View original scan", exact: true })
      .click();
    await expect(page.getByAltText("Original source scan")).toBeVisible();
    await page
      .getByRole("button", { name: "Hide original scan", exact: true })
      .click();
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

test("C19 T1 Writing and Speaking: single verified tasks, chart zoom, editor persistence and preparation timer", async ({
  page,
}) => {
  const files = ["19-1-writing-practice", "19-1-speaking-practice"].map((id) =>
    path.join(localDataRoot(), `study/${id}.json`),
  );
  const previous = await Promise.all(
    files.map((file) => readFile(file).catch(() => null)),
  );
  try {
    await page.goto("/exam/19/1/writing/practice");
    await expect(page.locator(".writing-prompt h2")).toHaveText(
      "WRITING TASK 1",
    );
    await expect(
      page.locator(".review-columns, .ocr-text, .optional-scan"),
    ).toHaveCount(0);
    const chart = page.getByAltText(
      "Verified Task 1 chart with original labels, axes and legend",
    );
    await expect
      .poll(() => chart.evaluate((el: HTMLImageElement) => el.naturalWidth))
      .toBe(1326);
    await page.getByRole("button", { name: "Zoom chart", exact: true }).click();
    await expect(page.getByAltText("Zoomed verified chart")).toBeVisible();
    await page
      .getByRole("button", { name: "Close chart", exact: true })
      .click();
    await page
      .getByLabel("Writing task1 response")
      .fill("This is a saved writing response.");
    await expect(page.locator(".writing-editor")).toContainText("6 words");
    await expect(page.locator(".study-status")).toContainText(
      "Saved on this device",
    );
    await page.reload();
    await expect(page.getByLabel("Writing task1 response")).toHaveValue(
      "This is a saved writing response.",
    );
    await page
      .getByRole("button", { name: "WRITING TASK 2", exact: true })
      .click();
    await expect(page.locator(".writing-prompt h2")).toHaveText(
      "WRITING TASK 2",
    );
    await expect(chart).toHaveCount(0);
    await page.goto("/exam/19/1/speaking/practice");
    await expect(page.locator(".speaking-card")).toHaveCount(1);
    await expect(
      page.locator(".review-columns, .ocr-text, .optional-scan"),
    ).toHaveCount(0);
    await page.getByRole("button", { name: "Part 2", exact: true }).click();
    await expect(page.locator(".speaking-card h2")).toHaveText("Part 2");
    await page
      .getByRole("button", { name: "Start preparation", exact: true })
      .click();
    await expect(page.getByLabel("Preparation time remaining")).not.toHaveText(
      "1:00",
    );
    await page.getByLabel("Preparation notes").fill("A private speaking note.");
    await expect(page.locator(".study-status")).toContainText(
      "Saved on this device",
    );
    await page.reload();
    await expect(page.getByLabel("Preparation notes")).toHaveValue(
      "A private speaking note.",
    );
  } finally {
    await page.goto("about:blank");
    for (let i = 0; i < files.length; i++) {
      if (previous[i]) await writeFile(files[i], previous[i]!);
      else await unlink(files[i]).catch(() => {});
    }
  }
});

test("C19 T1 Listening punctuation, compact map letters and click-to-unhighlight", async ({
  page,
}) => {
  let id: string | undefined;
  try {
    await page.goto("/exam/19/1/listening/practice");
    await page.getByRole("button", { name: "Begin Listening" }).click();
    await expect(page.locator(".source-notes")).toContainText("park’s");
    await expect(page.locator(".source-notes")).toContainText("£");
    const text = page.locator('[data-text-id="title"]');
    await text.evaluate((el) => {
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
    await text.locator(".annotation-highlight").click();
    await page
      .getByRole("button", { name: "Unhighlight", exact: true })
      .click();
    await expect(text.locator(".annotation-highlight")).toHaveCount(0);
    id = await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem("ielts:attempt:v1:19-1:practice")!).id,
    );
    await page.locator(".part-tabs button").nth(1).click();
    await expect(page.locator(".converted-map")).toBeVisible();
    const letters = page.getByLabel("Answer for question 16", { exact: true });
    await expect(letters.locator("option")).toHaveText([
      "Choose a letter",
      ..."ABCDEFGH",
    ]);
    await letters.selectOption("H");
    await expect(
      page.getByText("Saved on this device", { exact: true }),
    ).toBeVisible();
    await page.reload();
    await expect(letters).toHaveValue("H");
    await page.locator(".part-tabs button").nth(2).click();
    await expect(page.locator("#question-29")).toContainText(
      "‘ghost kitchens’",
    );
    await expect(
      page
        .getByLabel("Answer for question 29", { exact: true })
        .locator("option"),
    ).toHaveText(["Choose a letter", ..."ABCDEFGH"]);
  } finally {
    if (id)
      await unlink(path.join(localDataRoot(), `attempts/${id}.json`)).catch(() => {});
  }
});
