import { test, expect, type Page } from "@playwright/test";
const headers = { Origin: "http://127.0.0.1:3100" };
async function start(page: Page, id = "19-1", mode = "practice") {
  await page.goto(`/exam/${id.replace("-", "/")}/listening/${mode}`);
  await expect(
    page.getByRole("region", { name: "Listening attempts", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Start New Attempt", exact: true })
    .click();
  await expect(
    page.getByLabel("Answer for question 1", { exact: true }),
  ).toBeVisible();
  return new URL(page.url()).searchParams.get("attempt")!;
}
const endpoint = (testId: string, id: string, mode = "practice") =>
  `/api/private/listening-attempts/${testId}/${id}?mode=${mode}`;
async function saved(page: Page) {
  await expect(
    page.getByText("Saved on this device", { exact: true }),
  ).toBeVisible();
}

for (const testId of ["19-1", "19-2"])
  test(`${testId}: shared picker, Practice audio sync, same-Part position, stale events, resume and new blank`, async ({
    page,
  }) => {
    const id = await start(page, testId);
    await page
      .getByLabel("Answer for question 1", { exact: true })
      .fill("Personal first answer");
    await page
      .getByRole("button", { name: "Bookmark question 1", exact: true })
      .click();
    const title = page.locator('.rendered-content [data-text-id="title"]');
    const select = () =>
      title.evaluate((el) => {
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
      .getByRole("textbox", { name: "Personal note 2", exact: true })
      .fill("Attempt-specific note");
    const part = testId === "19-1" ? 3 : 2;
    await page
      .locator(".part-tabs button")
      .nth(part - 1)
      .click();
    await expect(page.locator("audio")).toHaveAttribute(
      "src",
      new RegExp(`section-${part}$`),
    );
    await expect
      .poll(() =>
        page.locator("audio").evaluate((a: HTMLAudioElement) => a.readyState),
      )
      .toBeGreaterThan(0);
    expect(
      await page
        .locator("audio")
        .evaluate((a: HTMLAudioElement) => a.paused && a.currentTime < 0.1),
    ).toBe(true);
    await page.getByRole("button", { name: "Play audio", exact: true }).click();
    await page.locator("audio").evaluate((a: HTMLAudioElement) => {
      a.dataset.sameTrack = "yes";
      a.currentTime = 17;
      a.pause();
    });
    await page
      .getByRole("button", {
        name: new RegExp(`^Go to question ${(part - 1) * 10 + 5},`),
      })
      .click();
    await expect(page.locator("audio")).toHaveAttribute(
      "data-same-track",
      "yes",
    );
    expect(
      await page
        .locator("audio")
        .evaluate(
          (a: HTMLAudioElement) =>
            a.currentTime >= 16 && a.currentTime < 19 && a.paused,
        ),
    ).toBe(true);
    const stale = await page.locator("audio").elementHandle();
    await page.locator(".part-tabs button").nth(3).click();
    await expect(page.locator("audio")).toHaveAttribute("src", /section-4$/);
    await expect
      .poll(() =>
        page.locator("audio").evaluate((a: HTMLAudioElement) => a.readyState),
      )
      .toBeGreaterThan(0);
    await stale!.evaluate((a: HTMLAudioElement) => {
      a.dispatchEvent(new Event("pause", { bubbles: true }));
      a.dispatchEvent(new Event("timeupdate", { bubbles: true }));
      a.dispatchEvent(new Event("ended", { bubbles: true }));
    });
    expect(
      await page
        .locator("audio")
        .evaluate((a: HTMLAudioElement) => a.currentTime < 0.1 && a.paused),
    ).toBe(true);
    await page
      .getByRole("combobox", { name: "Recording", exact: true })
      .selectOption("1");
    await expect(page.locator(".part-tabs button").nth(1)).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(page.locator("audio")).toHaveAttribute("src", /section-2$/);
    await expect
      .poll(() =>
        page.locator("audio").evaluate((a: HTMLAudioElement) => a.readyState),
      )
      .toBeGreaterThan(0);
    await page.locator("audio").evaluate((a: HTMLAudioElement) => {
      a.currentTime = 9;
      a.pause();
    });
    await saved(page);
    await page.reload();
    await expect(page.locator(".part-tabs button").nth(1)).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(page.locator("audio")).toHaveAttribute("src", /section-2$/);
    await expect
      .poll(() =>
        page.locator("audio").evaluate((a: HTMLAudioElement) => a.currentTime),
      )
      .toBeGreaterThanOrEqual(8);
    expect(new URL(page.url()).searchParams.get("attempt")).toBe(id);
    await page
      .getByRole("button", { name: "Bookmark question 11", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Choose Attempt", exact: true })
      .click();
    await expect(
      page.getByLabel("Saved Listening attempt", { exact: true }),
    ).toHaveValue(id);
    const old = (await (await page.request.get(endpoint(testId, id))).json())
      .data;
    expect(old.responses[1]).toBe("Personal first answer");
    expect(old.audioIndex).toBe(1);
    expect(old.audioTime).toBeGreaterThanOrEqual(8);
    await page
      .getByRole("button", { name: "Start New Attempt", exact: true })
      .click();
    await expect(
      page.getByLabel("Answer for question 1", { exact: true }),
    ).toHaveValue("");
    const freshId = new URL(page.url()).searchParams.get("attempt")!;
    expect(freshId).not.toBe(id);
    const fresh = (
      await (await page.request.get(endpoint(testId, freshId))).json()
    ).data;
    expect(Object.keys(fresh.responses)).toHaveLength(40);
    expect(Object.values(fresh.responses).every((v) => v === "")).toBe(true);
    expect(fresh.annotations).toEqual([]);
    expect(fresh.bookmarks).toEqual([]);
    expect(fresh.audioTime).toBe(0);
    expect(fresh.active).toBe(1);
    await page
      .getByRole("button", { name: "Choose Attempt", exact: true })
      .click();
    await page
      .getByLabel("Saved Listening attempt", { exact: true })
      .selectOption(id);
    await page
      .getByRole("button", { name: "Resume Attempt", exact: true })
      .click();
    await expect(page.locator("audio")).toHaveAttribute("src", /section-2$/);
    await expect
      .poll(() =>
        page.locator("audio").evaluate((a: HTMLAudioElement) => a.currentTime),
      )
      .toBeGreaterThanOrEqual(8);
    expect(new URL(page.url()).searchParams.get("attempt")).toBe(id);
    await page.locator(".part-tabs button").first().click();
    await expect(
      page.getByLabel("Answer for question 1", { exact: true }),
    ).toHaveValue("Personal first answer");
    await expect(title.locator(".annotation-highlight")).toHaveCount(1);
    await expect(
      page.getByRole("textbox", { name: "Personal note 2", exact: true }),
    ).toHaveValue("Attempt-specific note");
    await expect(
      page.getByRole("button", { name: "Bookmark question 1", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    if (testId === "19-2") {
      await expect(
        page.getByRole("button", { name: "Submit answers", exact: true }),
      ).toHaveCount(0);
      await saved(page);
      const before = (
        await (await page.request.get(endpoint(testId, id))).json()
      ).data;
      const submit = endpoint(testId, id).replace("?", "/submit?");
      expect(
        (await page.request.post(submit, { headers, data: before })).status(),
      ).toBe(409);
      expect(
        (await (await page.request.get(endpoint(testId, id))).json()).data,
      ).toEqual(before);
    } else {
      await page
        .getByRole("button", { name: "Play audio", exact: true })
        .click();
      await page.locator("audio").evaluate((a: HTMLAudioElement) => {
        a.currentTime = a.duration - 0.15;
      });
      await expect(page.locator("audio")).toHaveAttribute("src", /section-2$/);
      await expect(page.locator(".part-tabs button").nth(1)).toHaveAttribute(
        "aria-pressed",
        "true",
      );
      await expect
        .poll(() =>
          page
            .locator("audio")
            .evaluate((a: HTMLAudioElement) => a.currentTime),
        )
        .toBeGreaterThan(0);
      await page
        .getByRole("button", { name: "Pause audio", exact: true })
        .click();
    }
  });

test("Listening scoped history API and submitted results are private, immutable and available through the shared picker", async ({
  page,
  request,
}) => {
  expect(
    (
      await request.get("/api/private/listening-attempts/19-1?mode=practice")
    ).status(),
  ).toBe(403);
  await page.goto("/exam/19/1/listening/practice");
  await expect(
    page.getByRole("region", { name: "Listening attempts", exact: true }),
  ).toBeVisible();
  const create = async (id: string, mode: string) =>
    (
      await (
        await page.request.post(
          `/api/private/listening-attempts/${id}?mode=${mode}`,
          { headers },
        )
      ).json()
    ).data;
  const a = await create("19-1", "practice"),
    other = await create("19-2", "practice"),
    exam = await create("19-1", "exam");
  const own = endpoint("19-1", a.id);
  expect((await page.request.get(endpoint("19-2", a.id))).status()).toBe(404);
  expect(
    (
      await page.request.put(endpoint("19-1", a.id, "exam"), {
        headers,
        data: a,
      })
    ).status(),
  ).toBe(404);
  expect(
    (
      await page.request.get(
        "/api/private/listening-attempts/19-9?mode=practice",
      )
    ).status(),
  ).toBe(400);
  expect(
    (
      await page.request.get("/api/private/listening-attempts/19-1?mode=wrong")
    ).status(),
  ).toBe(400);
  const submitted = (
    await (
      await page.request.post(own.replace("?", "/submit?"), {
        headers,
        data: a,
      })
    ).json()
  ).data;
  expect(submitted.result.score).toBe(0);
  const historyResponse = await page.request.get(
    "/api/private/listening-attempts/19-1?mode=practice",
  );
  expect(historyResponse.headers()["cache-control"]).toContain("no-store");
  const rows = (await historyResponse.json()).data;
  expect(
    rows.some((r: { id: string }) => [other.id, exam.id].includes(r.id)),
  ).toBe(false);
  const row = rows.find((r: { id: string }) => r.id === a.id);
  expect(row.status).toBe("submitted");
  expect(row.score).toBe(0);
  expect(row.answered).toBe(0);
  expect(Object.keys(row).sort()).toEqual(
    [
      "id",
      "testId",
      "mode",
      "status",
      "startedAt",
      "submittedAt",
      "answered",
      "score",
    ].sort(),
  );
  await page.reload();
  await page
    .getByLabel("Saved Listening attempt", { exact: true })
    .selectOption(a.id);
  await page
    .getByRole("button", { name: "View Submitted Results", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "0 / 40", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByLabel("Answer for question 1", { exact: true }),
  ).toBeDisabled();
  await page.locator(".part-tabs button").nth(3).click();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "0 / 40", exact: true }),
  ).toBeVisible();
  expect(
    (await page.request.put(own, { headers, data: submitted })).status(),
  ).toBe(409);
  expect(
    (
      await (
        await page.request.post(own.replace("?", "/submit?"), {
          headers,
          data: a,
        })
      ).json()
    ).data,
  ).toEqual(submitted);
  expect((await (await page.request.get(own)).json()).data).toEqual(submitted);
  const legacy = await create("19-1", "practice");
  await page.evaluate((a) => {
    const key = "ielts:attempt:v1:19-1:practice";
    localStorage.removeItem(`${key}:${a.id}`);
    localStorage.setItem(
      key,
      JSON.stringify({
        ...a,
        responses: { 1: "Legacy browser-only pending answer" },
      }),
    );
  }, legacy);
  await page.goto("/exam/19/1/listening/practice");
  await page
    .getByRole("button", { name: "Start New Attempt", exact: true })
    .click();
  await expect(
    page.getByLabel("Answer for question 1", { exact: true }),
  ).toHaveValue("");
  expect(
    await page.evaluate(
      (id) =>
        JSON.parse(
          localStorage.getItem(`ielts:attempt:v1:19-1:practice:${id}`)!,
        ).responses[1],
      legacy.id,
    ),
  ).toBe("Legacy browser-only pending answer");
  await page
    .getByRole("button", { name: "Choose Attempt", exact: true })
    .click();
  await page
    .getByLabel("Saved Listening attempt", { exact: true })
    .selectOption(legacy.id);
  await page
    .getByRole("button", { name: "Resume Attempt", exact: true })
    .click();
  await expect(
    page.getByLabel("Answer for question 1", { exact: true }),
  ).toHaveValue("Legacy browser-only pending answer");
  await saved(page);
});

test("Exam question navigation never changes recording/deadline; single full-test audio survives Part navigation", async ({
  page,
}) => {
  const id = await start(page, "19-1", "exam");
  await expect(page.locator("audio")).not.toHaveAttribute("controls");
  await expect
    .poll(() =>
      page.locator("audio").evaluate((a: HTMLAudioElement) => a.readyState),
    )
    .toBeGreaterThan(0);
  await page.getByRole("button", { name: "Play audio", exact: true }).click();
  await page.locator("audio").evaluate((a: HTMLAudioElement) => {
    a.currentTime = 7;
    a.dispatchEvent(new Event("timeupdate", { bubbles: true }));
  });
  const before = (
    await (await page.request.get(endpoint("19-1", id, "exam"))).json()
  ).data;
  await page.locator(".part-tabs button").nth(2).click();
  await expect(page.locator("audio")).toHaveAttribute("src", /section-1$/);
  expect(
    await page
      .locator("audio")
      .evaluate((a: HTMLAudioElement) => a.currentTime),
  ).toBeGreaterThanOrEqual(7);
  await saved(page);
  await page.reload();
  await expect(page.locator("audio")).toHaveAttribute("src", /section-1$/);
  expect(
    (await (await page.request.get(endpoint("19-1", id, "exam"))).json()).data
      .deadline,
  ).toBe(before.deadline);
  await expect
    .poll(() =>
      page.locator("audio").evaluate((a: HTMLAudioElement) => a.readyState),
    )
    .toBeGreaterThan(0);
  await page.getByRole("button", { name: "Play audio", exact: true }).click();
  await page.locator("audio").evaluate((a: HTMLAudioElement) => {
    a.currentTime = a.duration - 0.15;
  });
  await expect(page.locator("audio")).toHaveAttribute("src", /section-2$/);
  await expect(page.locator(".part-tabs button").nth(2)).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect
    .poll(() =>
      page.locator("audio").evaluate((a: HTMLAudioElement) => a.currentTime),
    )
    .toBeGreaterThan(0);
  await saved(page);
  expect(
    (await (await page.request.get(endpoint("19-1", id, "exam"))).json()).data
      .deadline,
  ).toBe(before.deadline);
  await start(page, "21-1", "practice");
  await expect
    .poll(() =>
      page.locator("audio").evaluate((a: HTMLAudioElement) => a.readyState),
    )
    .toBeGreaterThan(0);
  await page.locator("audio").evaluate((a: HTMLAudioElement) => {
    a.currentTime = 23;
    a.dataset.fullTrack = "same";
  });
  await page.locator(".part-tabs button").nth(3).click();
  await expect(page.locator("audio")).toHaveAttribute("src", /audio\/full$/);
  await expect(page.locator("audio")).toHaveAttribute(
    "data-full-track",
    "same",
  );
  expect(
    await page
      .locator("audio")
      .evaluate((a: HTMLAudioElement) => a.currentTime),
  ).toBeGreaterThanOrEqual(23);
  await saved(page);
  await page.reload();
  await expect(page.locator(".part-tabs button").nth(3)).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect
    .poll(() =>
      page.locator("audio").evaluate((a: HTMLAudioElement) => a.currentTime),
    )
    .toBeGreaterThanOrEqual(23);
});

test("Attempt switching flushes delayed saves, blocks on failure/conflict, and retains unsaved browser recovery data", async ({
  page,
}) => {
  const id = await start(page),
    own = endpoint("19-1", id);
  await saved(page);
  const pattern = "**/api/private/listening-attempts/19-1/*";
  await page.route(pattern, async (route) => {
    if (route.request().method() === "PUT")
      await new Promise((resolve) => setTimeout(resolve, 500));
    await route.continue();
  });
  const put = page.waitForRequest(
    (r) => r.method() === "PUT" && r.url().includes(`/19-1/${id}`),
  );
  await page
    .getByLabel("Answer for question 1", { exact: true })
    .fill("first pending edit");
  await put;
  await page
    .getByLabel("Answer for question 1", { exact: true })
    .fill("latest pending edit");
  await page
    .getByRole("button", { name: "Choose Attempt", exact: true })
    .click();
  await expect(
    page.getByLabel("Saved Listening attempt", { exact: true }),
  ).toBeVisible();
  expect((await (await page.request.get(own)).json()).data.responses[1]).toBe(
    "latest pending edit",
  );
  await page.unroute(pattern);
  await page
    .getByLabel("Saved Listening attempt", { exact: true })
    .selectOption(id);
  await page
    .getByRole("button", { name: "Resume Attempt", exact: true })
    .click();
  await saved(page);
  await page.route(pattern, (route) =>
    route.request().method() === "PUT" ? route.abort() : route.continue(),
  );
  await page
    .getByLabel("Answer for question 1", { exact: true })
    .fill("offline pending edit");
  await page
    .getByRole("button", { name: "Choose Attempt", exact: true })
    .click();
  await expect(
    page.getByText("Save failed — local draft retained", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByLabel("Saved Listening attempt", { exact: true }),
  ).toHaveCount(0);
  expect(new URL(page.url()).searchParams.get("attempt")).toBe(id);
  await page.unroute(pattern);
  await page
    .getByRole("button", { name: "Choose Attempt", exact: true })
    .click();
  await expect(
    page.getByLabel("Saved Listening attempt", { exact: true }),
  ).toBeVisible();
  expect((await (await page.request.get(own)).json()).data.responses[1]).toBe(
    "offline pending edit",
  );
  await page
    .getByLabel("Saved Listening attempt", { exact: true })
    .selectOption(id);
  await page
    .getByRole("button", { name: "Resume Attempt", exact: true })
    .click();
  await saved(page);
  const server = (await (await page.request.get(own)).json()).data;
  expect(
    (
      await page.request.put(own, {
        headers,
        data: {
          ...server,
          responses: { ...server.responses, 1: "newer server answer" },
        },
      })
    ).status(),
  ).toBe(200);
  await page
    .getByLabel("Answer for question 1", { exact: true })
    .fill("unsaved local conflict");
  await expect(page.locator(".listening-workspace [role=alert]")).toContainText(
    "another tab",
  );
  await expect(
    page.getByRole("button", { name: "Choose Attempt", exact: true }),
  ).toBeDisabled();
  expect((await (await page.request.get(own)).json()).data.responses[1]).toBe(
    "newer server answer",
  );
  page.once("dialog", (dialog) => dialog.accept());
  await page.reload();
  await expect(
    page.getByRole("button", {
      name: "Download retained browser draft",
      exact: true,
    }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      (id) =>
        Object.keys(localStorage)
          .filter((k) => k.includes(id + ":conflict:"))
          .some(
            (k) =>
              JSON.parse(localStorage.getItem(k)!).responses[1] ===
              "unsaved local conflict",
          ),
      id,
    ),
  ).toBe(true);
  expect((await (await page.request.get(own)).json()).data.responses[1]).toBe(
    "newer server answer",
  );
});
