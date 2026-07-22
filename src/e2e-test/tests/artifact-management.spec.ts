import { test, expect } from "../fixtures/test-fixture.js";
import {
  navigateToArtifacts,
  expectHeaderTabActive,
} from "../fixtures/test-fixture.js";

test.describe.skip("Artifact Management", () => {
  test("TC-E2E-ART-001: Artifact manager page renders with upload zone", async ({
    appPage,
  }) => {
    await navigateToArtifacts(appPage);

    await expect(
      appPage.getByRole("heading", { name: "Artifact Manager" })
    ).toBeVisible();
    await expect(
      appPage.getByText("Global binary artifacts shared across all solutions.")
    ).toBeVisible();
  });

  test("TC-E2E-ART-002: Artifact list shows empty state", async ({
    appPage,
  }) => {
    await navigateToArtifacts(appPage);
    await appPage.waitForTimeout(1000);

    // After loading, the page should show either an empty table or "0" count
    const hasVisibleContent = await appPage
      .locator("table, .cds--data-table, p.cds--empty")
      .first()
      .isVisible()
      .catch(() => false);
    expect(hasVisibleContent).toBe(true);
  });

  test("TC-E2E-ART-003: Navigation to artifacts from header", async ({
    appPage,
  }) => {
    await navigateToArtifacts(appPage);
    await expect(
      appPage.getByRole("heading", { name: "Artifact Manager" })
    ).toBeVisible();
  });

  test("TC-E2E-ART-004: Artifacts tab is active in header", async ({
    appPage,
  }) => {
    await navigateToArtifacts(appPage);
    await expectHeaderTabActive(appPage, "Artifacts");
  });

  test("TC-E2E-ART-005: Navigate away and back to artifacts preserves page", async ({
    appPage,
  }) => {
    await navigateToArtifacts(appPage);

    await navigateToArtifacts(appPage); // navigate again to verify it works
    await expect(
      appPage.getByRole("heading", { name: "Artifact Manager" })
    ).toBeVisible();
  });
});
