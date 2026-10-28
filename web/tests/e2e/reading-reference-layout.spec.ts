import { test, expect } from "@playwright/test";

test("Paragraph A-F choices share one desktop row; mobile wraps and repeated answers persist", async ({
  page,
}) => {
  await page.goto("/exam/19/2/reading/practice");
  await page
    .getByRole("button", { name: "Start New Attempt", exact: true })
    .click();
  await page.getByRole("button", { name: /^Passage 2/ }).click();
  const strip = page.getByRole("list", {
    name: "Paragraph choices",
    exact: true,
  });
  await expect(strip.locator("li")).toHaveText([..."ABCDEF"]);
  await expect(
    page.locator(".reading-paragraph-bank, .matching-bank-caption"),
  ).toHaveCount(0);
  await expect(
    page.getByText("Paragraph references", { exact: false }),
  ).toHaveCount(0);
  await expect(strip.locator("dd, button, input, select")).toHaveCount(0);
  await expect(page.locator(".reading-passage .paragraph-label")).toHaveText([
    ..."ABCDEF",
  ]);
  for (const width of [1440, 390, 280]) {
    await page.setViewportSize({ width, height: 1000 });
    const boxes = await strip.locator("li").evaluateAll((elements) =>
      elements.map((el) => {
        const r = el.getBoundingClientRect();
        return { top: r.top, left: r.left, right: r.right, bottom: r.bottom };
      }),
    );
    if (width === 1440)
      for (let i = 1; i < boxes.length; i++) {
        expect(Math.abs(boxes[i].top - boxes[0].top)).toBeLessThanOrEqual(1);
        expect(boxes[i].left - boxes[i - 1].right).toBeGreaterThanOrEqual(7);
      }
    if (width === 280) expect(boxes.at(-1)!.top).toBeGreaterThan(boxes[0].top);
    const bounds = await strip.boundingBox();
    expect(bounds).not.toBeNull();
    for (const box of boxes)
      expect(box.right).toBeLessThanOrEqual(bounds!.x + bounds!.width + 1);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  for (let n = 14; n <= 18; n++) {
    const input = page.getByLabel(`Answer for question ${n}`, { exact: true });
    await expect(input.locator("option")).toHaveText([
      "Choose an answer",
      ..."ABCDEF",
    ]);
    await input.selectOption("F");
    expect(
      await input.evaluate((el) => el.getBoundingClientRect().width),
    ).toBeLessThanOrEqual(100);
  }
  await expect(page.locator(".study-status")).toContainText(
    "Saved on this device",
  );
  await page.reload();
  for (let n = 14; n <= 18; n++)
    await expect(
      page.getByLabel(`Answer for question ${n}`, { exact: true }),
    ).toHaveValue("F");
  // Real phrase banks retain their full descriptions.
  await page.goto("/exam/19/1/reading/practice");
  await page
    .getByRole("button", { name: "Start New Attempt", exact: true })
    .click();
  await page.getByRole("button", { name: "Passage 3", exact: true }).click();
  await expect(page.getByLabel("Phrase choices").locator("dt")).toHaveText([
    ..."ABCDEFGHIJ",
  ]);
  await expect(page.getByLabel("Phrase choices").locator("dd")).toHaveCount(10);
  expect(
    await page
      .getByLabel("Phrase choices")
      .locator("dd")
      .evaluateAll((els) =>
        els.every((el) => (el.textContent ?? "").trim().length > 1),
      ),
  ).toBe(true);
});
