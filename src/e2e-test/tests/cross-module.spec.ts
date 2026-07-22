import { test, expect } from "../fixtures/test-fixture.js";
import {
  createSolutionViaAPI,
  deleteSolutionViaAPI,
  addRobotViaAPI,
  openSolutionInWorkspace,
  clickSidebarTab,
  navigateToSolutions,
  navigateToArtifacts,
  navigateToSystemLogs,
  expectHeaderTabActive,
} from "../fixtures/test-fixture.js";

test.describe.skip("Cross-Module Integration", () => {
  test.describe.configure({ mode: "serial" });

  let solutionId: string;

  test.beforeAll(async ({ apiURL }) => {
    const meta = await createSolutionViaAPI(apiURL, "Cross Module Test", "E2E cross-module test");
    solutionId = meta.id;
    await addRobotViaAPI(apiURL, solutionId, "192.168.100.1");
  });

  test.afterAll(async ({ apiURL }) => {
    await deleteSolutionViaAPI(apiURL, solutionId).catch(() => {});
  });

  test("TC-E2E-CROSS-001: Solution workspace persists robots across navigation", async ({
    appPage,
  }) => {
    await openSolutionInWorkspace(appPage, "Cross Module Test");
    await clickSidebarTab(appPage, "Robots");

    await expect(appPage.getByText("192.168.100.1").first()).toBeVisible({ timeout: 5000 });

    await clickSidebarTab(appPage, "Tasks");
    await clickSidebarTab(appPage, "Robots");

    await expect(appPage.getByText("192.168.100.1").first()).toBeVisible();
  });

  test("TC-E2E-CROSS-002: Top-level tabs all accessible from workspace", async ({
    appPage,
  }) => {
    await openSolutionInWorkspace(appPage, "Cross Module Test");

    await navigateToSolutions(appPage);
    await expect(
      appPage.getByRole("heading", { name: "Solutions" })
    ).toBeVisible();

    await navigateToArtifacts(appPage);
    await expect(
      appPage.getByRole("heading", { name: "Artifact Manager" })
    ).toBeVisible();

    await navigateToSystemLogs(appPage);
    await expectHeaderTabActive(appPage, "System Logs");
  });

  test("TC-E2E-CROSS-003: Activating solution shows header info", async ({
    appPage,
  }) => {
    await openSolutionInWorkspace(appPage, "Cross Module Test");
    await expect(appPage.locator(".cds--breadcrumb").getByText("Cross Module Test")).toBeVisible();
  });

  test("TC-E2E-CROSS-004: Robot added via API appears in UI", async ({
    appPage,
    apiURL,
  }) => {
    await addRobotViaAPI(apiURL, solutionId, "10.10.10.10");

    await appPage.reload({ waitUntil: "domcontentloaded" });
    await appPage.waitForSelector("header", { timeout: 10000 });
    await openSolutionInWorkspace(appPage, "Cross Module Test");
    await clickSidebarTab(appPage, "Robots");

    // Verify at least 2 robots visible (the one from beforeAll + the new one)
    const robotCards = appPage.locator("div").filter({ hasText: "SN:" });
    const count = await robotCards.count();
    expect(count).toBeGreaterThanOrEqual(2);
  });

  test("TC-E2E-CROSS-005: Theme toggle visible and clickable", async ({
    appPage,
  }) => {
    await navigateToSolutions(appPage);

    const themeButton = appPage.getByLabel(/dark mode|light mode/i);
    await expect(themeButton).toBeVisible();
    await themeButton.click();
    await appPage.waitForTimeout(500);
    await expect(themeButton).toBeVisible();
  });

  test("TC-E2E-CROSS-006: Header navigation shows all three modules", async ({
    appPage,
  }) => {
    await navigateToSolutions(appPage);

    const nav = appPage.locator(".cds--header__nav");
    await expect(nav.getByText("Solutions")).toBeVisible();
    await expect(nav.getByText("Artifacts")).toBeVisible();
    await expect(nav.getByText("System Logs")).toBeVisible();
  });
});
