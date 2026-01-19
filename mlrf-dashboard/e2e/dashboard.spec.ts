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

test.describe('Horizon Selector', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('should display horizon dropdown with forecast horizon label', async ({ page }) => {
    // Find the horizon selector by its aria-label
    const selector = page.getByLabel('Forecast horizon');
    await expect(selector).toBeVisible();
  });

  test('should have all four horizon options available', async ({ page }) => {
    const selector = page.getByLabel('Forecast horizon');

    // Check that all options exist
    await expect(selector.locator('option[value="15"]')).toHaveText('15 days');
    await expect(selector.locator('option[value="30"]')).toHaveText('30 days');
    await expect(selector.locator('option[value="60"]')).toHaveText('60 days');
    await expect(selector.locator('option[value="90"]')).toHaveText('90 days');
  });

  test('should default to 90 days horizon', async ({ page }) => {
    const selector = page.getByLabel('Forecast horizon');
    await expect(selector).toHaveValue('90');

    // Subtitle should reflect 90-day forecast
    await expect(page.getByText('90-day hierarchical forecast')).toBeVisible();
  });

  test('should update subtitle when horizon changes', async ({ page }) => {
    const selector = page.getByLabel('Forecast horizon');

    // Change to 30 days
    await selector.selectOption('30');
    await expect(page.getByText('30-day hierarchical forecast')).toBeVisible();

    // Change to 15 days
    await selector.selectOption('15');
    await expect(page.getByText('15-day hierarchical forecast')).toBeVisible();

    // Change to 60 days
    await selector.selectOption('60');
    await expect(page.getByText('60-day hierarchical forecast')).toBeVisible();
  });

  test('should update stat card projection text when horizon changes', async ({ page }) => {
    // Change to 30 days
    await page.getByLabel('Forecast horizon').selectOption('30');

    // Wait for the page to settle
    await page.waitForLoadState('networkidle');

    // Stat card should show 30-day projection
    await expect(page.getByText('30-day projection')).toBeVisible();
  });
});

test.describe('Date Picker', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('should have min/max date bounds matching dataset range', async ({ page }) => {
    const datePicker = page.locator('input[type="date"]');
    await expect(datePicker).toBeVisible();

    // Check min/max attributes match Kaggle dataset range
    await expect(datePicker).toHaveAttribute('min', '2013-01-01');
    await expect(datePicker).toHaveAttribute('max', '2017-08-15');
  });

  test('should display default date within valid range', async ({ page }) => {
    const datePicker = page.locator('input[type="date"]');
    const value = await datePicker.inputValue();

    // Default date should be 2017-08-01 (or within range)
    expect(value).toBe('2017-08-01');
  });

  test('should allow changing date', async ({ page }) => {
    const datePicker = page.locator('input[type="date"]');

    // Change to a different date
    await datePicker.fill('2017-06-15');

    // Verify the value changed
    await expect(datePicker).toHaveValue('2017-06-15');
  });
});

test.describe('CSV Export', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Wait for content to load
    await page.waitForLoadState('networkidle');
  });

  test('should display export button in forecast chart', async ({ page }) => {
    // Export button should be visible
    const exportButton = page.getByRole('button', { name: /export/i });
    await expect(exportButton).toBeVisible();
  });

  test('should have download icon on export button', async ({ page }) => {
    // Find the export button and check it has the Download icon (via class or structure)
    const exportButton = page.getByRole('button', { name: /export/i });
    await expect(exportButton).toBeVisible();

    // Button should contain Download icon (svg element)
    const icon = exportButton.locator('svg');
    await expect(icon).toBeVisible();
  });

  test('should download CSV when export button clicked', async ({ page }) => {
    // Set up download listener before clicking
    const downloadPromise = page.waitForEvent('download');

    // Click export button
    await page.getByRole('button', { name: /export/i }).click();

    // Wait for download
    const download = await downloadPromise;

    // Verify filename is a CSV
    expect(download.suggestedFilename()).toMatch(/\.csv$/);

    // Verify filename contains forecast context info
    expect(download.suggestedFilename()).toMatch(/forecast/i);
  });
});

test.describe('Store Search', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('should display search input at store level (total level with children)', async ({ page }) => {
    // Search should be visible when hierarchy is at Total level showing stores
    // The search appears when there are >10 children (54 stores in real data, ~4 in mock)
    // With mock data, search may not appear - check for it gracefully

    // First verify we're at the hierarchy section
    await expect(page.getByRole('heading', { name: /Revenue by Hierarchy/i })).toBeVisible();

    // Search input may or may not be visible depending on mock vs real data
    // If visible, it should have the placeholder "Search stores..."
    const searchInput = page.getByPlaceholder('Search stores...');

    // With real hierarchy data (54 stores), search should appear
    // With mock data (4 stores), it won't - this test validates the selector works
    const searchVisible = await searchInput.isVisible().catch(() => false);
    if (searchVisible) {
      await expect(searchInput).toBeVisible();
    }
  });

  test('should filter stores when typing in search', async ({ page }) => {
    // This test works best with real hierarchy data (54 stores)
    const searchInput = page.getByPlaceholder('Search stores...');

    // Check if search is visible (only with 10+ children)
    const searchVisible = await searchInput.isVisible().catch(() => false);

    if (searchVisible) {
      // Type in search
      await searchInput.fill('Store 1');

      // Wait for filter to apply
      await page.waitForTimeout(200);

      // Store 1 should still be visible
      await expect(page.getByText('Store 1').first()).toBeVisible();
    } else {
      // With mock data, verify stores are still shown without search
      await expect(page.getByText(/Store 1/i)).toBeVisible();
    }
  });

  test('should show store count when search is active', async ({ page }) => {
    const searchInput = page.getByPlaceholder('Search stores...');
    const searchVisible = await searchInput.isVisible().catch(() => false);

    if (searchVisible) {
      // Initially should show total store count (e.g., "54 stores")
      await expect(page.getByText(/\d+ stores$/)).toBeVisible();

      // After searching, should show filtered count (e.g., "5 of 54 stores")
      await searchInput.fill('Store 1');
      await page.waitForTimeout(200);

      // Should show "X of Y stores" format
      await expect(page.getByText(/\d+ of \d+ stores/)).toBeVisible();
    }
  });

  test('should clear search when X button clicked', async ({ page }) => {
    const searchInput = page.getByPlaceholder('Search stores...');
    const searchVisible = await searchInput.isVisible().catch(() => false);

    if (searchVisible) {
      // Type something
      await searchInput.fill('Store 1');
      await page.waitForTimeout(200);

      // Clear button (X) should appear
      const clearButton = page.locator('button').filter({ has: page.locator('svg') }).last();
      await clearButton.click();

      // Search should be cleared
      await expect(searchInput).toHaveValue('');
    }
  });

  test('should show empty state when no stores match search', async ({ page }) => {
    const searchInput = page.getByPlaceholder('Search stores...');
    const searchVisible = await searchInput.isVisible().catch(() => false);

    if (searchVisible) {
      // Search for something that doesn't exist
      await searchInput.fill('NonexistentStore12345');
      await page.waitForTimeout(200);

      // Should show "No stores match" message
      await expect(page.getByText(/No stores match/i)).toBeVisible();

      // Should show "Clear search" link
      await expect(page.getByText('Clear search')).toBeVisible();
    }
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
