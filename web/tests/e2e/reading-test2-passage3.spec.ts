import { privateContentRoot } from "../../src/lib/server/content-root";
import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";

test("T2 all 40 Practice slots: P3 actual controls, blank/new, autosave/resume, annotations, pending-review gates", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const approved = JSON.parse(
    await readFile(
      privateContentRoot() + "/Cambridge19/T2_Reading/reviewed.json",
      "utf8",
    ),
  );
  const draft = JSON.parse(
    await readFile(
      privateContentRoot() + "/Cambridge19/T2_Reading/practice-draft.json",
      "utf8",
    ),
  );
  const key = JSON.parse(
    await readFile("../answers/Cambridge19/T2_Reading.json", "utf8"),
  );
  const passages = [...approved.passages, ...draft.document.passages];
  const expected: Record<string, string> = {};
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/exam/19/2/reading/practice");
  await page
    .getByRole("button", { name: "Start New Attempt", exact: true })
    .click();
  await expect(page).toHaveURL(/attempt=[0-9a-f-]{36}/);
  const id = new URL(page.url()).searchParams.get("attempt")!;
  for (const [index, passage] of passages.entries()) {
    await page
      .getByRole("button", { name: new RegExp(`^Passage ${index + 1}`) })
      .click();
    await expect(page.locator(".reading-passage h2")).toHaveText(passage.title);
    await expect(page.locator(".reading-questions input:checked")).toHaveCount(
      0,
    );
    for (const field of await page
      .locator(
        ".reading-questions input:not([type=radio]):not([type=checkbox]), .reading-questions select",
      )
      .all())
      await expect(field).toHaveValue("");
    for (const group of passage.groups)
      for (const q of group.questions) {
        if (q.numbers) {
          for (const [i, n] of q.numbers.entries()) {
            expected[n] = key[q.number][i].toUpperCase();
            await page
              .locator(`#reading-question-${q.number}`)
              .getByRole("checkbox", { name: expected[n], exact: true })
              .check();
          }
        } else if (q.choices) {
          expected[q.number] = key[q.number][0].toUpperCase();
          await page
            .getByRole("group", { name: `Question ${q.number}`, exact: true })
            .getByRole("radio", { name: expected[q.number], exact: true })
            .check();
        } else {
          const field = page.getByLabel(`Answer for question ${q.number}`, {
            exact: true,
          });
          expected[q.number] = q.options
            ? key[q.number][0].toUpperCase()
            : key[q.number].at(-1);
          if (q.options) await field.selectOption(expected[q.number]);
          else await field.fill(expected[q.number]);
        }
      }
  }
  const p3 = passages[2];
  for (const paragraph of p3.paragraphs)
    await expect(page.locator(`[data-text-id="${paragraph.id}"]`)).toHaveText(
      paragraph.text,
    );
  await expect(page.locator(".reading-summary select")).toHaveCount(6);
  for (let n = 27; n <= 32; n++)
    await expect(
      page
        .getByLabel(`Answer for question ${n}`, { exact: true })
        .locator("option"),
    ).toHaveText(["—", ..."ABCDEFGHIJK"]);
  for (let n = 33; n <= 37; n++)
    await expect(
      page
        .getByLabel(`Answer for question ${n}`, { exact: true })
        .locator("option"),
    ).toHaveText(["Choose an answer", "YES", "NO", "NOT GIVEN"]);
  await expect(page.locator(".reading-single")).toHaveCount(3);
  for (const fieldset of await page.locator(".reading-single").all())
    await expect(fieldset.getByRole("radio")).toHaveCount(4);
  const bank = page.locator(".reading-phrase-bank .reading-bank-row");
  await expect(bank.locator("dt")).toHaveText([..."ABCDEFGHIJK"]);
  await expect(bank.locator("dd")).toHaveText(
    p3.groups[0].bank.map((b: { label: string }) => b.label),
  );
  // Check real coordinates: descriptions start on the letter's row, and two bank columns exist.
  const positions = await bank.evaluateAll((rows) =>
    rows.map((row) => {
      const letter = row.querySelector("dt")!.getBoundingClientRect();
      const description = row.querySelector("dd")!.getBoundingClientRect();
      return { x: letter.x, y: letter.y, descriptionY: description.y };
    }),
  );
  expect(Math.abs(positions[0].y - positions[1].y)).toBeLessThan(2);
  expect(positions[1].x).toBeGreaterThan(positions[0].x);
  expect(positions.every((p) => Math.abs(p.y - p.descriptionY) < 2)).toBe(true);
  // The second summary paragraph starts after question 29 rather than repeating the entire summary.
  const paragraphBreak = page.locator("#reading-question-30");
  await expect(paragraphBreak).toHaveClass(/summary-paragraph-start/);
  expect(
    await paragraphBreak.evaluate(
      (el) => getComputedStyle(el, "::before").display,
    ),
  ).toBe("block");
  await expect(page.locator(".optional-scan")).toHaveCount(0);
  const paragraph = page.locator('[data-text-id="p3-paragraph-3"]');
  const select = () =>
    paragraph.evaluate((el) => {
      const range = document.createRange();
      range.selectNodeContents(el);
      const selection = window.getSelection()!;
      selection.removeAllRanges();
      selection.addRange(range);
    });
  await select();
  await page
    .getByRole("toolbar", { name: "Selection actions" })
    .getByRole("button", { name: "Copy", exact: true })
    .click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    p3.paragraphs[2].text,
  );
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
    .fill("P3 isolated test note");
  await expect(page.locator(".study-status")).toContainText(
    "Saved on this device",
  );
  const endpoint = `/api/private/study/19-2-reading?mode=practice&attempt=${id}`;
  await expect
    .poll(
      async () =>
        (await (await page.request.get(endpoint)).json()).data.draft.responses,
    )
    .toEqual(expected);
  await page.reload();
  await expect(page.locator(".reading-passage h2")).toHaveText(p3.title);
  await expect(paragraph.locator(".annotation-highlight")).toHaveCount(1);
  await expect(page.locator(".study-inline-notes textarea").last()).toHaveValue(
    "P3 isolated test note",
  );
  await expect(
    page.getByLabel("Answer for question 30", { exact: true }),
  ).toHaveValue(expected[30]);
  await expect(
    page
      .getByRole("group", { name: "Question 40", exact: true })
      .getByRole("radio", { name: expected[40], exact: true }),
  ).toBeChecked();
  await paragraph.locator(".annotation-highlight").click();
  await page.getByRole("button", { name: "Unhighlight", exact: true }).click();
  await expect(paragraph.locator(".annotation-highlight")).toHaveCount(0);
  await expect(paragraph.locator(".annotation-note")).toHaveCount(1);
  await expect(page.locator(".study-status")).toContainText(
    "Saved on this device",
  );
  await page.reload();
  await expect(paragraph.locator(".annotation-highlight")).toHaveCount(0);
  await expect(paragraph.locator(".annotation-note")).toHaveCount(1);
  await page.locator(".reading-passage").evaluate((el) => {
    el.scrollTop = 350;
  });
  await page.locator(".reading-questions").evaluate((el) => {
    el.scrollTop = 180;
  });
  const scroll = await page
    .locator(".reading-passage, .reading-questions")
    .evaluateAll((els) => els.map((el) => el.scrollTop));
  await page.getByRole("button", { name: "Passage 1", exact: true }).click();
  await expect(
    page.getByLabel("Answer for question 4", { exact: true }),
  ).toHaveValue(expected[4]);
  await page.getByRole("button", { name: /^Passage 2/ }).click();
  await expect(
    page.getByLabel("Answer for question 14", { exact: true }),
  ).toHaveValue(expected[14]);
  await page.getByRole("button", { name: /^Passage 3/ }).click();
  expect(
    await page
      .locator(".reading-passage, .reading-questions")
      .evaluateAll((els) => els.map((el) => el.scrollTop)),
  ).toEqual(scroll);
  await page
    .getByRole("button", { name: "View original scan", exact: true })
    .click();
  await expect(page.getByAltText("Original source scan")).toHaveAttribute(
    "src",
    /page_47\.png$/,
  );
  await expect(page.locator(".optional-scan a")).toHaveCount(4);
  await expect(page.locator(".practice-review-notice")).toContainText(
    "awaiting human review",
  );
  await expect(
    page.getByRole("button", { name: "Submit Reading", exact: true }),
  ).toHaveCount(0);
  await expect(page.locator(".study-status")).toContainText(
    "Saved on this device",
  );
  const saved = (await (await page.request.get(endpoint)).json()).data.draft;
  expect(saved.responses).toEqual(expected);
  expect(Object.keys(saved.responses)).toHaveLength(40);
  expect(saved).not.toHaveProperty("submission");
  const blocked = await page.request.post(endpoint.replace("?", "/submit?"), {
    headers: { Origin: "http://127.0.0.1:3100" },
    data: saved,
  });
  expect(blocked.status()).toBe(409);
  expect((await (await page.request.get(endpoint)).json()).data.draft).toEqual(
    saved,
  );
  expect(
    (
      await page.request.get(endpoint.replace("mode=practice", "mode=exam"))
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
    page.getByLabel("Answer for question 4", { exact: true }),
  ).toHaveValue(expected[4]);
  await page
    .getByRole("button", { name: "Choose Attempt", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Start New Attempt", exact: true })
    .click();
  await expect
    .poll(() => new URL(page.url()).searchParams.get("attempt"))
    .not.toBe(id);
  for (let n = 1; n <= 3; n++) {
    await page
      .getByRole("button", { name: new RegExp(`^Passage ${n}`) })
      .click();
    await expect(page.locator(".reading-questions input:checked")).toHaveCount(
      0,
    );
    for (const field of await page
      .locator(
        ".reading-questions input:not([type=radio]):not([type=checkbox]), .reading-questions select",
      )
      .all())
      await expect(field).toHaveValue("");
  }
  await expect(
    page.locator(".annotation-note, .annotation-highlight"),
  ).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await expect(page.getByRole("button", { name: /^Passage 3/ })).toBeVisible();
  expect(errors).toEqual([]);
});
