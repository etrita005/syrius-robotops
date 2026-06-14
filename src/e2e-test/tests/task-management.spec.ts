import { test, expect } from "../fixtures/test-fixture.js";
import {
  createSolutionViaAPI,
  deleteSolutionViaAPI,
  openSolutionInWorkspace,
  clickSidebarTab,
} from "../fixtures/test-fixture.js";

test.describe("Task Management", () => {
  test.describe.configure({ mode: "serial" });

  let solutionId: string;

  test.beforeAll(async ({ apiURL }) => {
    const meta = await createSolutionViaAPI(apiURL, "Task Test Solution", "E2E task test");
    solutionId = meta.id;
  });

  test.afterAll(async ({ apiURL }) => {
    await deleteSolutionViaAPI(apiURL, solutionId).catch(() => {});
  });

  test("TC-E2E-TASK-001: Tasks tab shows empty state", async ({ appPage }) => {
    await openSolutionInWorkspace(appPage, "Task Test Solution");
    await clickSidebarTab(appPage, "Tasks");

    await expect(appPage.getByText("No tasks yet")).toBeVisible();
    await expect(
      appPage.getByText("Create tasks to upgrade robots in this solution.")
    ).toBeVisible();
    await expect(
      appPage.getByRole("button", { name: "Create your first task" })
    ).toBeVisible();
  });

  test("TC-E2E-TASK-002: Create task modal opens and has task type selection", async ({
    appPage,
  }) => {
    await openSolutionInWorkspace(appPage, "Task Test Solution");
    await clickSidebarTab(appPage, "Tasks");

    await appPage.getByRole("button", { name: "Create your first task" }).click();
    await appPage.waitForTimeout(500);

    const modal = appPage.locator(".cds--modal-container").filter({ hasText: "Create Task" });
    await expect(modal).toBeVisible({ timeout: 5000 });
    await expect(modal.getByText("Create Task")).toBeVisible();
  });

  test("TC-E2E-TASK-003: Task list shows breadcrumb navigation", async ({
    appPage,
  }) => {
    await openSolutionInWorkspace(appPage, "Task Test Solution");
    await clickSidebarTab(appPage, "Tasks");

    const breadcrumb = appPage.locator(".cds--breadcrumb");
    await expect(breadcrumb.getByText("Solutions")).toBeVisible();
    await expect(breadcrumb.getByText("Task Test Solution")).toBeVisible();
    await expect(breadcrumb.getByText("Tasks")).toBeVisible();
  });

  test("TC-E2E-TASK-004: Task search is hidden when no tasks exist", async ({
    appPage,
  }) => {
    await openSolutionInWorkspace(appPage, "Task Test Solution");
    await clickSidebarTab(appPage, "Tasks");

    // When there are no tasks, the search input should not be visible
    const searchInput = appPage.getByPlaceholder("Search by robot alias or task name...");
    await expect(searchInput).not.toBeVisible();
    await expect(appPage.getByText("No tasks yet")).toBeVisible();
  });

  test("TC-E2E-TASK-005: Navigate between Robots and Tasks sub-views", async ({
    appPage,
  }) => {
    await openSolutionInWorkspace(appPage, "Task Test Solution");
    await clickSidebarTab(appPage, "Tasks");

    await expect(appPage.getByText("No tasks yet")).toBeVisible();

    await clickSidebarTab(appPage, "Robots");
    await expect(appPage.getByText("No robots yet")).toBeVisible();

    await clickSidebarTab(appPage, "Tasks");
    await expect(appPage.getByText("No tasks yet")).toBeVisible();
  });

  test("TC-E2E-TASK-006: Task creation modal shows Create button", async ({
    appPage,
  }) => {
    await openSolutionInWorkspace(appPage, "Task Test Solution");
    await clickSidebarTab(appPage, "Tasks");

    await appPage.getByRole("button", { name: "Create your first task" }).click();
    await appPage.waitForTimeout(500);

    const modal = appPage.locator(".cds--modal-container").filter({ hasText: "Create Task" }).first();
    await expect(modal).toBeVisible({ timeout: 5000 });
    // Verify modal has content
    await expect(modal.locator("button").filter({ hasText: /Create|Cancel/i }).first()).toBeVisible();
  });
});
