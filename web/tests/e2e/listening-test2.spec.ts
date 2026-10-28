import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { privateContentRoot } from "../../src/lib/server/content-root";
import {
  documentText,
  type QuestionDocument,
} from "../../src/lib/listening/content";

test("C19 T2 Listening: four native parts, real audio, all 40 answers, annotations/resume, blank new and blocked grading", async ({
  page,
  context,
  request,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const docs: QuestionDocument[] = await Promise.all(
    [1, 2, 3, 4].map(async (n) =>
      JSON.parse(
        await readFile(
          privateContentRoot() + `/Cambridge19/T2_Listening/part-${n}.json`,
          "utf8",
        ),
      ),
    ),
  );
  const key = JSON.parse(
    await readFile("../answers/Cambridge19/T2_Listening.json", "utf8"),
  );
  expect((await request.get("/api/private/content/19-2/1")).status()).toBe(403);
  expect(
    (
      await request.get("/private-content/Cambridge19/T2_Listening/part-1.json")
    ).status(),
  ).toBe(404);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/exam/19/2/listening/practice");
  await page
    .getByRole("button", { name: "Begin Listening", exact: true })
    .click();
  await expect(
    page.getByLabel("Answer for question 1", { exact: true }),
  ).toBeVisible();
  const id = await page.evaluate(
    () =>
      JSON.parse(localStorage.getItem("ielts:attempt:v1:19-2:practice")!).id,
  );
  const expected: Record<string, string> = {};
  for (const doc of docs) {
    await page
      .locator(".part-tabs button")
      .nth(doc.section - 1)
      .click();
    await expect(page.locator(".rendered-content h2")).toHaveText(doc.title);
    await expect(page.locator(".optional-scan")).toHaveCount(0);
    await expect(page.locator(".rendered-content input:checked")).toHaveCount(
      0,
    );
    for (const field of await page
      .locator(
        ".rendered-content input:not([type=radio]):not([type=checkbox]), .rendered-content select",
      )
      .all())
      await expect(field).toHaveValue("");
    const payload = await page.request.get(
      `/api/private/content/19-2/${doc.section}`,
    );
    expect(payload.headers()["cache-control"]).toContain("no-store");
    const body = (await payload.json()).data;
    expect(body).not.toHaveProperty("answers");
    expect(body).not.toHaveProperty("answerKey");
    for (const [textId, text] of documentText(doc)) {
      // Matching descriptions are rendered once in the bank rather than repeated in selects.
      if (
        doc.blocks.some(
          (b) =>
            b.interaction?.kind === "matching" &&
            textId.startsWith(`${b.id}-option-`),
        )
      )
        continue;
      await expect(
        page.locator(`.rendered-content [data-text-id="${textId}"]`),
      ).toHaveText(text);
    }
    if (doc.section === 1) {
      await expect(page.locator(".listening-content-table")).toHaveCount(2);
      await expect(
        page.locator(".listening-content-table").nth(1).locator("th"),
      ).toHaveText(
        docs[0].blocks.find((b) => b.id === "p1-lesson")!.table!.headers!,
      );
    }
    if (doc.section === 3) {
      const bank = page.locator(".listening-choice-bank > div");
      await expect(bank.locator("dt")).toHaveText([..."ABCDEF"]);
      await expect(bank.locator("dd")).toHaveText(
        doc.blocks.find((b) => b.bank)!.bank!.options.map((o) => o.label),
      );
      const positions = await bank.evaluateAll((rows) =>
        rows.map((row) => {
          const l = row.querySelector("dt")!.getBoundingClientRect(),
            d = row.querySelector("dd")!.getBoundingClientRect();
          return { x: l.x, y: l.y, descriptionY: d.y };
        }),
      );
      expect(Math.abs(positions[0].y - positions[1].y)).toBeLessThan(2);
      expect(positions[1].x).toBeGreaterThan(positions[0].x);
      expect(positions.every((p) => Math.abs(p.y - p.descriptionY) < 2)).toBe(
        true,
      );
    }
    for (const block of doc.blocks) {
      for (const run of [...block.runs, ...(block.table?.rows.flat(2) ?? [])])
        if (run.kind === "gap") {
          expected[run.question] = key[run.question].at(-1);
          await page
            .getByLabel(`Answer for question ${run.question}`, { exact: true })
            .fill(expected[run.question]);
        }
      const q = block.interaction;
      if (!q) continue;
      if (q.kind === "matching") {
        const field = page.getByLabel(`Answer for question ${q.numbers[0]}`, {
          exact: true,
        });
        await expect(field.locator("option")).toHaveText([
          "Choose a letter",
          ..."ABCDEF",
        ]);
        expected[q.numbers[0]] = key[q.numbers[0]][0].toUpperCase();
        await field.selectOption(expected[q.numbers[0]]);
      } else {
        const values =
          q.kind === "multiple"
            ? [...key[q.numbers[0]]].reverse()
            : [key[q.numbers[0]][0]];
        for (const [index, value] of values.entries()) {
          expected[q.numbers[index]] = value.toUpperCase();
          await page
            .locator(`#question-${q.numbers[0]}`)
            .getByLabel(value.toUpperCase(), { exact: true })
            .check();
        }
        if (q.kind === "multiple")
          await expect(
            page
              .locator(`#question-${q.numbers[0]} input:not(:checked)`)
              .first(),
          ).toBeDisabled();
      }
    }
    const recordings = page.getByRole("combobox", {
      name: "Recording",
      exact: true,
    });
    await recordings.selectOption(String(doc.section - 1));
    await expect(page.locator("audio")).toHaveAttribute(
      "src",
      new RegExp(`19-2/audio/section-${doc.section}$`),
    );
    await expect
      .poll(() =>
        page.locator("audio").evaluate((a: HTMLAudioElement) => a.duration),
      )
      .toBeGreaterThan(60);
    await page.locator("audio").evaluate((a: HTMLAudioElement) => a.play());
    await expect
      .poll(() =>
        page.locator("audio").evaluate((a: HTMLAudioElement) => a.currentTime),
      )
      .toBeGreaterThan(0);
    await page.locator("audio").evaluate((a: HTMLAudioElement) => {
      a.currentTime = 9;
      a.pause();
    });
    await page
      .getByRole("button", { name: "View original scan", exact: true })
      .click();
    await expect(
      page.getByAltText(`Original Part ${doc.section} source scan`),
    ).toHaveAttribute("src", new RegExp(`page_${doc.sourcePage}$`));
    await expect(page.locator(".optional-scan a")).toHaveCount(
      doc.sourcePages!.length + 1,
    );
    await page
      .getByRole("button", { name: "Hide original scan", exact: true })
      .click();
  }
  const paragraph = page.locator('[data-text-id="q31-0"]');
  const select = () =>
    paragraph.evaluate((el) => {
      const range = document.createRange();
      range.selectNodeContents(el);
      const s = window.getSelection()!;
      s.removeAllRanges();
      s.addRange(range);
    });
  await select();
  await page
    .getByRole("toolbar", { name: "Selection actions" })
    .getByRole("button", { name: "Copy", exact: true })
    .click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    await paragraph.innerText(),
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
    .getByRole("textbox", { name: "Personal note 2", exact: true })
    .fill("Test-only Listening note.");
  await page
    .getByRole("button", { name: "Bookmark question 31", exact: true })
    .click();
  await expect(
    page.getByText("Saved on this device", { exact: true }),
  ).toBeVisible();
  const endpoint = `/api/private/attempts/${id}`;
  await expect
    .poll(
      async () =>
        (await (await page.request.get(endpoint)).json()).data.responses,
    )
    .toEqual(expected);
  await page.reload();
  await expect(
    page.getByLabel("Answer for question 31", { exact: true }),
  ).toHaveValue(expected[31]);
  await expect(paragraph.locator(".annotation-highlight")).toHaveCount(1);
  await expect(
    page.getByRole("textbox", { name: "Personal note 2", exact: true }),
  ).toHaveValue("Test-only Listening note.");
  await expect(
    page.getByRole("button", { name: "Bookmark question 31", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect
    .poll(() =>
      page.locator("audio").evaluate((a: HTMLAudioElement) => a.currentTime),
    )
    .toBeGreaterThanOrEqual(8);
  await paragraph.locator(".annotation-highlight").click();
  await page.getByRole("button", { name: "Unhighlight", exact: true }).click();
  await expect(paragraph.locator(".annotation-highlight")).toHaveCount(0);
  await expect(page.locator(".question-grid button")).toHaveCount(40);
  await expect(
    page.getByRole("button", { name: "Submit answers", exact: true }),
  ).toHaveCount(0);
  await expect(page.getByText(/Needs Review — Practice answers/)).toBeVisible();
  await expect(
    page.getByText("Saved on this device", { exact: true }),
  ).toBeVisible();
  const saved = (await (await page.request.get(endpoint)).json()).data;
  expect(Object.keys(saved.responses)).toHaveLength(40);
  expect(saved.result).toBeNull();
  const headers = { Origin: "http://127.0.0.1:3100" };
  expect(
    (
      await page.request.post(`${endpoint}/submit`, {
        headers,
        data: { ...saved, responses: {} },
      })
    ).status(),
  ).toBe(409);
  expect((await (await page.request.get(endpoint)).json()).data).toEqual(saved);
  expect(
    (
      await page.request.post("/api/private/attempts", {
        headers,
        data: { testId: "19-2", mode: "exam" },
      })
    ).status(),
  ).toBe(403);
  page.once("dialog", (dialog) => dialog.accept());
  await page
    .getByRole("button", { name: "Start a new attempt", exact: true })
    .click();
  await expect(
    page.getByLabel("Answer for question 1", { exact: true }),
  ).toHaveValue("");
  const newId = await page.evaluate(
    () =>
      JSON.parse(localStorage.getItem("ielts:attempt:v1:19-2:practice")!).id,
  );
  expect(newId).not.toBe(id);
  expect(
    (await (await page.request.get(`/api/private/attempts/${newId}`)).json())
      .data.responses,
  ).toEqual({});
  expect(
    (await (await page.request.get(endpoint)).json()).data.responses,
  ).toEqual(expected);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.goto("/review");
  await expect(
    page.getByLabel("Conversion unit").locator("option"),
  ).toHaveCount(48);
  await page.getByLabel("Conversion unit").selectOption("19-2-listening");
  await expect(
    page.getByRole("region", { name: "Listening source review checklist" }),
  ).toBeVisible();
  await expect(
    page.locator('[aria-label="Listening source review checklist"] details'),
  ).toHaveCount(7);
  expect(errors).toEqual([]);
});
