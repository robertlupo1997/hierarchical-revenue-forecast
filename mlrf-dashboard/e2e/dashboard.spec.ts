import { test, expect } from '@playwright/test';

/**
 * E2E tests for the MLRF Dashboard.
 *
 * These tests verify that the dashboard loads and displays correctly.
 * The dashboard uses mock data when the API is unavailable, so tests
 * will pass even without a running backend.
 */
test.describe('MLRF Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('loads homepage with correct title and header', async ({ page }) => {
    // Check page loaded
    await expect(page).toHaveURL('/');

    // Verify main heading
    await expect(
      page.getByRole('heading', { name: /Multi-LOB Revenue Forecasting/i })
    ).toBeVisible();

    // Verify subheading
    await expect(page.getByText(/90-day forecast with SHAP explainability/i)).toBeVisible();
  });

  test('displays date selector and refresh button', async ({ page }) => {
    // Date input should be visible
    const dateInput = page.locator('input[type="date"]');
    await expect(dateInput).toBeVisible();

    // Refresh button should be visible
    await expect(page.getByRole('button', { name: /Refresh/i })).toBeVisible();
  });

  test('shows mock data warning when API unavailable', async ({ page }) => {
    // Mock data warning should appear since API is not running
    await expect(page.getByText(/Using demo data/i)).toBeVisible();
  });

  test('displays forecast explanation section', async ({ page }) => {
    // Wait for the page to load
    await page.waitForLoadState('networkidle');

    // Should show Forecast Explanation heading
    await expect(
      page.getByRole('heading', { name: /Forecast Explanation/i }).first()
    ).toBeVisible();

    // Should show store/family info
    await expect(page.getByText(/Store \d+ - /i)).toBeVisible();

    // Details link should exist
    await expect(page.getByRole('link', { name: /Details/i })).toBeVisible();
  });

  test('displays model performance comparison', async ({ page }) => {
    // Wait for content to load
    await page.waitForLoadState('networkidle');

    // Should show Model Performance heading
    await expect(
      page.getByRole('heading', { name: /Model Performance/i })
    ).toBeVisible();

    // Should show metric selector dropdown
    const metricSelector = page.locator('select');
    await expect(metricSelector).toBeVisible();

    // Should have RMSLE option
    await expect(metricSelector).toContainText('RMSLE');

    // Should show "Best Model" highlight
    await expect(page.getByText(/Best Model:/i)).toBeVisible();
  });

  test('displays forecast chart with legend', async ({ page }) => {
    // Wait for charts to render
    await page.waitForLoadState('networkidle');

    // Should show Revenue Forecast title
    await expect(page.getByText(/Revenue Forecast - Store/i)).toBeVisible();

    // Legend items should be visible
    await expect(page.getByText('Historical')).toBeVisible();
    await expect(page.getByText('Forecast')).toBeVisible();
  });

  test('displays hierarchy drilldown section', async ({ page }) => {
    // Wait for hierarchy to load
    await page.waitForLoadState('networkidle');

    // Should show Revenue by Hierarchy heading
    await expect(
      page.getByRole('heading', { name: /Revenue by Hierarchy/i })
    ).toBeVisible();

    // Should show Total node (root of hierarchy)
    await expect(page.getByText('Total').first()).toBeVisible();

    // Should show Predicted Revenue label
    await expect(page.getByText(/Predicted Revenue/i)).toBeVisible();
  });

  test('hierarchy drilldown shows child nodes', async ({ page }) => {
    // Wait for hierarchy to load
    await page.waitForLoadState('networkidle');

    // Should show store cards (mock data has Store 1, Store 2, etc.)
    await expect(page.getByText(/Store 1/i)).toBeVisible();
    await expect(page.getByText(/Store 2/i)).toBeVisible();

    // Click on Store 1 to drill down
    await page.getByText(/Store 1/i).click();

    // Should now show families under Store 1
    await expect(page.getByText(/GROCERY I/i)).toBeVisible();
    await expect(page.getByText(/BEVERAGES/i)).toBeVisible();
  });

  test('navigates to explainability page', async ({ page }) => {
    // Click Details link
    await page.getByRole('link', { name: /Details/i }).click();

    // Should navigate to explain route
    await expect(page).toHaveURL(/\/explain\/\d+\/.+/);

    // Should show Forecast Explanation heading
    await expect(
      page.getByRole('heading', { name: /Forecast Explanation/i })
    ).toBeVisible();

    // Should show Back to Dashboard link
    await expect(
      page.getByRole('link', { name: /Back to Dashboard/i })
    ).toBeVisible();
  });

  test('displays footer with version', async ({ page }) => {
    // Footer should show version
    await expect(page.getByText(/MLRF Dashboard v0.1.0/i)).toBeVisible();
  });
});

test.describe('MLRF Explainability Page', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate directly to an explanation page
    await page.goto('/explain/1/GROCERY%20I');
  });

  test('loads explainability page with summary cards', async ({ page }) => {
    // Wait for page to load
    await page.waitForLoadState('networkidle');

    // Should show summary cards
    await expect(page.getByText('Base Value')).toBeVisible();
    await expect(page.getByText('Final Prediction')).toBeVisible();
    await expect(page.getByText('Total Impact')).toBeVisible();
  });

  test('displays SHAP waterfall chart section', async ({ page }) => {
    // Wait for chart to render
    await page.waitForLoadState('networkidle');

    // Should show SHAP Waterfall Chart heading
    await expect(
      page.getByRole('heading', { name: /SHAP Waterfall Chart/i })
    ).toBeVisible();

    // Should show explanation text
    await expect(
      page.getByText(/how each feature contributes/i)
    ).toBeVisible();

    // SVG chart should be rendered
    await expect(page.locator('svg').first()).toBeVisible();
  });

  test('displays feature contributions table', async ({ page }) => {
    // Wait for table to render
    await page.waitForLoadState('networkidle');

    // Should show Feature Contributions heading
    await expect(
      page.getByRole('heading', { name: /Feature Contributions/i })
    ).toBeVisible();

    // Table headers should be visible
    await expect(page.getByRole('columnheader', { name: /Feature/i })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: /Value/i })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: /SHAP Impact/i })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: /Direction/i })).toBeVisible();
  });

  test('shows interpretation guide', async ({ page }) => {
    // Wait for page to load
    await page.waitForLoadState('networkidle');

    // Should show how to interpret section
    await expect(
      page.getByRole('heading', { name: /How to Interpret SHAP Values/i })
    ).toBeVisible();

    // Should explain positive SHAP
    await expect(page.getByText(/Positive SHAP \(Red\)/i)).toBeVisible();

    // Should explain negative SHAP
    await expect(page.getByText(/Negative SHAP \(Blue\)/i)).toBeVisible();
  });

  test('can navigate back to dashboard', async ({ page }) => {
    // Click back link
    await page.getByRole('link', { name: /Back to Dashboard/i }).click();

    // Should return to home page
    await expect(page).toHaveURL('/');

    // Dashboard title should be visible
    await expect(
      page.getByRole('heading', { name: /Multi-LOB Revenue Forecasting/i })
    ).toBeVisible();
  });
});
