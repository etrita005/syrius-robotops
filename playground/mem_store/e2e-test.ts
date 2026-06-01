import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({
    executablePath: '/home/user/.cache/ms-playwright/chromium-1223/chrome-linux64/chrome',
    headless: true,
  });
  const page = await browser.newPage();
  await page.goto('http://localhost:3000/');
  await page.waitForSelector('#auto-test-done', { timeout: 30000 });
  const text = await page.locator('#auto-test-done').textContent();
  console.log('Test result:', text);
  const resultsHtml = await page.locator('#test-results').innerHTML();
  console.log('Details:\n', resultsHtml);
  const passed = text?.includes('All tests passed') ?? false;
  await browser.close();
  process.exit(passed ? 0 : 1);
})();
