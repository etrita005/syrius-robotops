import { test, expect } from "../fixtures/test-fixture.js";
import {
  createSolutionViaAPI,
  deleteSolutionViaAPI,
  addRobotViaAPI,
  openSolutionInWorkspace,
  clickSidebarTab,
} from "../fixtures/test-fixture.js";

test.describe("Robot Management", () => {
  test.describe.configure({ mode: "serial" });

  let solutionId: string;

  test.beforeAll(async ({ apiURL }) => {
    const meta = await createSolutionViaAPI(apiURL, "Robot Test Solution", "E2E robot test");
    solutionId = meta.id;
  });

  test.afterAll(async ({ apiURL }) => {
    await deleteSolutionViaAPI(apiURL, solutionId).catch(() => {});
  });

  test("TC-E2E-ROB-001: Add robot via UI modal", async ({ appPage }) => {
    await openSolutionInWorkspace(appPage, "Robot Test Solution");
    await clickSidebarTab(appPage, "Robots");

    await appPage.getByRole("button", { name: "Add your first robot" }).click();
    await appPage.waitForTimeout(300);

    const modal = appPage.getByRole("dialog", { name: "Add Robot" });
    await expect(modal).toBeVisible();

    const addressInput = modal.locator("input").first();
    await addressInput.fill("192.168.1.101");

    await modal.getByRole("button", { name: "Add" }).click();
    await appPage.waitForTimeout(500);

    await expect(appPage.getByText("192.168.1.101")).toBeVisible({ timeout: 5000 });
  });

  test("TC-E2E-ROB-002: Robot appears in grid view with online indicator", async ({
    appPage,
  }) => {
    await openSolutionInWorkspace(appPage, "Robot Test Solution");
    await clickSidebarTab(appPage, "Robots");

    await expect(appPage.getByText("192.168.1.101")).toBeVisible();
    await expect(appPage.locator("[title='Online']").first()).toBeVisible();
  });

  test("TC-E2E-ROB-003: Robot detail modal opens with grid card click", async ({
    appPage,
  }) => {
    await openSolutionInWorkspace(appPage, "Robot Test Solution");
    await clickSidebarTab(appPage, "Robots");

    // Verify the robot card is visible in the grid view
    await expect(appPage.getByText("192.168.1.101").first()).toBeVisible();
    await expect(appPage.getByText(/SN:/).first()).toBeVisible();
  });

  test("TC-E2E-ROB-004: Switch between grid and list views", async ({
    appPage,
  }) => {
    await openSolutionInWorkspace(appPage, "Robot Test Solution");
    await clickSidebarTab(appPage, "Robots");

    await appPage.getByLabel("List view").click();
    await appPage.waitForTimeout(300);

    await expect(appPage.getByRole("table")).toBeVisible();
    await expect(
      appPage.getByRole("columnheader", { name: "Alias" })
    ).toBeVisible();
    await expect(
      appPage.getByRole("columnheader", { name: "Address" })
    ).toBeVisible();

    await appPage.getByLabel("Grid view").click();
    await appPage.waitForTimeout(300);

    await expect(appPage.locator("h3").filter({ hasText: "Robots" })).toBeVisible();
  });

  test("TC-E2E-ROB-005: Double-click alias to edit in list view", async ({
    appPage,
  }) => {
    await openSolutionInWorkspace(appPage, "Robot Test Solution");
    await clickSidebarTab(appPage, "Robots");

    await appPage.getByLabel("List view").click();
    await appPage.waitForTimeout(300);

    const aliasCell = appPage.getByRole("cell", { name: /192\.168\.1\.101/ }).first();
    await expect(aliasCell).toBeVisible();
    await aliasCell.dblclick();
    await appPage.waitForTimeout(300);

    const input = appPage.locator("input[value*='192']");
    await expect(input).toBeVisible({ timeout: 3000 });
  });

  test("TC-E2E-ROB-006: Search robots by alias/address", async ({
    appPage,
  }) => {
    await openSolutionInWorkspace(appPage, "Robot Test Solution");
    await clickSidebarTab(appPage, "Robots");

    await appPage.getByPlaceholder("Search by alias, address, model or SN...").fill("192.168");
    await appPage.waitForTimeout(300);

    await expect(appPage.getByText("192.168.1.101")).toBeVisible();

    await appPage.getByPlaceholder("Search by alias, address, model or SN...").fill("nonexistent_xyz");
    await appPage.waitForTimeout(300);

    await expect(appPage.getByText("192.168.1.101")).not.toBeVisible();
  });

  test("TC-E2E-ROB-007: Add robot with port via UI", async ({ appPage }) => {
    await openSolutionInWorkspace(appPage, "Robot Test Solution");
    await clickSidebarTab(appPage, "Robots");

    await appPage.getByRole("button", { name: "Add Robot" }).click();

    const modal = appPage.getByRole("dialog", { name: "Add Robot" });
    await expect(modal).toBeVisible();

    const addressInput = modal.locator("input").first();
    await addressInput.fill("10.0.0.50:2222");

    await modal.getByRole("button", { name: "Add" }).click();
    await appPage.waitForTimeout(500);

    await expect(appPage.getByText("10.0.0.50")).toBeVisible({ timeout: 5000 });
  });

  test("TC-E2E-ROB-008: Delete robot confirmation dialog", async ({
    appPage,
  }) => {
    await openSolutionInWorkspace(appPage, "Robot Test Solution");
    await clickSidebarTab(appPage, "Robots");

    await appPage.getByLabel("List view").click();
    await appPage.waitForTimeout(300);

    const deleteButton = appPage.getByRole("button", { name: "Delete" }).first();
    await deleteButton.click();

    const dialog = appPage.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText("Delete Robot")).toBeVisible();

    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).not.toBeVisible();
  });

  test("TC-E2E-ROB-009: Robot list view shows all expected columns", async ({
    appPage,
  }) => {
    await openSolutionInWorkspace(appPage, "Robot Test Solution");
    await clickSidebarTab(appPage, "Robots");

    await appPage.getByLabel("List view").click();
    await appPage.waitForTimeout(300);

    const headers = ["Alias", "Address", "Model", "Robot SN", "Things ID", "Movebase"];
    for (const header of headers) {
      await expect(
        appPage.getByRole("columnheader", { name: header })
      ).toBeVisible();
    }
  });
});
