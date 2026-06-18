/**
 * RobotOps Studio - User Manual Generator (Requirements-Driven)
 *
 * Navigates the application capturing screenshots for every user-facing feature.
 * Screenshots are embedded as base64 data URIs in a single self-contained .md file.
 *
 * Usage (one-click):
 *   bash scripts/generate-manual.sh
 */

import { chromium } from "@playwright/test";
import type { Browser, Page } from "@playwright/test";
import { mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { E2E_CONFIG } from "../playwright.config.js";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const TMP_DIR = resolve(import.meta.dirname!, "../../../documents/user-manual/.tmp-screenshots");
const MANUAL_FILE = resolve(import.meta.dirname!, "../../../documents/user-manual/robotops-user-manual.md");
const BASE = E2E_CONFIG.baseURL;
const API = E2E_CONFIG.apiURL;

// ---------------------------------------------------------------------------
// Screenshot registry & helpers
// ---------------------------------------------------------------------------

interface Section { chapter: number; title: string; entries: ScreenshotEntry[]; }
interface ScreenshotEntry { filename: string; title: string; desc: string; base64?: string; }

const manual: Section[] = [];
let seq = 0;
let currentChapter = 0;

function chapter(num: number, title: string) {
  currentChapter = num;
  manual.push({ chapter: num, title, entries: [] });
}
function shot(title: string, desc: string): ScreenshotEntry {
  seq++;
  const e: ScreenshotEntry = { filename: `img_${String(seq).padStart(3, "0")}.png`, title, desc };
  manual[manual.length - 1].entries.push(e);
  return e;
}
async function capture(page: Page, entry: ScreenshotEntry) {
  const fp = resolve(TMP_DIR, entry.filename);
  await page.screenshot({ path: fp, fullPage: true });
  const buf = await readFile(fp);
  entry.base64 = buf.toString("base64");
  console.log(`  [OK] ${entry.filename}  ${entry.title}  (${(buf.length / 1024).toFixed(1)} KB)`);
}

// ---------------------------------------------------------------------------
// API helpers
// ---------------------------------------------------------------------------

async function api<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method, headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}`);
  return res.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// Navigation helpers
// ---------------------------------------------------------------------------

async function nav(page: Page, tab: "Solutions" | "Artifacts" | "System Logs") {
  // Dismiss any lingering modals before navigating
  for (let i = 0; i < 5; i++) {
    const visible = await page.locator(".cds--modal.is-visible").count();
    if (visible === 0) break;
    await page.keyboard.press("Escape");
    await page.waitForTimeout(200);
  }
  await page.waitForTimeout(200);
  await page.locator(".cds--header__nav a.cds--header__menu-item").filter({ hasText: tab }).click({ force: true });
  await page.waitForTimeout(600);
}
async function openSol(page: Page, name: string) {
  // Dismiss any stale modals
  for (let i = 0; i < 5; i++) {
    const visible = await page.locator(".cds--modal.is-visible").count();
    if (visible === 0) break;
    await page.keyboard.press("Escape");
    await page.waitForTimeout(200);
  }
  await page.waitForTimeout(200);
  await nav(page, "Solutions");
  const btn = page.locator("div").filter({ hasText: name })
    .filter({ has: page.getByRole("button", { name: "Open" }) }).first()
    .getByRole("button", { name: "Open" }).first();
  await btn.click({ force: true });
  await page.waitForTimeout(600);
}
async function sidebarTab(page: Page, tab: "Robots" | "Tasks") {
  const s = page.locator("div")
    .filter({ has: page.getByText("Robots", { exact: true }) })
    .filter({ has: page.getByText("Tasks", { exact: true }) }).first();
  await s.getByText(tab, { exact: true }).first().click();
  await page.waitForTimeout(500);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function run(browser: Browser) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const p = await ctx.newPage();

  // ---- Setup test data ----
  console.log("Setting up test data...");
  const sol = await api<{ id: string; name: string }>("POST", "/api/solutions", {
    name: "Demo Solution", description: "User manual demonstration solution",
  });
  await api("POST", `/api/solutions/${sol.id}/robots`, { address: "192.168.1.100" });
  await api("POST", `/api/solutions/${sol.id}/robots`, { address: "10.0.0.50:2222" });
  console.log(`  Created "${sol.name}" with 2 robots`);

  // Navigate to app
  await p.goto(BASE, { waitUntil: "networkidle", timeout: 30000 });
  await p.waitForSelector("header", { timeout: 15000 });
  await p.waitForTimeout(500);

  // =========================================================================
  // CHAPTER 1 — Getting Started
  // =========================================================================
  chapter(1, "Getting Started");
  await capture(p, shot("Main Interface — Solution Selector",
    "The RobotOps Studio landing page shows all configured solutions as cards. Each card displays the solution name, description, tags, last update time, and version. Use the header navigation to switch between Solutions, Artifacts, and System Logs."));
  await capture(p, shot("Header Navigation Bar",
    "The top navigation bar provides access to the three main modules: Solutions, Artifacts, and System Logs. The active module is highlighted. A theme toggle button (dark/light mode) is located at the right side of the header."));

  // =========================================================================
  // CHAPTER 2 — Solution Management (Part 1)
  // =========================================================================
  chapter(2, "Solution Management");

  // 2.1 Create Solution (open dialog, take screenshot, then cancel)
  await p.getByRole("button", { name: "Create solution" }).click();
  await p.waitForTimeout(400);
  await capture(p, shot("Create Solution Dialog",
    "Click the 'Create solution' button on the Solution Selector to open this dialog. Enter a unique solution name (required), an optional description, and optional comma-separated tags. Click 'Create' to confirm. The new solution is automatically activated after creation."));
  // Cancel instead of creating, to avoid state corruption from auto-activation
  await p.getByRole("dialog").getByRole("button", { name: "Cancel" }).click();
  await p.waitForTimeout(400);

  // 2.2 — Search Solutions
  await p.getByPlaceholder("Search solutions...").fill("Demo");
  await p.waitForTimeout(400);
  await capture(p, shot("Searching Solutions",
    "Type in the search box to filter solutions by name. The results update in real-time as you type. The search is case-insensitive and matches any substring within the solution name."));
  await p.getByPlaceholder("Search solutions...").fill("");
  await p.waitForTimeout(400);

  // 2.3 Open Solution → enters workspace (keep workspace open for Chapters 3 & 4)
  // Don't nav again — we're already on Solutions page
  const btn = p.locator("div").filter({ hasText: "Demo Solution" })
    .filter({ has: p.getByRole("button", { name: "Open" }) }).first()
    .getByRole("button", { name: "Open" }).first();
  await btn.click();
  await p.waitForTimeout(800);
  await sidebarTab(p, "Robots");
  // Wait for workspace content to settle — either robots or empty state
  await p.waitForTimeout(500);
  try {
    await p.waitForResponse(r => r.url().includes("/robots") && r.request().method() === "GET", { timeout: 10000 });
    await p.waitForTimeout(500);
  } catch { /* response might have completed before listener was set */ }
  await p.waitForTimeout(1500);
  await capture(p, shot("Opening a Solution — Workspace Entry",
    "Click the 'Open' button on any solution card to enter its workspace. The breadcrumb at the top shows the navigation path: Solutions > [Solution Name] > Robots. The sidebar provides access to Robots and Tasks sub-views."));

  // =========================================================================
  // CHAPTER 3 — Robot Management (captured while in fresh workspace)
  // =========================================================================
  chapter(3, "Robot Management");

  // Ensure robots are visible
  try { await p.getByText(/192\.168/).first().waitFor({ state: "visible", timeout: 10000 }); } catch { /* continue */ }
  await p.waitForTimeout(300);

  // 3.1 Grid View
  try { await p.getByLabel("Grid view").click({ timeout: 3000 }); } catch { /* already grid */ }
  await p.waitForTimeout(400);
  await capture(p, shot("Robot Grid View",
    "The Grid View displays each robot as a card showing the robot alias, IP address, model, serial number (SN), and movebase version. A green pulsing dot indicates online status; a gray dot indicates offline. Click a card to open the robot detail modal. Use the toggle buttons to switch between Grid and List views."));

  // 3.2 Add Robot
  await p.getByRole("button", { name: "Add Robot" }).click();
  await p.waitForTimeout(400);
  await capture(p, shot("Add Robot Dialog",
    "Click 'Add Robot' to open this dialog. Enter the robot's IP address (with optional port, e.g., '192.168.1.100:2222'). The alias field auto-generates a default name (Robot-1, Robot-2, etc.). The address is validated in real-time — invalid formats show an inline error. Click 'Add' to register the robot."));
  await p.getByRole("dialog", { name: "Add Robot" }).getByRole("button", { name: "Cancel" }).click();
  await p.waitForTimeout(400);

  // 3.3 List View
  await p.getByLabel("List view").click();
  await p.waitForTimeout(400);
  await capture(p, shot("Robot List View",
    "The List View presents robots in a table with columns: Select, Alias, Address, Model, Robot SN, Things ID, and Movebase. Use the checkboxes to select robots for batch operations. Click column headers to sort. The header checkbox selects all robots on the current page."));

  // 3.4 Inline Alias Editing
  const aliasCell = p.getByRole("cell", { name: /192\.168\.1\.100/ }).first();
  await aliasCell.dblclick();
  await p.waitForTimeout(400);
  await capture(p, shot("Inline Alias Editing",
    "Double-click the alias cell in the list view to edit the robot alias inline. The cell transforms into a text input. Press Enter or click outside (blur) to save the change. Press Escape to cancel. This provides quick renaming without opening the detail modal."));
  await p.keyboard.press("Escape");
  await p.waitForTimeout(300);

  // 3.5 Robot Search
  await p.getByPlaceholder("Search by alias, address, model or SN...").fill("192.168");
  await p.waitForTimeout(400);
  await capture(p, shot("Searching Robots",
    "Use the search bar above the robot table to filter robots by alias, IP address, model, or serial number. The list updates in real-time as you type. Clear the search text to show all robots again."));
  await p.getByPlaceholder("Search by alias, address, model or SN...").fill("");
  await p.waitForTimeout(400);

  // 3.6 Robot Detail Modal
  await p.getByRole("cell", { name: /192\.168\.1\.100/ }).first().click();
  await p.waitForTimeout(500);
  await capture(p, shot("Robot Detail — Basic Info",
    "Click a robot row to open the detail modal. The Basic Info section shows editable alias and address fields, plus read-only fields for Model, Robot SN, Things ID, Vendor ID, Product ID, Mainboard SN, Mainboard ID, and Main SOM SN. Click 'Save' to persist changes."));
  await p.evaluate(() => { const m = document.querySelector(".cds--modal-container"); if (m) m.scrollTop = m.scrollHeight; });
  await p.waitForTimeout(300);
  await capture(p, shot("Robot Detail — Software & Hardware Versions",
    "Scroll down in the robot detail modal to view the Software Versions section (megacosmOS, Movebase, GGR) and the Hardware Versions table. The hardware table lists each device with its name, firmware version, hardware version, serial number, hardware ID, and online/offline status."));
  await p.keyboard.press("Escape");
  await p.waitForTimeout(400);

  // 3.7 Batch Delete
  await p.getByRole("checkbox", { name: /Select/ }).first().click();
  await p.waitForTimeout(300);
  const batchDelBtn = p.getByRole("button", { name: /Batch Delete/ });
  if (await batchDelBtn.isVisible().catch(() => false)) {
    await batchDelBtn.click(); await p.waitForTimeout(400);
    await capture(p, shot("Batch Delete Robots",
      "Select multiple robots using the checkboxes, then click 'Batch Delete (N)' to remove them all at once. A confirmation dialog shows the number of robots to be deleted. This action cannot be undone."));
    await p.getByRole("dialog").getByRole("button", { name: "Cancel" }).click();
    await p.waitForTimeout(300);
  }

  // 3.8 Delete Robot confirmation
  await p.getByRole("button", { name: "Delete" }).first().click();
  await p.waitForTimeout(400);
  await capture(p, shot("Delete Robot Confirmation",
    "Click the Delete button on a robot row to show this confirmation dialog. The robot's alias and address are displayed. Click 'Delete' to permanently remove the robot from this solution, or 'Cancel' to keep it."));
  await p.getByRole("dialog").getByRole("button", { name: "Cancel" }).click();
  await p.waitForTimeout(300);

  // =========================================================================
  // CHAPTER 4 — Task Management (captured while still in workspace)
  // =========================================================================
  chapter(4, "Task Management");

  await sidebarTab(p, "Tasks");
  await p.waitForTimeout(500);

  // 4.1 Empty State
  await capture(p, shot("Task List — Empty State",
    "When no tasks exist, the Tasks tab shows an empty state with the message 'No tasks yet' and a prompt to create your first task. Click 'Create your first task' to open the task creation wizard."));

  // 4.2 Create Task Step 1: Type Selection
  await p.getByRole("button", { name: "Create your first task" }).click();
  await p.waitForTimeout(600);
  const taskModal = p.locator(".cds--modal-container").filter({ hasText: "Create Task" }).first();
  await capture(p, shot("Create Task — Step 1: Task Type Selection",
    "Step 1 of the task creation wizard: Choose the type of task to execute. Available task types include Upgrade BUP, Movebase Disk Cleanup, Upgrade Movebase, and Apply Alpha2 Map. Each card shows the task name, a brief description, and the robot selection mode (Single robot or Multiple robots). Use the search box to filter task types."));

  // 4.3 Step 2: Robot Selection — select task type first then advance
  await taskModal.getByText("Upgrade Movebase").first().click();
  await p.waitForTimeout(600);
  await taskModal.getByRole("button", { name: "Next" }).click({ timeout: 5000 });
  await p.waitForTimeout(600);
  await capture(p, shot("Create Task — Step 2: Robot Selection",
    "Step 2: Select the target robots for this task. For multi-robot task types, checkboxes are shown with a 'Select all robots' option. For single-robot types, radio buttons are displayed. A counter shows the current selection count. At least one robot must be selected to proceed."));
  await taskModal.getByLabel("Select 192.168.1.100").check();
  await p.waitForTimeout(300);

  // 4.4 Step 3: Parameters
  await taskModal.getByRole("button", { name: "Next" }).click();
  await p.waitForTimeout(600);
  await capture(p, shot("Create Task — Step 3: Configure Parameters",
    "Step 3: Configure task-specific parameters. The form controls are dynamically rendered based on the selected task type. Supported parameter types include text input, number input, dropdown select, checkbox, and artifact selector. Required fields are marked with an asterisk."));

  // 4.5 Step 4: Confirmation — fill params then force-next since we're just capturing screenshots
  try {
    const inputs = taskModal.locator("input:visible");
    const count = await inputs.count();
    for (let i = 0; i < count; i++) {
      const type = await inputs.nth(i).getAttribute("type");
      if (type !== "checkbox" && type !== "radio") {
        await inputs.nth(i).fill("1.0.0");
      }
    }
  } catch { /* ignore */ }
  await p.waitForTimeout(300);
  await taskModal.getByRole("button", { name: "Next" }).click({ timeout: 5000, force: true });
  await p.waitForTimeout(600);
  await capture(p, shot("Create Task — Step 4: Confirmation",
    "Step 4: Review the task configuration before creating. A summary displays the selected task type, target robot(s), and all configured parameters. Artifact references are resolved to file names and sizes. Click 'Create' to submit the task, or 'Back' to adjust settings."));
  await p.keyboard.press("Escape");
  await p.waitForTimeout(500);

  // 4.6 Breadcrumb + Sidebar
  await capture(p, shot("Task View Breadcrumbs",
    "Breadcrumb navigation shows the current context: Solutions > [Solution Name] > Tasks. Click any breadcrumb segment to navigate back to that level."));
  await sidebarTab(p, "Robots"); await p.waitForTimeout(400);
  await capture(p, shot("Workspace Sidebar Navigation",
    "The sidebar within a solution workspace lets you switch between the Robots and Tasks sub-views. The active tab is highlighted. The sidebar remains visible as you navigate between the two views."));
  await sidebarTab(p, "Tasks");

  // =========================================================================
  // CHAPTER 2 — Solution Management (Part 2: remaining operations)
  // =========================================================================
  // Navigate back to Solution Selector
  await nav(p, "Solutions");
  await p.waitForTimeout(500);

  // 2.4 Clone solution
  const cloneBtn = p.locator("div").filter({ hasText: "Demo Solution" })
    .filter({ has: p.getByRole("button", { name: "Clone" }) }).first()
    .getByRole("button", { name: "Clone" }).first();
  await cloneBtn.click();
  await p.waitForTimeout(800);
  await capture(p, shot("Cloning a Solution",
    "Click the Clone icon on a solution card to create a complete copy. All child resources (robots, tasks) are recursively duplicated with a new ID. The cloned solution appears as '[Name] (Copy)'. Version is reset to 1.0.0."));

  // 2.5 Export solution
  await capture(p, shot("Export Solution Button",
    "Click the Export icon on a solution card to download the solution as a ZIP archive. The archive contains all solution metadata, robot definitions, task configurations, and artifact references. During export, the button shows 'Exporting...' with a cancel option."));

  // 2.6 Import Solution modal
  await p.getByRole("button", { name: "Import solution" }).click();
  await p.waitForTimeout(400);
  await capture(p, shot("Import Solution Dialog",
    "Click 'Import solution' to open the import wizard. Drag and drop a previously exported .zip file onto the drop zone, or click 'Browse files' to select from the file system. Only .zip files are accepted."));
  await p.getByRole("dialog").getByRole("button", { name: "Cancel" }).click();
  await p.waitForTimeout(300);

  // 2.7 Delete Solution
  const delBtn = p.locator("button.cds--btn--ghost").filter({ has: p.locator("svg") }).last();
  await delBtn.click(); await p.waitForTimeout(400);
  await capture(p, shot("Delete Solution Confirmation",
    "Click the Delete icon on a solution card to show this confirmation dialog. The warning explains that all sub-resources will be permanently deleted. Click 'Delete solution' to confirm, or 'Cancel' to keep the solution."));
  await p.getByRole("dialog").last().getByRole("button", { name: "Cancel" }).click();
  await p.waitForTimeout(300);

  // 2.8 Recent Solutions
  const recentBtn = p.getByRole("button", { name: /Recent/ });
  if (await recentBtn.isVisible().catch(() => false)) {
    await recentBtn.click(); await p.waitForTimeout(400);
    await capture(p, shot("Recent Solutions Quick Access",
      "Click the 'Recent (N)' button in the header to open a list of recently accessed solutions. Click any entry to quickly switch to that solution. The list persists across sessions."));
    await p.keyboard.press("Escape");
    await p.waitForTimeout(500);
    // Wait for all modals to fully close before continuing
    await p.locator(".cds--modal.is-visible").waitFor({ state: "hidden", timeout: 5000 }).catch(() => {});
    await p.waitForTimeout(300);
  }

  // 2.9 Active Solution Banner (re-open Demo Solution)
  await openSol(p, "Demo Solution"); await p.waitForTimeout(500);
  await capture(p, shot("Active Solution Banner",
    "When a solution is active, a banner below the navigation header displays the current solution name with a 'Switch Solution' button and a 'Close' button. Click 'Close' to deactivate and return to the Solution Selector."));

  // =========================================================================
  // CHAPTER 5 — Artifact Management
  // =========================================================================
  chapter(5, "Artifact Management");

  await nav(p, "Artifacts"); await p.waitForTimeout(800);
  await capture(p, shot("Artifact Manager",
    "The Artifact Manager provides centralized management of upgrade packages, configuration files, map files, and other binary artifacts used by tasks across all solutions."));
  await capture(p, shot("Artifact Filtering and Sorting",
    "Use the filter bar to refine the view: search by file name, filter by content type, sort by upload time (Recent/Oldest), and toggle to show only unreferenced artifacts. Filters apply instantly."));

  const viewBtn = p.getByRole("button", { name: "View" }).first();
  if (await viewBtn.isVisible().catch(() => false)) {
    await viewBtn.click(); await p.waitForTimeout(400);
    await capture(p, shot("Artifact Detail Modal",
      "Click 'View' on any artifact row to see its complete metadata: ID, file name, size, checksum, content type, reference count, creation time, tags, and custom metadata fields."));
    await p.keyboard.press("Escape");
    await p.waitForTimeout(300);
  }

  await capture(p, shot("Unreferenced Artifacts",
    "Artifacts with zero references are marked with a gray 'Unreferenced' tag. Use the 'Show: Unreferenced only' filter to find artifacts that can be safely deleted."));

  const artDelBtn = p.getByRole("button", { name: "Delete" }).first();
  if (await artDelBtn.isVisible().catch(() => false)) {
    await artDelBtn.click(); await p.waitForTimeout(400);
    await capture(p, shot("Delete Artifact Confirmation",
      "Click the Delete icon to show this confirmation dialog. Artifacts with active references (refCount > 0) cannot be deleted."));
    await p.getByRole("dialog").getByRole("button", { name: "Cancel" }).click();
    await p.waitForTimeout(300);
  }

  await capture(p, shot("Artifact Upload Zone",
    "The drag-and-drop upload zone appears above the artifact table. Multiple files can be uploaded simultaneously with independent progress tracking. Duplicate files are detected and skipped."));

  // =========================================================================
  // CHAPTER 6 — System Logs
  // =========================================================================
  chapter(6, "System Logs");

  await nav(p, "System Logs"); await p.waitForTimeout(1500);
  await capture(p, shot("System Logs — Overview",
    "The System Logs page displays runtime logs from the RobotOps Studio backend in a two-panel layout. The left panel lists available log files; active files are marked with a green 'ACTIVE' badge."));
  await capture(p, shot("System Logs — Log Entries and Filters",
    "Log entries are shown in a table with columns: Time, Level, Module, and Message. Each level has a distinct color. Use filters for time range, log levels, modules, and keyword search."));
  await capture(p, shot("System Logs — Download Controls",
    "Two download options: time-range bundle as ZIP (with manifest.json), or individual log files. Click 'Refresh' to reload the file list and re-query logs."));

  // =========================================================================
  // CHAPTER 7 — Application Features
  // =========================================================================
  chapter(7, "Application Features");

  await nav(p, "Solutions"); await p.waitForTimeout(400);
  const themeBtn = p.getByLabel(/dark mode|light mode/i);
  if (await themeBtn.isVisible().catch(() => false)) {
    await capture(p, shot("Theme Toggle — Dark/Light Mode",
      "Click the theme toggle button in the header to switch between dark mode and light mode. The preference is saved and persists across sessions."));
  }

  // =========================================================================
  // Generate Markdown
  // =========================================================================
  console.log("\nGenerating markdown manual with embedded images...\n");

  let md = `# RobotOps Studio — User Manual

> **Product**: RobotOps Studio (Robot Commissioning & Operations Studio)
> **Version**: 1.0
> **Generated**: ${new Date().toISOString().split("T")[0]}
>
> RobotOps Studio is a field robot management and upgrade tool designed for FAE (Field Application Engineers) personnel. It enables managing multiple robots through Wi-Fi connectivity, executing BSP and robot OS upgrades, deploying application maps and program configurations, and performing field diagnostics.

---

## Table of Contents

`;

  for (const ch of manual) {
    const ca = ch.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/-+$/g, "");
    md += `- [${ch.chapter}. ${ch.title}](#${ca})\n`;
    let sec = 0;
    for (const e of ch.entries) {
      sec++;
      const sa = e.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/-+$/g, "");
      md += `  - [${ch.chapter}.${sec} ${e.title}](#${sa})\n`;
    }
  }
  md += "\n---\n\n";

  for (const ch of manual) {
    md += `## ${ch.chapter}. ${ch.title}\n\n`;
    let sec = 0;
    for (const e of ch.entries) {
      sec++;
      md += `### ${ch.chapter}.${sec} ${e.title}\n\n`;
      if (e.base64) {
        md += `<img src="data:image/png;base64,${e.base64}" alt="${e.title}" style="max-width:100%;border:1px solid #ddd;border-radius:4px" />\n\n`;
      } else {
        md += `> *[Screenshot not available]*\n\n`;
      }
      md += `${e.desc}\n\n`;
    }
  }

  // Cleanup
  console.log("Cleaning up test data...");
  await api("DELETE", `/api/solutions/${sol.id}`).catch(() => {});
  console.log("  Done\n");

  await writeFile(MANUAL_FILE, md, "utf-8");
  await rm(TMP_DIR, { recursive: true, force: true });

  const totalKB = Math.round(manual.reduce((sum, ch) =>
    sum + ch.entries.reduce((s, e) => s + (e.base64 ? e.base64.length * 0.75 / 1024 : 0), 0), 0));
  console.log(`Manual:  ${MANUAL_FILE}  (~${totalKB} KB embedded images)`);
  console.log(`Total:   ${seq} screenshots across ${manual.length} chapters`);
}

async function main() {
  await rm(TMP_DIR, { recursive: true, force: true });
  await mkdir(TMP_DIR, { recursive: true });
  console.log("RobotOps Studio — User Manual Generator (Requirements-Driven)");
  console.log(`  Base URL: ${BASE}\n  API URL:  ${API}\n`);
  const browser = await chromium.launch({ headless: true });
  try { await run(browser); } finally { await browser.close(); console.log("\nDone."); }
}

main().catch((err) => { console.error("Manual generation failed:", err); process.exit(1); });
