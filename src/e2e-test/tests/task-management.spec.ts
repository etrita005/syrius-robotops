import { test, expect } from "../fixtures/test-fixture.js";
import {
  createSolutionViaAPI,
  deleteSolutionViaAPI,
  addRobotViaAPI,
  openSolutionInWorkspace,
  clickSidebarTab,
} from "../fixtures/test-fixture.js";

test.describe("Task Management", () => {
  test.describe.configure({ mode: "serial" });

  let solutionId: string;

  test.beforeAll(async ({ apiURL }) => {
    const meta = await createSolutionViaAPI(apiURL, "Task Test Solution", "E2E task test");
    solutionId = meta.id;
    await addRobotViaAPI(apiURL, solutionId, "192.168.1.10");
    await addRobotViaAPI(apiURL, solutionId, "192.168.1.11");
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
    // Robots added via API should be visible
    await expect(appPage.getByText("192.168.1.10").first()).toBeVisible({ timeout: 5000 });

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

  test("TC-E2E-TASK-007: All task types show multi-robot selection in task type step", async ({
    appPage,
  }) => {
    await openSolutionInWorkspace(appPage, "Task Test Solution");
    await clickSidebarTab(appPage, "Tasks");

    await appPage.getByRole("button", { name: "Create your first task" }).click();
    await appPage.waitForTimeout(500);

    const modal = appPage.locator(".cds--modal-container").filter({ hasText: "Create Task" }).first();
    await expect(modal).toBeVisible({ timeout: 5000 });

    // All 4 task types should show "Multiple robots"
    await expect(modal.getByText("Robot selection: Multiple robots")).toHaveCount(4);

    // Verify each task type is present
    await expect(modal.getByText("Upgrade BUP")).toBeVisible();
    await expect(modal.getByText("Movebase Disk Cleanup")).toBeVisible();
    await expect(modal.getByText("Upgrade Movebase")).toBeVisible();
    await expect(modal.getByText("Apply Alpha2 Map")).toBeVisible();
  });

  test("TC-E2E-TASK-008: Upgrade Movebase step 2 shows checkboxes and Select All", async ({
    appPage,
  }) => {
    await openSolutionInWorkspace(appPage, "Task Test Solution");
    await clickSidebarTab(appPage, "Tasks");

    await appPage.getByRole("button", { name: "Create your first task" }).click();
    await appPage.waitForTimeout(500);

    const modal = appPage.locator(".cds--modal-container").filter({ hasText: "Create Task" }).first();
    await expect(modal).toBeVisible({ timeout: 5000 });

    // Select Upgrade Movebase task type
    await modal.locator("div").filter({ hasText: "Upgrade Movebase" }).first().click();
    await appPage.waitForTimeout(300);

    // Click Next to go to robot selection step
    await modal.getByRole("button", { name: "Next" }).click();
    await appPage.waitForTimeout(500);

    // Verify Select All checkbox is visible (multi-robot indicator)
    await expect(modal.getByLabel("Select all robots")).toBeVisible();

    // Verify robot checkboxes are present
    await expect(modal.getByLabel("Select 192.168.1.10")).toBeVisible();
    await expect(modal.getByLabel("Select 192.168.1.11")).toBeVisible();

    // Verify selection count
    await expect(modal.getByText("0 robots selected")).toBeVisible();

    // Select first robot via checkbox
    await modal.getByLabel("Select 192.168.1.10").check();
    await expect(modal.getByText("1 robot selected")).toBeVisible();

    // Select All
    await modal.getByLabel("Select all robots").check();
    await expect(modal.getByText("2 robots selected")).toBeVisible();
  });

  test("TC-E2E-TASK-009: Apply Alpha2 Map selection leads to multi-robot step 2", async ({
    appPage,
  }) => {
    await openSolutionInWorkspace(appPage, "Task Test Solution");
    await clickSidebarTab(appPage, "Tasks");

    await appPage.getByRole("button", { name: "Create your first task" }).click();
    await appPage.waitForTimeout(500);

    const modal = appPage.locator(".cds--modal-container").filter({ hasText: "Create Task" }).first();
    await expect(modal).toBeVisible({ timeout: 5000 });

    await expect(modal.getByText("Apply Alpha2 Map")).toBeVisible();

    // Select Apply Alpha2 Map task type
    await modal.locator("div").filter({ hasText: "Apply Alpha2 Map" }).first().click();
    await appPage.waitForTimeout(300);

    // Click Next to go to robot selection step
    await modal.getByRole("button", { name: "Next" }).click();
    await appPage.waitForTimeout(500);

    // Verify multi-robot selection is active (Select All checkbox visible)
    await expect(modal.getByLabel("Select all robots")).toBeVisible();
  });

  test("TC-E2E-TASK-010: Apply Alpha2 Map step 2 shows checkboxes and Select All", async ({
    appPage,
  }) => {
    await openSolutionInWorkspace(appPage, "Task Test Solution");
    await clickSidebarTab(appPage, "Tasks");

    await appPage.getByRole("button", { name: "Create your first task" }).click();
    await appPage.waitForTimeout(500);

    const modal = appPage.locator(".cds--modal-container").filter({ hasText: "Create Task" }).first();
    await expect(modal).toBeVisible({ timeout: 5000 });

    // Select Apply Alpha2 Map task type
    await modal.locator("div").filter({ hasText: "Apply Alpha2 Map" }).first().click();
    await appPage.waitForTimeout(300);

    // Click Next to go to robot selection step
    await modal.getByRole("button", { name: "Next" }).click();
    await appPage.waitForTimeout(500);

    // Verify Select All checkbox is visible (multi-robot indicator)
    await expect(modal.getByLabel("Select all robots")).toBeVisible();

    // Verify robot checkboxes are present
    await expect(modal.getByLabel("Select 192.168.1.10")).toBeVisible();
    await expect(modal.getByLabel("Select 192.168.1.11")).toBeVisible();

    // Select both robots individually
    await modal.getByLabel("Select 192.168.1.10").check();
    await modal.getByLabel("Select 192.168.1.11").check();
    await expect(modal.getByText("2 robots selected")).toBeVisible();
  });
});
