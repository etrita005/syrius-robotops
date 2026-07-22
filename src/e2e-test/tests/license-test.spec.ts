import { test, expect } from "../fixtures/test-fixture.js";

test.describe("License Test Interface", () => {
  test.describe.configure({ mode: "serial" });

  test("TC-E2E-LIC-001: Default page shows license test UI", async ({ appPage }) => {
    await expect(appPage.locator("header")).toBeVisible();
    await expect(appPage.getByText("License Test")).toBeVisible();
    await expect(appPage.getByText("Not connected")).toBeVisible();
    await expect(appPage.getByText("License Configuration")).toBeVisible();
    await expect(appPage.getByText("Solutions")).toHaveCount(0);
    await expect(appPage.getByText("Artifacts")).toHaveCount(0);
  });

  test("TC-E2E-LIC-002: Connect with default port populates config fields", async ({
    appPage,
  }) => {
    await appPage.locator("#robot-ip").fill("");
    await appPage.locator("#robot-ip").fill("192.168.1.1");
    await appPage.getByRole("button", { name: "Connect" }).click();

    await expect(appPage.getByText(/Connected to 192.168.1.1:22/)).toBeVisible({
      timeout: 10000,
    });

    const licenseInput = appPage.locator("#license-count");
    await expect(licenseInput).not.toHaveValue("");
  });

  test("TC-E2E-LIC-003: Connect with custom port", async ({ appPage }) => {
    await appPage.locator("#robot-ip").fill("");
    await appPage.locator("#robot-ip").fill("192.168.1.1");
    await appPage.locator("#robot-port").fill("2222");
    await appPage.getByRole("button", { name: "Connect" }).click();

    await expect(appPage.getByText(/Connected to 192.168.1.1:2222/)).toBeVisible({
      timeout: 10000,
    });
  });

  test("TC-E2E-LIC-004: Read refreshes values", async ({ appPage }) => {
    await appPage.locator("#robot-ip").fill("");
    await appPage.locator("#robot-ip").fill("192.168.1.1");
    await appPage.getByRole("button", { name: "Connect" }).click();
    await expect(appPage.getByText(/Connected to/)).toBeVisible({ timeout: 10000 });

    await appPage.locator("#license-count").fill("999");
    await appPage.getByRole("button", { name: "Read License Config" }).click();

    await appPage.waitForTimeout(1000);
    const licenseInput = appPage.locator("#license-count");
    await expect(licenseInput).toHaveValue("100");
  });

  test("TC-E2E-LIC-005: Apply and auto-read refreshes values", async ({ appPage }) => {
    await appPage.locator("#robot-ip").fill("");
    await appPage.locator("#robot-ip").fill("192.168.1.1");
    await appPage.getByRole("button", { name: "Connect" }).click();
    await expect(appPage.getByText(/Connected to/)).toBeVisible({ timeout: 10000 });

    await appPage.locator("#license-count").fill("200");
    await appPage.locator("#license-type").click();
    await appPage.getByText("Formal", { exact: true }).click();

    await appPage.getByRole("button", { name: "Apply License Config" }).click();
    await appPage.waitForTimeout(1000);

    await expect(appPage.getByText("Applied")).toBeVisible();
    await expect(appPage.locator("#license-count")).toHaveValue("200");
  });

  test("TC-E2E-LIC-006: Disconnect disables config", async ({ appPage }) => {
    await appPage.locator("#robot-ip").fill("");
    await appPage.locator("#robot-ip").fill("192.168.1.1");
    await appPage.getByRole("button", { name: "Connect" }).click();
    await expect(appPage.getByText(/Connected to/)).toBeVisible({ timeout: 10000 });

    await appPage.getByRole("button", { name: "Disconnect" }).click();
    await expect(appPage.getByText("Not connected")).toBeVisible();

    await expect(appPage.locator("#license-count")).toBeDisabled();
    await expect(appPage.locator("#license-type")).toBeDisabled();
  });

  test("TC-E2E-LIC-007: Validation blocks empty IP", async ({ appPage }) => {
    await appPage.locator("#robot-ip").fill("");
    await appPage.getByRole("button", { name: "Connect" }).click();
    await appPage.waitForTimeout(300);

    await expect(appPage.getByText("IP address is required.")).toBeVisible();
  });
});
