import { test, expect } from "../fixtures/test-fixture.js";
import {
  navigateToSolutions,
  createSolutionViaAPI,
  deleteSolutionViaAPI,
  openSolutionInWorkspace,
} from "../fixtures/test-fixture.js";

test.describe("Solution Management", () => {
  test.describe.configure({ mode: "serial" });

  const SOLUTION_NAME = "E2E Test Solution";
  let createdSolutionId: string | null = null;

  test.afterAll(async ({ apiURL }) => {
    if (createdSolutionId) {
      await deleteSolutionViaAPI(apiURL, createdSolutionId).catch(() => {});
    }
  });

  test("TC-E2E-SOL-001: Solution selector renders with Create button", async ({
    appPage,
  }) => {
    await navigateToSolutions(appPage);
    await expect(
      appPage.getByRole("heading", { name: "Solutions" })
    ).toBeVisible();
    await expect(
      appPage.getByRole("button", { name: "Create solution" })
    ).toBeVisible();
    await expect(
      appPage.getByRole("button", { name: "Import solution" })
    ).toBeVisible();
  });

  test("TC-E2E-SOL-002: Create solution via UI modal", async ({
    appPage,
  }) => {
    await navigateToSolutions(appPage);
    await appPage.getByRole("button", { name: "Create solution" }).click();

    const modal = appPage.getByRole("dialog");
    await expect(modal).toBeVisible();
    await expect(modal.getByText("Create solution")).toBeVisible();

    await modal.getByLabel("Name").fill(SOLUTION_NAME);
    await modal.getByLabel("Description").fill("E2E test description");

    const createButton = modal.getByRole("button", { name: "Create" });
    await createButton.click();
    await appPage.waitForTimeout(1000);

    // After creating, we should be in the workspace view
    await expect(
      appPage.getByRole("heading", { name: "Robots" })
    ).toBeVisible({ timeout: 5000 });
  });

  test("TC-E2E-SOL-003: Open solution enters workspace", async ({
    appPage,
    apiURL,
  }) => {
    const meta = await createSolutionViaAPI(apiURL, "SolForOpening", "Temp");
    try {
      await appPage.reload({ waitUntil: "domcontentloaded" });
      await appPage.waitForSelector("header", { timeout: 10000 });
      await navigateToSolutions(appPage);
      await appPage.waitForTimeout(1000);
      await appPage.getByRole("button", { name: "SOLUTIONS" }).waitFor({ timeout: 3000 }).catch(() => {}); // title may be in header
      const button = appPage.locator("div").filter({ hasText: "SolForOpening" }).filter({ has: appPage.getByRole("button", { name: "Open" }) }).first().getByRole("button", { name: "Open" }).first();
      await button.click({ timeout: 10000 });
      await appPage.waitForTimeout(500);

      await expect(appPage.getByText("No robots yet")).toBeVisible();
      await expect(
        appPage.getByText("Add robots to this solution to manage them.")
      ).toBeVisible();
    } finally {
      await deleteSolutionViaAPI(apiURL, meta.id).catch(() => {});
    }
  });

  test("TC-E2E-SOL-004: Back to solution selector from workspace", async ({
    appPage,
    apiURL,
  }) => {
    const meta = await createSolutionViaAPI(apiURL, "TempWorkspace", "Test");
    try {
      await appPage.reload({ waitUntil: "domcontentloaded" });
      await appPage.waitForSelector("header", { timeout: 10000 });
      await navigateToSolutions(appPage);
      await appPage.waitForTimeout(1000);
      const button = appPage.locator("div").filter({ hasText: "TempWorkspace" }).filter({ has: appPage.getByRole("button", { name: "Open" }) }).first().getByRole("button", { name: "Open" }).first();
      await button.click({ timeout: 10000 });
      await appPage.waitForTimeout(500);

      await appPage.locator(".cds--breadcrumb-item").filter({ hasText: "Solutions" }).click();
      await appPage.waitForTimeout(500);

      await expect(
        appPage.getByRole("heading", { name: "Solutions" })
      ).toBeVisible();
    } finally {
      await deleteSolutionViaAPI(apiURL, meta.id).catch(() => {});
    }
  });

  test("TC-E2E-SOL-005: Create solution via API then open in UI", async ({
    appPage,
    apiURL,
  }) => {
    const meta = await createSolutionViaAPI(apiURL, "API Created Solution", "From API");

    await appPage.reload({ waitUntil: "domcontentloaded" });
    await appPage.waitForSelector("header", { timeout: 10000 });
    await navigateToSolutions(appPage);
    await appPage.waitForTimeout(1000);
    await appPage.getByPlaceholder("Search solutions...").fill("API Created");
    await appPage.waitForTimeout(300);

    await expect(
      appPage.getByText("API Created Solution").first()
    ).toBeVisible({ timeout: 5000 });

    await deleteSolutionViaAPI(apiURL, meta.id).catch(() => {});
  });

  test("TC-E2E-SOL-006: Solution search filters results", async ({
    appPage,
    apiURL,
  }) => {
    const meta = await createSolutionViaAPI(apiURL, "SearchableSol42", "Filter test");

    await appPage.reload({ waitUntil: "domcontentloaded" });
    await appPage.waitForSelector("header", { timeout: 10000 });
    await navigateToSolutions(appPage);
    await appPage.waitForTimeout(1000);
    await appPage.getByPlaceholder("Search solutions...").fill("Searchable");
    await appPage.waitForTimeout(500);

    await expect(
      appPage.getByText("SearchableSol42").first()
    ).toBeVisible({ timeout: 10000 });

    await deleteSolutionViaAPI(apiURL, meta.id).catch(() => {});
  });

  test("TC-E2E-SOL-007: Delete solution confirmation dialog", async ({
    appPage,
    apiURL,
  }) => {
    const meta = await createSolutionViaAPI(apiURL, "ToDeleteSol", "Temp");

    await appPage.reload({ waitUntil: "domcontentloaded" });
    await appPage.waitForSelector("header", { timeout: 10000 });
    await navigateToSolutions(appPage);
    await appPage.waitForTimeout(1000);

    const deleteBtn = appPage.locator("button.cds--btn--ghost").filter({ has: appPage.locator("svg") }).last();
    await deleteBtn.click();
    await appPage.waitForTimeout(300);

    const dialog = appPage.getByRole("dialog").last();
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText(/Delete|delete/i).first()).toBeVisible();

    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).not.toBeVisible();

    await deleteSolutionViaAPI(apiURL, meta.id).catch(() => {});
  });
});
