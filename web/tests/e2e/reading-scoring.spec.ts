import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
const origin = "http://127.0.0.1:3100";

test("Reading final pending answers score 40; results, alternatives, annotations and history survive reload", async ({
  page,
}) => {
  const content = JSON.parse(
    await readFile(
      "../private-content/Cambridge19/T1_Reading/reviewed.json",
      "utf8",
    ),
  );
  const key = JSON.parse(
    await readFile("../answers/Cambridge19/T1_Reading.json", "utf8"),
  );
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/exam/19/1/reading/practice");
  await page
    .getByRole("button", { name: "Start New Attempt", exact: true })
    .click();
  await expect(
    page.getByLabel("Answer for question 1", { exact: true }),
  ).toBeVisible();
  const id = new URL(page.url()).searchParams.get("attempt")!;
  const endpoint = `/api/private/study/19-1-reading?mode=practice&attempt=${id}`;
  const before = (await (await page.request.get(endpoint)).json()).data.draft;
  expect(before).not.toHaveProperty("submission");
  expect(JSON.stringify(before)).not.toContain("acceptedAnswers");
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
  for (let part = 0; part < 3; part++) {
    await page
      .getByRole("button", { name: `Passage ${part + 1}`, exact: true })
      .click();
    for (const group of content.passages[part].groups)
      for (const q of group.questions) {
        if (q.choices) {
          const field = page.locator(`#reading-question-${q.number}`);
          const values = q.numbers
            ? [...key[q.number]].reverse()
            : [key[q.number][0]];
          for (const value of values)
            await field
              .getByRole(q.numbers ? "checkbox" : "radio", {
                name: value.toUpperCase(),
                exact: true,
              })
              .check();
        } else {
          const field = page.getByLabel(`Answer for question ${q.number}`, {
            exact: true,
          });
          if (q.options)
            await field.selectOption(key[q.number][0].toUpperCase());
          else await field.fill(` ${key[q.number].at(-1).toUpperCase()} `);
        }
      }
    if (part === 0) {
      await expect(page.locator(".study-status")).toContainText(
        "Saved on this device",
      );
      await page.reload();
      await expect(
        page.getByLabel("Answer for question 11", { exact: true }),
      ).toHaveValue(` ${key[11].at(-1).toUpperCase()} `);
      await expect(paragraph.locator(".annotation-highlight")).toHaveCount(1);
    }
  }
  // Submit immediately: the last edit need not have reached the debounce timer.
  await page
    .getByRole("button", { name: "Submit Reading", exact: true })
    .click();
  const confirm = page.getByRole("dialog", {
    name: "Confirm Reading submission",
  });
  await expect(confirm).toContainText("40 answered · 0 unanswered");
  await confirm
    .getByRole("button", { name: "Confirm submission", exact: true })
    .click();
  await expect(page.getByLabel("Raw score 40 out of 40")).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Reading results" }),
  ).toContainText("9.0");
  await expect(
    page.getByRole("region", { name: "Reading results" }),
  ).toContainText("Not recorded");
  await expect(
    page
      .getByRole("navigation", { name: "Review questions 1 to 40" })
      .locator("button"),
  ).toHaveCount(40);
  await page.reload();
  await expect(page.getByLabel("Raw score 40 out of 40")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Submit Reading", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Passage 1", exact: true }).click();
  await expect(page.locator(".reading-passage h2")).toHaveText(
    content.passages[0].title,
  );
  await expect(page.locator(".reading-review-card.review-correct")).toHaveCount(
    13,
  );
  await expect(page.locator("#review-answer-11 .accepted-answers")).toHaveText(
    key[11].join(" / "),
  );
  await expect(paragraph.locator(".annotation-highlight")).toHaveCount(1);
  await page
    .getByLabel("Filter answers", { exact: true })
    .selectOption("incorrect");
  await expect(page.locator(".reading-review-card")).toHaveCount(0);
  await page.getByLabel("Filter answers", { exact: true }).selectOption("all");
  const submitted = (await (await page.request.get(endpoint)).json()).data
    .draft;
  expect(submitted.submission.attemptId).toBe(id);
  const edit = await page.request.put(endpoint, {
    headers: { Origin: origin },
    data: { ...submitted, responses: { 1: "changed" } },
  });
  expect(edit.status()).toBe(409);
  const repeated = await page.request.post(endpoint.replace("?", "/submit?"), {
    headers: { Origin: origin },
    data: { revision: 0, responses: {}, notes: "", annotations: [] },
  });
  expect((await repeated.json()).data).toEqual(submitted);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page
    .getByRole("button", { name: "Choose Attempt", exact: true })
    .click();
  await page.getByLabel("Saved Reading attempt").selectOption(id);
  await page.getByRole("button", { name: "View Results", exact: true }).click();
  await expect(page.getByLabel("Raw score 40 out of 40")).toBeVisible();
  await page
    .getByRole("button", { name: "Choose Attempt", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Start New Attempt", exact: true })
    .click();
  await expect(
    page.getByLabel("Answer for question 1", { exact: true }),
  ).toHaveValue("");
  expect(new URL(page.url()).searchParams.get("attempt")).not.toBe(id);
  await expect(
    page.getByRole("region", { name: "Reading results" }),
  ).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("Reading API withholds results until submit; blanks, partial/duplicate choices, filters and ID isolation", async ({
  page,
  request,
}) => {
  await request.post("/api/local-session", { headers: { Origin: origin } });
  const key = JSON.parse(
    await readFile("../answers/Cambridge19/T1_Reading.json", "utf8"),
  );
  const create = async () => {
    const res = await request.post(
      "/api/private/reading-attempts/19-1-reading?mode=practice",
      { headers: { Origin: origin } },
    );
    expect(res.ok()).toBe(true);
    return (await res.json()).data.id;
  };
  const a = await create(),
    b = await create();
  const endpoint = (id: string) =>
    `/api/private/study/19-1-reading?mode=practice&attempt=${id}`;
  const empty = { revision: 0, responses: {}, notes: "", annotations: [] };
  const hidden = await request.get(endpoint(a) + "&includeAnswers=true");
  expect((await hidden.json()).data.draft).not.toHaveProperty("submission");
  const blank = await request.post(endpoint(a).replace("?", "/submit?"), {
    headers: { Origin: origin },
    data: empty,
  });
  expect(blank.ok()).toBe(true);
  const zero = (await blank.json()).data;
  expect(zero.submission.result.score).toBe(0);
  expect(zero.submission.result.unanswered).toBe(40);
  const responses = {
    1: key[1][0],
    2: "incorrect",
    11: key[11].at(-1),
    20: key[20][0],
    21: key[20][0],
  };
  const mixed = await request.post(endpoint(b).replace("?", "/submit?"), {
    headers: { Origin: origin },
    data: { ...empty, responses },
  });
  expect(mixed.ok()).toBe(true);
  const scored = (await mixed.json()).data;
  expect(scored.submission.result.score).toBe(3);
  expect(scored.submission.result.incorrect).toBe(2);
  expect(scored.submission.result.unanswered).toBe(35);
  expect(scored.submission.result.marks[20].duplicate).toBe(true);
  expect(scored.submission.result.marks[19].group.earned).toBe(1);
  expect((await (await request.get(endpoint(a))).json()).data.draft).toEqual(
    zero,
  );
  // A new browser context can reopen persistent results with the same attempt ID.
  await page.goto(`/exam/19/1/reading/practice?attempt=${b}&passage=2`);
  await expect(page.getByLabel("Raw score 3 out of 40")).toBeVisible();
  await page
    .getByLabel("Filter answers", { exact: true })
    .selectOption("incorrect");
  await expect(page.locator(".reading-review-card")).toHaveCount(1);
  await expect(page.locator(".reading-review-card")).toContainText(
    "Duplicate selection",
  );
  await page
    .getByLabel("Filter answers", { exact: true })
    .selectOption("unanswered");
  await expect(page.locator(".reading-review-card")).toHaveCount(11);
  await page
    .getByLabel("Filter answers", { exact: true })
    .selectOption("correct");
  await expect(page.locator(".reading-review-card")).toHaveCount(1);
});
