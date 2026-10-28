import { test, expect } from "@playwright/test";
import { readFile, writeFile, unlink } from "node:fs/promises";
import path from "node:path";

test("C19 T1 all 40 Reading positions: three passages, actual types, notes, unhighlight and reload", async ({
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
    const key = JSON.parse(
      await readFile("../answers/Cambridge19/T1_Reading.json", "utf8"),
    );
    await page.goto("/exam/19/1/reading/practice");
    for (let i = 0; i < 3; i++) {
      await page
        .getByRole("button", { name: `Passage ${i + 1}`, exact: true })
        .click();
      await expect(page.locator(".reading-passage h2")).toHaveText(
        content.passages[i].title,
      );
      for (const group of content.passages[i].groups)
        for (const q of group.questions) {
          if (q.choices) {
            const field = page.locator(`#reading-question-${q.number}`);
            const choices = q.numbers ? key[q.number] : [key[q.number][0]];
            if (q.numbers)
              await field
                .getByRole("button", { name: "Clear choices", exact: true })
                .click();
            for (const choice of choices)
              await field
                .getByRole(q.numbers ? "checkbox" : "radio", {
                  name: choice.toUpperCase(),
                  exact: true,
                })
                .check();
            await expect(field.locator("input:checked")).toHaveCount(
              q.numbers ? 2 : 1,
            );
          } else {
            const input = page.getByLabel(`Answer for question ${q.number}`, {
              exact: true,
            });
            if (q.options)
              await input.selectOption(key[q.number][0].toUpperCase());
            else await input.fill(key[q.number][0]);
          }
        }
    }
    await expect(page.locator(".reading-summary select")).toHaveCount(6);
    await expect(
      page
        .getByLabel("Answer for question 31", { exact: true })
        .locator("option"),
    ).toHaveText(["—", ..."ABCDEFGHIJ"]);
    await expect(
      page
        .getByLabel("Answer for question 37", { exact: true })
        .locator("option"),
    ).toHaveText(["Choose an answer", "YES", "NO", "NOT GIVEN"]);
    await expect(page.getByRole("definition")).toHaveCount(10);
    await expect(page.locator(".optional-scan")).toHaveCount(0);
    const paragraph = page.locator('[data-text-id="p3-paragraph-5"]');
    await expect(paragraph).toHaveText(content.passages[2].paragraphs[4].text);
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
      .fill("Revisit this paragraph after reviewing the passage.");
    await expect(page.locator(".study-status")).toContainText(
      "Saved on this device",
    );
    const saved = JSON.parse(await readFile(file, "utf8"));
    expect(
      Object.keys(saved.responses).filter((n) => /^\d+$/.test(n)),
    ).toHaveLength(40);
    for (const p of content.passages)
      for (const g of p.groups)
        for (const q of g.questions) {
          if (q.numbers)
            expect(
              q.numbers
                .map((n: number) => saved.responses[n].toUpperCase())
                .sort(),
            ).toEqual(key[q.number].map((a: string) => a.toUpperCase()).sort());
          else
            expect(key[q.number].map((a: string) => a.toUpperCase())).toContain(
              saved.responses[q.number].toUpperCase(),
            );
        }
    await page.reload();
    await expect(
      page.getByRole("button", { name: "Passage 3", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(paragraph.locator(".annotation-highlight")).toHaveCount(1);
    await expect(
      page.getByLabel("Answer for question 40", { exact: true }),
    ).toHaveValue(key[40][0].toUpperCase());
    await expect(
      page.locator(".study-inline-notes textarea").last(),
    ).toHaveValue("Revisit this paragraph after reviewing the passage.");
    await paragraph.locator(".annotation-highlight").click();
    await page
      .getByRole("button", { name: "Unhighlight", exact: true })
      .click();
    await expect(paragraph.locator(".annotation-highlight")).toHaveCount(0);
    await expect(paragraph.locator(".annotation-note")).toHaveCount(1);
    await page
      .getByRole("button", { name: "View original scan", exact: true })
      .click();
    await expect(page.getByAltText("Original source scan")).toHaveAttribute(
      "src",
      /page_24\.png$/,
    );
    await expect(page.locator(".optional-scan a")).toHaveCount(5);
    await page.getByRole("button", { name: "Passage 1", exact: true }).click();
    await expect(
      page.getByLabel("Answer for question 1", { exact: true }),
    ).toHaveValue(key[1][0].toUpperCase());
    await page.getByRole("button", { name: "Passage 2", exact: true }).click();
    await expect(
      page.getByLabel("Answer for question 26", { exact: true }),
    ).toHaveValue(key[26][0]);
    await page.getByRole("button", { name: "Passage 3", exact: true }).click();
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
