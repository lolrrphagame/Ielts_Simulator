import { test, expect } from "@playwright/test";
import { readFile, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import { readingReviewAttestation } from "../../src/lib/reading/review-progress";

test("isolated simulated user approval: 12 saved page reviews, transactional certification, Test 2 results and history", async ({
  page,
}) => {
  test.setTimeout(90000);
  const root = process.env.IELTS_CONTENT_ROOT!;
  expect(
    path.relative(path.resolve(".local/test-runs"), root).startsWith(".."),
  ).toBe(false);
  expect(root).not.toBe(path.resolve("../private-content"));
  const folder = path.join(root, "Cambridge19/T2_Reading");
  const names = [
    "reviewed.json",
    "reviewed-verification.json",
    "verification.json",
    "certification-transaction.json",
  ];
  const originals = await Promise.all(
    names.map((n) =>
      readFile(path.join(folder, n)).catch((e) => {
        if (e.code !== "ENOENT") throw e;
        return null;
      }),
    ),
  );
  const candidate = JSON.parse(
    await readFile(path.join(folder, "review-candidate.json"), "utf8"),
  );
  const key = JSON.parse(
    await readFile("../answers/Cambridge19/T2_Reading.json", "utf8"),
  );
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const reviewEndpoint = "/api/private/reading-review/19-2-reading";
  const headers = { Origin: "http://127.0.0.1:3100" };
  async function openReview() {
    await page.goto("/review");
    await expect(
      page.getByLabel("Conversion unit").locator("option"),
    ).toHaveCount(48);
    await page.getByLabel("Conversion unit").selectOption("19-2-reading");
    await page
      .getByRole("button", {
        name: "Review interactive candidate",
        exact: true,
      })
      .click();
    await expect(page.getByLabel("Candidate source page")).toBeVisible();
  }
  try {
    await openReview();
    await expect(
      page.getByRole("heading", { name: "0 / 12 source pages reviewed" }),
    ).toBeVisible();
    await page
      .getByLabel("Reviewer identity", { exact: true })
      .fill("Automated browser fixture - NOT actual human approval");
    await expect(
      page.getByRole("button", { name: "Review final approval", exact: true }),
    ).toBeDisabled();
    let state = (await (await page.request.get(reviewEndpoint)).json()).data;
    const approval = () => ({
      candidateSha256: state.preview.sha256,
      revision: state.progress.revision,
      reviewer: "Automated browser fixture - NOT actual human approval",
      confirmation: true,
      attestation: readingReviewAttestation,
    });
    expect(
      (
        await page.request.post(`${reviewEndpoint}/certify`, {
          headers,
          data: approval(),
        })
      ).status(),
    ).toBe(409);
    for (let i = 1; i <= 3; i++)
      await page.getByLabel(`Source check ${i}`, { exact: true }).check();
    await page
      .getByLabel("Unresolved page issues", { exact: true })
      .fill("Synthetic unresolved issue");
    await expect(
      page.getByLabel("I personally reviewed this source page", {
        exact: true,
      }),
    ).toBeDisabled();
    await page
      .getByRole("button", { name: "Save page review", exact: true })
      .click();
    await expect(
      page.getByText("Page review saved on this device.", { exact: true }),
    ).toBeVisible();
    await openReview();
    await expect(
      page.getByLabel("Unresolved page issues", { exact: true }),
    ).toHaveValue("Synthetic unresolved issue");
    await page.getByLabel("Unresolved page issues", { exact: true }).fill("");
    await page
      .getByLabel("Page resolution notes", { exact: true })
      .fill("Synthetic fixture issue resolved; test data only.");
    await page
      .getByLabel("I personally reviewed this source page", { exact: true })
      .check();
    await page
      .getByRole("button", { name: "Save page review", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "1 / 12 source pages reviewed" }),
    ).toBeVisible();
    for (let n = 1; n < 12; n++) {
      await page.getByLabel("Candidate source page").selectOption(String(n));
      for (let i = 1; i <= candidate.checklist[n].checks.length; i++)
        await page.getByLabel(`Source check ${i}`, { exact: true }).check();
      await page
        .getByLabel("I personally reviewed this source page", { exact: true })
        .check();
      await page
        .getByRole("button", { name: "Save page review", exact: true })
        .click();
      await expect(
        page.getByRole("heading", {
          name: `${n + 1} / 12 source pages reviewed`,
        }),
      ).toBeVisible();
    }
    state = (await (await page.request.get(reviewEndpoint)).json()).data;
    expect(
      (
        await page.request.post(`${reviewEndpoint}/certify`, {
          headers,
          data: { ...approval(), candidateSha256: "0".repeat(64) },
        })
      ).status(),
    ).toBe(409);
    expect(
      (
        await page.request.post(`${reviewEndpoint}/certify`, {
          headers,
          data: { ...approval(), confirmation: false },
        })
      ).status(),
    ).toBe(400);
    await page
      .getByLabel("Reviewer identity", { exact: true })
      .fill(approval().reviewer);
    await page
      .getByRole("button", { name: "Review final approval", exact: true })
      .click();
    const dialog = page.getByRole("dialog", {
      name: "Confirm human review and certification",
      exact: true,
    });
    await expect(
      dialog.getByRole("button", {
        name: "Approve and certify Reading",
        exact: true,
      }),
    ).toBeDisabled();
    await page
      .getByLabel("Explicit personal approval", { exact: true })
      .check();
    await dialog
      .getByRole("button", { name: "Approve and certify Reading", exact: true })
      .click();
    await expect(
      page.getByText(
        "Explicit review recorded. Reading certification completed.",
        { exact: true },
      ),
    ).toBeVisible();
    expect(
      (await (await page.request.get(reviewEndpoint)).json()).data.certified,
    ).toBe(true);
    expect(
      (
        await page.request.post(`${reviewEndpoint}/certify`, {
          headers,
          data: approval(),
        })
      ).status(),
    ).toBe(200);
    await openReview();
    await expect(
      page.getByRole("heading", {
        name: /Interactive review candidate.*Verified/,
      }),
    ).toBeVisible();
    await expect(
      page.getByLabel("I personally reviewed this source page", {
        exact: true,
      }),
    ).toBeDisabled();
    const certifiedConversion = (
      await (
        await page.request.get("/api/private/conversions/19-2-reading")
      ).json()
    ).data;
    expect(certifiedConversion.readingScoring.available).toBe(true);
    expect(certifiedConversion.reviewed.passages).toHaveLength(3);
    expect(certifiedConversion).not.toHaveProperty("answerKey");
    await page.goto("/exam/19/2/reading/practice");
    await page
      .getByRole("button", { name: "Start New Attempt", exact: true })
      .click();
    await expect(page).toHaveURL(/attempt=[a-f0-9-]{36}/);
    const blankId = new URL(page.url()).searchParams.get("attempt")!;
    await page
      .getByRole("button", { name: "Submit Reading", exact: true })
      .click();
    let confirm = page.getByRole("dialog", {
      name: "Confirm Reading submission",
      exact: true,
    });
    await expect(confirm).toContainText("0 answered");
    await expect(confirm).toContainText("40 unanswered");
    await confirm
      .getByRole("button", { name: "Confirm submission", exact: true })
      .click();
    await expect(
      page.getByLabel("Raw score 0 out of 40", { exact: true }),
    ).toBeVisible();
    const emptyEndpoint = `/api/private/study/19-2-reading?mode=practice&attempt=${blankId}`;
    const result0 = (await (await page.request.get(emptyEndpoint)).json()).data
      .draft;
    expect(
      (
        await page.request.put(emptyEndpoint, { headers, data: result0 })
      ).status(),
    ).toBe(409);
    const repeated = await page.request.post(
      emptyEndpoint.replace("?", "/submit?"),
      { headers, data: result0 },
    );
    expect((await repeated.json()).data).toEqual(result0);
    await page
      .getByRole("button", { name: "Choose Attempt", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Start New Attempt", exact: true })
      .click();
    await expect(
      page.getByLabel("Answer for question 1", { exact: true }),
    ).toHaveValue("");
    const fullId = new URL(page.url()).searchParams.get("attempt")!;
    expect(fullId).not.toBe(blankId);
    const fullEndpoint = `/api/private/study/19-2-reading?mode=practice&attempt=${fullId}`;
    const unsubmitted = (await (await page.request.get(fullEndpoint)).json())
      .data;
    expect(unsubmitted.draft).not.toHaveProperty("submission");
    expect(JSON.stringify(unsubmitted)).not.toContain("acceptedAnswers");
    for (const [index, p] of candidate.document.passages.entries()) {
      await page
        .getByRole("button", { name: `Passage ${index + 1}`, exact: true })
        .click();
      for (const g of p.groups)
        for (const q of g.questions) {
          if (q.choices) {
            for (const value of q.numbers
              ? [...key[q.number]].reverse()
              : [key[q.number][0]])
              await page
                .locator(`#reading-question-${q.number}`)
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
    }
    await page
      .getByRole("button", { name: "Submit Reading", exact: true })
      .click();
    confirm = page.getByRole("dialog", {
      name: "Confirm Reading submission",
      exact: true,
    });
    await expect(confirm).toContainText("40 answered");
    await confirm
      .getByRole("button", { name: "Confirm submission", exact: true })
      .click();
    await expect(
      page.getByLabel("Raw score 40 out of 40", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("region", { name: "Reading results", exact: true }),
    ).toContainText("9.0");
    await expect(
      page
        .getByRole("navigation", { name: "Review questions 1 to 40" })
        .locator("button"),
    ).toHaveCount(40);
    await page.reload();
    await expect(
      page.getByLabel("Raw score 40 out of 40", { exact: true }),
    ).toBeVisible();
    const fullResult = (await (await page.request.get(fullEndpoint)).json())
      .data.draft;
    expect(
      fullResult.submission.result.passages.map(
        (p: { score: number }) => p.score,
      ),
    ).toEqual([13, 13, 14]);
    await page
      .getByRole("button", { name: "Choose Attempt", exact: true })
      .click();
    await page.getByLabel("Saved Reading attempt").selectOption(blankId);
    await page
      .getByRole("button", { name: "View Results", exact: true })
      .click();
    await expect(
      page.getByLabel("Raw score 0 out of 40", { exact: true }),
    ).toBeVisible();
    expect(
      (await (await page.request.get(fullEndpoint)).json()).data.draft,
    ).toEqual(fullResult);
    expect(errors).toEqual([]);
  } finally {
    await page.goto("about:blank");
    // Restore only this run's copied active files. Never remove or overwrite
    // the actual private-content directory or user attempts.
    for (const [i, n] of names.entries()) {
      if (originals[i]) await writeFile(path.join(folder, n), originals[i]!);
      else await rm(path.join(folder, n), { force: true });
    }
  }
});
