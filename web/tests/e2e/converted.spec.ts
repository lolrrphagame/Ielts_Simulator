import { test, expect } from "@playwright/test";
import { readFile, unlink } from "node:fs/promises";
import path from "node:path";
import type { QuestionDocument } from "../../src/lib/listening/content";

test("real C19 T1: all four converted parts, annotations, copy, audio, reload, 40/40", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const key = JSON.parse(
    await readFile(
      path.resolve("../answers/Cambridge19/T1_Listening.json"),
      "utf8",
    ),
  );
  let id: string | undefined;
  try {
    await page.goto("/exam/19/1/listening/practice");
    await page.getByRole("button", { name: "Begin Listening" }).click();
    await expect(
      page.getByLabel("Answer for question 1", { exact: true }),
    ).toBeVisible();
    id = await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem("ielts:attempt:v1:19-1:practice")!).id,
    );
    for (let part = 1; part <= 4; part++) {
      await page
        .locator(".part-tabs button")
        .nth(part - 1)
        .click();
      const doc: QuestionDocument = JSON.parse(
        await readFile(
          path.resolve(
            `../private-content/Cambridge19/T1_Listening/part-${part}.json`,
          ),
          "utf8",
        ),
      );
      await expect(page.locator(".rendered-content h2")).toHaveText(doc.title);
      for (const block of doc.blocks) {
        for (const run of block.runs)
          if (run.kind === "gap")
            await page
              .getByLabel(`Answer for question ${run.question}`, {
                exact: true,
              })
              .fill(key[run.question][0]);
        if (block.interaction) {
          const q = block.interaction,
            n = q.numbers[0];
          if (q.kind === "matching")
            await page
              .getByLabel(`Answer for question ${n}`, { exact: true })
              .selectOption(key[n][0].toUpperCase());
          else
            for (const choice of q.kind === "multiple" ? key[n] : [key[n][0]])
              await page
                .locator(`#question-${n}`)
                .getByLabel(choice.toUpperCase(), { exact: true })
                .check();
        }
      }
    }
    const selectText = async () =>
      page.locator('[data-text-id="q31-0"]').evaluate((el) => {
        const range = document.createRange();
        range.selectNodeContents(el);
        const selection = window.getSelection()!;
        selection.removeAllRanges();
        selection.addRange(range);
      });
    await selectText();
    await page
      .getByRole("toolbar", { name: "Selection actions" })
      .getByRole("button", { name: "Highlight", exact: true })
      .click();
    await expect(
      page.locator('[data-text-id="q31-0"] .annotation-highlight'),
    ).toBeVisible();
    await selectText();
    await page
      .getByRole("toolbar", { name: "Selection actions" })
      .getByRole("button", { name: "Underline", exact: true })
      .click();
    await selectText();
    await page
      .getByRole("toolbar", { name: "Selection actions" })
      .getByRole("button", { name: "Copy", exact: true })
      .click();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
      await page.locator('[data-text-id="q31-0"]').innerText(),
    );
    await page
      .getByRole("toolbar", { name: "Selection actions" })
      .getByRole("button", { name: "Add Note", exact: true })
      .click();
    await page
      .getByRole("textbox", { name: "Personal note 3" })
      .fill("Review this sentence after listening.");
    await page
      .getByRole("button", { name: "Bookmark question 31", exact: true })
      .click();
    await expect(
      page.getByText("Saved on this device", { exact: true }),
    ).toBeVisible();
    await page.reload();
    await expect(
      page.getByRole("textbox", { name: "Personal note 3" }),
    ).toHaveValue("Review this sentence after listening.");
    await expect(
      page.locator(
        '[data-text-id="q31-0"] .annotation-highlight.annotation-underline',
      ),
    ).toBeVisible();
    await expect(
      page.getByLabel("Answer for question 40", { exact: true }),
    ).toHaveValue(key[40][0]);
    await page
      .getByRole("button", { name: "View original scan", exact: true })
      .click();
    await expect(page.locator(".optional-scan img")).toHaveAttribute(
      "src",
      /page_14$/,
    );
    await page
      .getByRole("button", { name: "Hide original scan", exact: true })
      .click();
    await page.locator(".listening-audio select").selectOption("3");
    await expect
      .poll(() =>
        page.locator("audio").evaluate((el: HTMLAudioElement) => el.duration),
      )
      .toBeGreaterThan(60);
    await page.locator("audio").evaluate((el: HTMLAudioElement) => el.play());
    await expect
      .poll(() =>
        page
          .locator("audio")
          .evaluate((el: HTMLAudioElement) => el.currentTime),
      )
      .toBeGreaterThan(0);
    await page.locator("audio").evaluate((el: HTMLAudioElement) => el.pause());
    await page
      .getByRole("button", { name: "Submit answers", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Confirm submission", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "40 / 40", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByLabel("Answer for question 31", { exact: true }),
    ).toBeDisabled();
  } finally {
    if (id)
      await unlink(path.join(".local/attempts", `${id}.json`)).catch(() => {});
  }
});
