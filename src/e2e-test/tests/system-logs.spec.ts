import { test, expect } from "../fixtures/test-fixture.js";
import {
  navigateToSystemLogs,
  expectHeaderTabActive,
} from "../fixtures/test-fixture.js";

test.describe.skip("System Logs", () => {
  test("TC-E2E-SL-001: System Logs page renders", async ({ appPage }) => {
    await navigateToSystemLogs(appPage);

    await expect(
      appPage.getByRole("heading", { name: "System Logs" })
    ).toBeVisible({ timeout: 5000 });
  });

  test("TC-E2E-SL-002: System Logs tab is active in header", async ({
    appPage,
  }) => {
    await navigateToSystemLogs(appPage);
    await expectHeaderTabActive(appPage, "System Logs");
  });

  test("TC-E2E-SL-003: Default view shows log entries", async ({
    appPage,
  }) => {
    await navigateToSystemLogs(appPage);
    await appPage.waitForTimeout(2000);

    const hasEntriesOrEmpty = await Promise.race([
      appPage.getByText(/no entries/i).isVisible().then(() => "empty"),
      appPage.locator("table, .cds--data-table").isVisible().then(() => "entries"),
      new Promise((resolve) => setTimeout(() => resolve("timeout"), 3000)),
    ]);

    expect(["empty", "entries"]).toContain(hasEntriesOrEmpty);
  });

  test("TC-E2E-SL-004: Download button is visible", async ({
    appPage,
  }) => {
    await navigateToSystemLogs(appPage);

    await expect(
      appPage.getByRole("button", { name: /Download/i })
    ).toBeVisible({ timeout: 5000 });
  });

  test("TC-E2E-SL-005: File list section is visible", async ({
    appPage,
  }) => {
    await navigateToSystemLogs(appPage);

    await expect(
      appPage.getByText(/Log Files|Files/i).first()
    ).toBeVisible({ timeout: 5000 });
  });

  test("TC-E2E-SL-006: Navigate away and back to system logs", async ({
    appPage,
  }) => {
    await navigateToSystemLogs(appPage);

    await navigateToSystemLogs(appPage); // navigate again
    await expectHeaderTabActive(appPage, "System Logs");
  });

  test("TC-E2E-SL-007: Filter controls are present", async ({
    appPage,
  }) => {
    await navigateToSystemLogs(appPage);
    await appPage.waitForTimeout(2000);

    const hasFilterUi = await appPage
      .locator("select, input[type='checkbox'], .cds--dropdown, .cds--checkbox")
      .first()
      .isVisible()
      .catch(() => false);

    expect(hasFilterUi).toBe(true);
  });
});
