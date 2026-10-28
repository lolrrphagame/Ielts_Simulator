import { test, expect } from "@playwright/test";

test("Reading paragraph references keep A-F beside their descriptions on desktop and mobile", async ({
  page,
}) => {
  await page.goto("/exam/19/2/reading/practice");
  await page
    .getByRole("button", { name: "Start New Attempt", exact: true })
    .click();
  await page.getByRole("button", { name: /^Passage 2/ }).click();
  const rows = page.locator(".reading-paragraph-bank > .reading-bank-row");
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await expect(rows).toHaveCount(6);
    await expect(rows.locator("dt")).toHaveText([..."ABCDEF"]);
    const positions = await rows.evaluateAll((elements) =>
      elements.map((row) => {
        const label = row.querySelector("dt")!,
          description = row.querySelector("dd")!;
        const a = label.getBoundingClientRect(),
          b = description.getBoundingClientRect(),
          bounds = row.getBoundingClientRect();
        return {
          topDifference: Math.abs(a.top - b.top),
          letterWidth: a.width,
          gap: b.left - a.right,
          descriptionRight: b.right,
          rowRight: bounds.right,
          top: bounds.top,
          bottom: bounds.bottom,
          height: b.height,
          lineHeight: Number.parseFloat(
            getComputedStyle(description).lineHeight,
          ),
        };
      }),
    );
    for (const [index, row] of positions.entries()) {
      expect(row.topDifference).toBeLessThanOrEqual(1);
      expect(row.letterWidth).toBeCloseTo(20, 0);
      expect(row.gap).toBeGreaterThanOrEqual(7);
      expect(row.descriptionRight).toBeLessThanOrEqual(row.rowRight + 1);
      if (index)
        expect(row.top - positions[index - 1].bottom).toBeGreaterThanOrEqual(7);
    }
    // The longest reference wraps inside the description column, preserving its label row.
    expect(positions[3].height).toBeGreaterThan(positions[3].lineHeight * 1.5);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
});
