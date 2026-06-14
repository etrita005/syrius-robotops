import { test as base, Page, expect } from "@playwright/test";
import { E2E_CONFIG } from "../playwright.config.js";

export type TestFixtures = {
  appPage: Page;
  apiURL: string;
};

export const test = base.extend<TestFixtures>({
  baseURL: E2E_CONFIG.baseURL,
  apiURL: E2E_CONFIG.apiURL,
  appPage: async ({ page }, use) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await page.waitForSelector("header", { timeout: 15000 });
    await page.waitForTimeout(300);
    // Dismiss any stale modals from previous tests using Escape key
    for (let i = 0; i < 10; i++) {
      const visibleModals = await page.locator(".cds--modal.is-visible, .cds--modal-container[aria-modal='true']").count();
      if (visibleModals === 0) break;
      await page.keyboard.press("Escape");
      await page.waitForTimeout(150);
    }
    await use(page);
  },
});

export { expect };

function headerNavLink(page: Page, text: string) {
  return page.locator(".cds--header__nav a.cds--header__menu-item").filter({ hasText: text });
}

export async function navigateToSolutions(page: Page): Promise<void> {
  await headerNavLink(page, "Solutions").click();
  await page.waitForTimeout(500);
}

export async function navigateToArtifacts(page: Page): Promise<void> {
  await headerNavLink(page, "Artifacts").click();
  await page.waitForTimeout(500);
}

export async function navigateToSystemLogs(page: Page): Promise<void> {
  await headerNavLink(page, "System Logs").click();
  await page.waitForTimeout(500);
}

export async function expectHeaderTabActive(page: Page, text: string): Promise<void> {
  await expect(headerNavLink(page, text)).toHaveAttribute("aria-current", "true");
}

export async function createSolutionViaAPI(
  apiURL: string,
  name: string,
  description?: string
): Promise<{ id: string; name: string }> {
  const response = await fetch(`${apiURL}/api/solutions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, description }),
  });
  if (!response.ok) {
    throw new Error(`Failed to create solution: ${response.status} ${await response.text()}`);
  }
  return response.json() as Promise<{ id: string; name: string }>;
}

export async function deleteSolutionViaAPI(apiURL: string, id: string): Promise<void> {
  await fetch(`${apiURL}/api/solutions/${id}`, { method: "DELETE" });
}

export async function addRobotViaAPI(
  apiURL: string,
  solutionId: string,
  address: string
): Promise<{ id: string }> {
  const response = await fetch(`${apiURL}/api/solutions/${solutionId}/robots`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ address }),
  });
  if (!response.ok) {
    throw new Error(`Failed to add robot: ${response.status} ${await response.text()}`);
  }
  return response.json() as Promise<{ id: string }>;
}

export async function uploadArtifactViaAPI(
  apiURL: string,
  filePath: string,
  tags?: string[]
): Promise<{ artifact: { id: string; fileName: string } }> {
  const response = await fetch(`${apiURL}/api/artifacts/upload`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ filePath, tags }),
  });
  if (!response.ok) {
    throw new Error(`Failed to upload artifact: ${response.status} ${await response.text()}`);
  }
  return response.json() as Promise<{ artifact: { id: string; fileName: string } }>;
}

export async function createTestFlowViaAPI(
  apiURL: string,
  solutionId: string,
  robotIds: string[],
  taskType: string,
  params?: Record<string, string>
): Promise<{ id: string }> {
  const response = await fetch(`${apiURL}/api/flows`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      type: "user",
      input: { solutionId, robotIds },
      taskType,
      params,
    }),
  });
  const data = (await response.json()) as { id: string; error?: string };
  if (!response.ok) throw new Error(`Failed to create flow: ${data.error ?? response.status}`);
  return data;
}

export async function clickBreadcrumb(page: Page, label: string): Promise<void> {
  await page.locator(".cds--breadcrumb-item").filter({ hasText: label }).click();
}

export async function openSolutionInWorkspace(page: Page, solutionName: string): Promise<void> {
  await navigateToSolutions(page);
  const button = page.locator("div").filter({ hasText: solutionName }).filter({ has: page.getByRole("button", { name: "Open" }) }).first().getByRole("button", { name: "Open" }).first();
  await button.click();
  await page.waitForTimeout(500);
}

export async function clickSidebarTab(page: Page, tabName: "Robots" | "Tasks"): Promise<void> {
  const sidebar = page.locator("div").filter({ has: page.getByText("Robots", { exact: true }) }).filter({ has: page.getByText("Tasks", { exact: true }) }).first();
  await sidebar.getByText(tabName, { exact: true }).first().click();
  await page.waitForTimeout(500);
}
