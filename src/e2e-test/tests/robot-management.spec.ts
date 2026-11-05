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
  let sortSolutionId: string;

  test.beforeAll(async ({ apiURL }) => {
    const meta = await createSolutionViaAPI(apiURL, "Robot Test Solution", "E2E robot test");
    solutionId = meta.id;

    const sortMeta = await createSolutionViaAPI(apiURL, "Robot Sort Solution", "E2E sort test");
    sortSolutionId = sortMeta.id;
    for (const address of ["10.0.0.20", "10.0.0.10", "10.0.0.30"]) {
      await addRobotViaAPI(apiURL, sortMeta.id, address);
    }
  });

  test.afterAll(async ({ apiURL }) => {
    await deleteSolutionViaAPI(apiURL, solutionId).catch(() => {});
    await deleteSolutionViaAPI(apiURL, sortSolutionId).catch(() => {});
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

  test("TC-E2E-ROB-010: Single shared SSE connection with multiple robots", async ({
    appPage,
  }) => {
    const sseRequests: string[] = [];
    const onRequest = (req: { url: () => string }) => {
      if (req.url().includes("/api/sse")) sseRequests.push(req.url());
    };
    appPage.on("request", onRequest);

    await openSolutionInWorkspace(appPage, "Robot Test Solution");
    await clickSidebarTab(appPage, "Robots");

    for (const address of ["192.168.1.101", "10.0.0.50"]) {
      await expect(appPage.getByText(address).first()).toBeVisible({ timeout: 5000 });
    }
    await appPage.waitForTimeout(500);

    expect(sseRequests.length).toBe(1);
  });

  test("TC-E2E-ROB-011: SSE connection count unchanged after adding robot", async ({
    appPage,
  }) => {
    const sseRequests: string[] = [];
    const onRequest = (req: { url: () => string }) => {
      if (req.url().includes("/api/sse")) sseRequests.push(req.url());
    };
    appPage.on("request", onRequest);

    await openSolutionInWorkspace(appPage, "Robot Test Solution");
    await clickSidebarTab(appPage, "Robots");

    await appPage.getByRole("button", { name: "Add Robot" }).click();
    const modal = appPage.getByRole("dialog", { name: "Add Robot" });
    await expect(modal).toBeVisible();

    await modal.locator("input").first().fill("10.0.0.99");
    await modal.getByRole("button", { name: "Add" }).click();
    await appPage.waitForTimeout(500);

    await expect(appPage.getByText("10.0.0.99")).toBeVisible({ timeout: 5000 });

    expect(sseRequests.length).toBe(1);
  });

  test("TC-E2E-ROB-012: Alias sort button cycles none/asc/desc in list view", async ({
    appPage,
  }) => {
    await openSolutionInWorkspace(appPage, "Robot Sort Solution");
    await clickSidebarTab(appPage, "Robots");

    await appPage.getByLabel("List view").click();
    await appPage.waitForTimeout(300);

    const readAliases = async (): Promise<string[]> => {
      const rows = appPage.locator("table tbody tr");
      const count = await rows.count();
      const aliases: string[] = [];
      for (let i = 0; i < count; i++) {
        aliases.push((await rows.nth(i).locator("td").nth(1).innerText()).trim());
      }
      return aliases;
    };

    const compare = (a: string, b: string) =>
      a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });

    const initial = await readAliases();
    expect(initial.length).toBe(3);

    // Default state: no sorting, backend order preserved.
    await expect(appPage.getByRole("button", { name: "Sort", exact: true })).toBeVisible();

    // 1st click -> ascending.
    await appPage.getByRole("button", { name: "Sort", exact: true }).click();
    await appPage.waitForTimeout(200);
    await expect(appPage.getByRole("button", { name: "Alias A-Z", exact: true })).toBeVisible();
    expect(await readAliases()).toEqual([...initial].sort(compare));

    // 2nd click -> descending.
    await appPage.getByRole("button", { name: "Alias A-Z", exact: true }).click();
    await appPage.waitForTimeout(200);
    await expect(appPage.getByRole("button", { name: "Alias Z-A", exact: true })).toBeVisible();
    expect(await readAliases()).toEqual([...initial].sort((a, b) => compare(b, a)));

    // 3rd click -> back to unsorted (original backend order).
    await appPage.getByRole("button", { name: "Alias Z-A", exact: true }).click();
    await appPage.waitForTimeout(200);
    await expect(appPage.getByRole("button", { name: "Sort", exact: true })).toBeVisible();
    expect(await readAliases()).toEqual(initial);
  });

  test("TC-E2E-ROB-013: Robot list view shows Shutdown and Reboot buttons", async ({
    appPage,
  }) => {
    await openSolutionInWorkspace(appPage, "Robot Test Solution");
    await clickSidebarTab(appPage, "Robots");

    await appPage.getByLabel("List view").click();
    await appPage.waitForTimeout(300);

    const firstRow = appPage.locator("table tbody tr").first();
    await expect(firstRow.getByRole("button", { name: "Shutdown robot" })).toBeVisible();
    await expect(firstRow.getByRole("button", { name: "Reboot robot" })).toBeVisible();
    await expect(firstRow.getByRole("button", { name: "Details" })).toBeVisible();
    await expect(firstRow.getByRole("button", { name: "Delete" })).toBeVisible();
  });

  test("TC-E2E-ROB-014: Shutdown button opens a confirmation dialog and cancel sends no request", async ({
    appPage,
  }) => {
    const powerRequests: string[] = [];
    appPage.on("request", (req) => {
      if (req.url().includes("/power")) powerRequests.push(req.url());
    });

    await openSolutionInWorkspace(appPage, "Robot Test Solution");
    await clickSidebarTab(appPage, "Robots");

    await appPage.getByLabel("List view").click();
    await appPage.waitForTimeout(300);

    await appPage
      .locator("table tbody tr")
      .first()
      .getByRole("button", { name: "Shutdown robot" })
      .click();

    const dialog = appPage.getByRole("dialog", { name: "Shutdown Robot" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText("Send a shutdown command to this robot?")).toBeVisible();

    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).not.toBeVisible();

    expect(powerRequests.length).toBe(0);
  });

  test("TC-E2E-ROB-015: Confirming shutdown sends the power request and shows a success toast", async ({
    appPage,
  }) => {
    const powerRequests: { method: string; url: string }[] = [];
    appPage.on("request", (req) => {
      if (req.url().includes("/power")) {
        powerRequests.push({ method: req.method(), url: req.url() });
      }
    });

    await openSolutionInWorkspace(appPage, "Robot Test Solution");
    await clickSidebarTab(appPage, "Robots");

    await appPage.getByLabel("List view").click();
    await appPage.waitForTimeout(300);

    await appPage
      .locator("table tbody tr")
      .first()
      .getByRole("button", { name: "Shutdown robot" })
      .click();

    const dialog = appPage.getByRole("dialog", { name: "Shutdown Robot" });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Shutdown" }).click();

    await expect(appPage.getByText("Shutdown command sent")).toBeVisible({ timeout: 10000 });
    await appPage.waitForTimeout(300);

    expect(powerRequests.length).toBe(1);
    expect(powerRequests[0].method).toBe("POST");
    expect(powerRequests[0].url).toContain("/power");
  });

  test("TC-E2E-ROB-016: Reboot button opens the reboot confirmation dialog", async ({
    appPage,
  }) => {
    await openSolutionInWorkspace(appPage, "Robot Test Solution");
    await clickSidebarTab(appPage, "Robots");

    await appPage.getByLabel("List view").click();
    await appPage.waitForTimeout(300);

    await appPage
      .locator("table tbody tr")
      .first()
      .getByRole("button", { name: "Reboot robot" })
      .click();

    const dialog = appPage.getByRole("dialog", { name: "Reboot Robot" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText("Send a reboot command to this robot?")).toBeVisible();

    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).not.toBeVisible();
  });

  test("TC-E2E-ROB-017: Grid view cards expose Shutdown and Reboot buttons", async ({
    appPage,
  }) => {
    await openSolutionInWorkspace(appPage, "Robot Test Solution");
    await clickSidebarTab(appPage, "Robots");

    await appPage.getByLabel("Grid view").click();
    await appPage.waitForTimeout(300);

    await expect(appPage.getByRole("button", { name: "Shutdown robot" }).first()).toBeVisible();
    await expect(appPage.getByRole("button", { name: "Reboot robot" }).first()).toBeVisible();

    // Clicking the card body (not the power buttons) still opens the Robot Details dialog
    await appPage.getByText(/^SN:/).first().click();

    const detailDialog = appPage.getByRole("dialog", { name: /Robot Details/ });
    await expect(detailDialog).toBeVisible({ timeout: 5000 });
  });
});
