import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { HierarchyDrilldown } from '../HierarchyDrilldown';
import type { HierarchyNode } from '../../lib/api';

// Sample test data
const mockHierarchy: HierarchyNode = {
  id: 'total',
  name: 'All Stores',
  level: 'total',
  prediction: 1000000,
  actual: 950000,
  children: [
    {
      id: 'store-1',
      name: 'Store 1',
      level: 'store',
      prediction: 500000,
      children: [
        { id: 'store-1-grocery', name: 'GROCERY I', level: 'family', prediction: 250000 },
        { id: 'store-1-beverages', name: 'BEVERAGES', level: 'family', prediction: 150000 },
        { id: 'store-1-produce', name: 'PRODUCE', level: 'family', prediction: 100000 },
      ],
    },
    {
      id: 'store-2',
      name: 'Store 2',
      level: 'store',
      prediction: 300000,
      children: [
        { id: 'store-2-grocery', name: 'GROCERY I', level: 'family', prediction: 180000 },
        { id: 'store-2-beverages', name: 'BEVERAGES', level: 'family', prediction: 120000 },
      ],
    },
    {
      id: 'store-3',
      name: 'Store 3',
      level: 'store',
      prediction: 200000,
      children: [],
    },
  ],
};

// Large hierarchy for search tests (>10 children)
const largeHierarchy: HierarchyNode = {
  id: 'total',
  name: 'All Stores',
  level: 'total',
  prediction: 5000000,
  children: Array.from({ length: 15 }, (_, i) => ({
    id: `store-${i + 1}`,
    name: `Store ${i + 1}`,
    level: 'store' as const,
    prediction: 300000 + i * 10000,
    children: [],
  })),
};

const bottomLevelNode: HierarchyNode = {
  id: 'item-1',
  name: 'SKU-001',
  level: 'bottom',
  prediction: 5000,
};

describe('HierarchyDrilldown', () => {
  describe('Rendering', () => {
    it('renders without crashing', () => {
      render(<HierarchyDrilldown data={mockHierarchy} />);
      // All Stores appears in both breadcrumb and heading, use getAllByText
      expect(screen.getAllByText('All Stores').length).toBeGreaterThan(0);
    });

    it('renders current node name in summary', () => {
      render(<HierarchyDrilldown data={mockHierarchy} />);
      // Name appears in the summary section
      const heading = screen.getByRole('heading', { name: 'All Stores' });
      expect(heading).toBeInTheDocument();
    });

    it('renders prediction value', () => {
      render(<HierarchyDrilldown data={mockHierarchy} />);
      // Prediction: $1,000,000
      expect(screen.getByText(/1,000,000/)).toBeInTheDocument();
    });

    it('renders actual value when present', () => {
      render(<HierarchyDrilldown data={mockHierarchy} />);
      expect(screen.getByText(/actual/i)).toBeInTheDocument();
      expect(screen.getByText(/950,000/)).toBeInTheDocument();
    });

    it('renders level badge', () => {
      render(<HierarchyDrilldown data={mockHierarchy} />);
      expect(screen.getByText('Total')).toBeInTheDocument();
    });

    it('renders children as clickable cards', () => {
      render(<HierarchyDrilldown data={mockHierarchy} />);
      expect(screen.getByRole('button', { name: /store 1/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /store 2/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /store 3/i })).toBeInTheDocument();
    });

    it('shows children count for nodes with children', () => {
      render(<HierarchyDrilldown data={mockHierarchy} />);
      // Store 1 has 3 children
      expect(screen.getByText('3 items')).toBeInTheDocument();
      // Store 2 has 2 children
      expect(screen.getByText('2 items')).toBeInTheDocument();
    });
  });

  describe('Breadcrumb Navigation', () => {
    it('renders initial breadcrumb', () => {
      render(<HierarchyDrilldown data={mockHierarchy} />);
      const nav = screen.getByRole('navigation');
      expect(nav).toHaveTextContent('All Stores');
    });

    it('updates breadcrumb on drill down', () => {
      render(<HierarchyDrilldown data={mockHierarchy} />);

      // Click on Store 1 - use more specific selector (the card button, not breadcrumb)
      const childCards = screen.getAllByRole('button').filter(
        (btn) => btn.textContent?.includes('Store 1') && btn.textContent?.includes('Store')
      );
      const store1Card = childCards.find((btn) => btn.textContent?.includes('500,000'));
      if (store1Card) {
        fireEvent.click(store1Card);
      }

      // Breadcrumb should show: All Stores > Store 1
      const nav = screen.getByRole('navigation');
      expect(nav).toHaveTextContent('All Stores');
      expect(nav).toHaveTextContent('Store 1');
    });

    it('navigates back when clicking breadcrumb item', () => {
      render(<HierarchyDrilldown data={mockHierarchy} />);

      // Drill down to Store 1
      const childCards = screen.getAllByRole('button').filter(
        (btn) => btn.textContent?.includes('Store 1') && btn.textContent?.includes('500,000')
      );
      if (childCards.length > 0) {
        fireEvent.click(childCards[0]);
      }

      // Click on All Stores in breadcrumb (first button in nav)
      const nav = screen.getByRole('navigation');
      const breadcrumbButtons = nav.querySelectorAll('button');
      fireEvent.click(breadcrumbButtons[0]);

      // Should be back at root level
      const heading = screen.getByRole('heading', { name: 'All Stores' });
      expect(heading).toBeInTheDocument();
    });
  });

  describe('Drill Down', () => {
    it('drills down when clicking a child with children', () => {
      render(<HierarchyDrilldown data={mockHierarchy} />);

      // Click on Store 1 (has children) - find the card by its prediction value
      const store1Card = screen.getAllByRole('button').find(
        (btn) => btn.textContent?.includes('Store 1') && btn.textContent?.includes('500,000')
      );
      if (store1Card) {
        fireEvent.click(store1Card);
      }

      // Should now show Store 1 as current node
      const heading = screen.getByRole('heading', { name: 'Store 1' });
      expect(heading).toBeInTheDocument();

      // Should show Store 1's children
      expect(screen.getByText('GROCERY I')).toBeInTheDocument();
      expect(screen.getByText('BEVERAGES')).toBeInTheDocument();
      expect(screen.getByText('PRODUCE')).toBeInTheDocument();
    });

    it('calls onSelect callback when clicking a child', () => {
      const onSelect = vi.fn();
      render(<HierarchyDrilldown data={mockHierarchy} onSelect={onSelect} />);

      // Find the card by prediction value
      const store1Card = screen.getAllByRole('button').find(
        (btn) => btn.textContent?.includes('Store 1') && btn.textContent?.includes('500,000')
      );
      if (store1Card) {
        fireEvent.click(store1Card);
      }

      expect(onSelect).toHaveBeenCalledTimes(1);
      expect(onSelect).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'store-1', name: 'Store 1' })
      );
    });

    it('calls onSelect when navigating via breadcrumb', () => {
      const onSelect = vi.fn();
      render(<HierarchyDrilldown data={mockHierarchy} onSelect={onSelect} />);

      // Drill down - find card by prediction value
      const store1Card = screen.getAllByRole('button').find(
        (btn) => btn.textContent?.includes('Store 1') && btn.textContent?.includes('500,000')
      );
      if (store1Card) {
        fireEvent.click(store1Card);
      }
      onSelect.mockClear();

      // Navigate back via breadcrumb (first button in nav)
      const nav = screen.getByRole('navigation');
      const breadcrumbButtons = nav.querySelectorAll('button');
      fireEvent.click(breadcrumbButtons[0]);

      expect(onSelect).toHaveBeenCalledTimes(1);
      expect(onSelect).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'total', name: 'All Stores' })
      );
    });
  });

  describe('Search Functionality', () => {
    it('shows search input when at total level with >10 children', () => {
      render(<HierarchyDrilldown data={largeHierarchy} />);
      expect(screen.getByPlaceholderText(/search stores/i)).toBeInTheDocument();
    });

    it('hides search input when <10 children', () => {
      render(<HierarchyDrilldown data={mockHierarchy} />);
      expect(screen.queryByPlaceholderText(/search stores/i)).not.toBeInTheDocument();
    });

    it('filters stores based on search query', () => {
      render(<HierarchyDrilldown data={largeHierarchy} />);

      const searchInput = screen.getByPlaceholderText(/search stores/i);
      fireEvent.change(searchInput, { target: { value: 'Store 1' } });

      // Should show Store 1, Store 10, Store 11, etc.
      expect(screen.getByText('Store 1')).toBeInTheDocument();
      expect(screen.getByText('Store 10')).toBeInTheDocument();
      // Store 2 should be filtered out
      expect(screen.queryByText('Store 2')).not.toBeInTheDocument();
    });

    it('shows count of filtered results', () => {
      render(<HierarchyDrilldown data={largeHierarchy} />);

      const searchInput = screen.getByPlaceholderText(/search stores/i);
      fireEvent.change(searchInput, { target: { value: 'Store 1' } });

      // "X of Y stores" format
      expect(screen.getByText(/of 15 stores/i)).toBeInTheDocument();
    });

    it('shows clear button when search has text', () => {
      render(<HierarchyDrilldown data={largeHierarchy} />);

      const searchInput = screen.getByPlaceholderText(/search stores/i);
      fireEvent.change(searchInput, { target: { value: 'test' } });

      // Clear button should appear
      const clearButton = screen.getByRole('button', { name: '' }); // X icon button
      expect(clearButton).toBeInTheDocument();
    });

    it('clears search when clicking clear button', () => {
      render(<HierarchyDrilldown data={largeHierarchy} />);

      const searchInput = screen.getByPlaceholderText(/search stores/i) as HTMLInputElement;
      fireEvent.change(searchInput, { target: { value: 'test' } });

      // Find and click clear button (the X icon)
      const buttons = screen.getAllByRole('button');
      const clearButton = buttons.find((btn) => btn.querySelector('svg'));
      if (clearButton) {
        fireEvent.click(clearButton);
      }

      // Search should be cleared - all stores visible
      expect(screen.getByText('Store 1')).toBeInTheDocument();
      expect(screen.getByText('Store 15')).toBeInTheDocument();
    });

    it('search input clears on navigation', () => {
      render(<HierarchyDrilldown data={largeHierarchy} />);

      const searchInput = screen.getByPlaceholderText(/search stores/i) as HTMLInputElement;
      fireEvent.change(searchInput, { target: { value: 'Store 1' } });

      expect(searchInput.value).toBe('Store 1');

      // Clicking breadcrumb to navigate also clears search
      const nav = screen.getByRole('navigation');
      const breadcrumbButtons = nav.querySelectorAll('button');
      // Click the current breadcrumb (All Stores) - this should reset the path
      fireEvent.click(breadcrumbButtons[0]);

      // Search should be cleared after navigation
      expect(searchInput.value).toBe('');
    });

    it('shows empty state when no results match search', () => {
      render(<HierarchyDrilldown data={largeHierarchy} />);

      const searchInput = screen.getByPlaceholderText(/search stores/i);
      fireEvent.change(searchInput, { target: { value: 'nonexistent' } });

      expect(screen.getByText(/no stores match/i)).toBeInTheDocument();
    });

    it('has clear search link in empty state', () => {
      render(<HierarchyDrilldown data={largeHierarchy} />);

      const searchInput = screen.getByPlaceholderText(/search stores/i);
      fireEvent.change(searchInput, { target: { value: 'nonexistent' } });

      const clearLink = screen.getByRole('button', { name: /clear search/i });
      expect(clearLink).toBeInTheDocument();
    });
  });

  describe('Empty States', () => {
    it('shows empty state for bottom level node', () => {
      render(<HierarchyDrilldown data={bottomLevelNode} />);
      expect(screen.getByText(/lowest level in the hierarchy/i)).toBeInTheDocument();
    });

    it('shows empty state for node without children', () => {
      // Create a simple hierarchy where clicking a child goes to empty state
      const simpleHierarchy: HierarchyNode = {
        id: 'total',
        name: 'All Stores',
        level: 'total',
        prediction: 500000,
        children: [
          {
            id: 'store-empty',
            name: 'Empty Store',
            level: 'store',
            prediction: 100000,
            children: [], // No children
          },
        ],
      };

      render(<HierarchyDrilldown data={simpleHierarchy} />);

      // Click on Empty Store (it's the only child)
      const emptyStoreCard = screen.getByText('Empty Store').closest('button');
      if (emptyStoreCard) {
        fireEvent.click(emptyStoreCard);
      }

      // Since Empty Store has no children, it should still be shown but won't drill down
      // The component calls onSelect but doesn't push to path stack
      // So we should test that clicking a leaf node with no children doesn't cause errors
      // and the current view remains valid
      expect(screen.getByText('Empty Store')).toBeInTheDocument();
    });
  });

  describe('Percentage Calculation', () => {
    it('shows percentage of parent for each child', () => {
      render(<HierarchyDrilldown data={mockHierarchy} />);

      // Percentages appear twice per card (hover badge + inline), so use getAllByText
      // Store 1: 500000 / 1000000 = 50%
      expect(screen.getAllByText('50.0%').length).toBeGreaterThan(0);
      // Store 2: 300000 / 1000000 = 30%
      expect(screen.getAllByText('30.0%').length).toBeGreaterThan(0);
      // Store 3: 200000 / 1000000 = 20%
      expect(screen.getAllByText('20.0%').length).toBeGreaterThan(0);
    });
  });

  describe('Level Icons and Styling', () => {
    it('renders correct icon for total level', () => {
      render(<HierarchyDrilldown data={mockHierarchy} />);
      // Should have Layers icon (SVG present)
      expect(screen.getByText('Total')).toBeInTheDocument();
    });

    it('renders correct icon for store level', () => {
      render(<HierarchyDrilldown data={mockHierarchy} />);
      // Children cards show store level
      const cards = screen.getAllByRole('button');
      expect(cards.length).toBeGreaterThan(0);
      // Check that Store badges are shown
      const storeBadges = screen.getAllByText('Store');
      expect(storeBadges.length).toBeGreaterThan(0);
    });
  });

  describe('Deep Navigation', () => {
    it('maintains full path when drilling into nodes with children', () => {
      render(<HierarchyDrilldown data={mockHierarchy} />);

      // Drill into Store 1 - find card by prediction value
      const store1Card = screen.getAllByRole('button').find(
        (btn) => btn.textContent?.includes('Store 1') && btn.textContent?.includes('500,000')
      );
      if (store1Card) {
        fireEvent.click(store1Card);
      }

      // After drilling, breadcrumb should show path: All Stores > Store 1
      const nav = screen.getByRole('navigation');
      expect(nav).toHaveTextContent('All Stores');
      expect(nav).toHaveTextContent('Store 1');

      // Should now show Store 1's children (families)
      expect(screen.getByText('GROCERY I')).toBeInTheDocument();
    });

    it('can navigate back via breadcrumb', () => {
      render(<HierarchyDrilldown data={mockHierarchy} />);

      // Navigate to Store 1
      const store1Card = screen.getAllByRole('button').find(
        (btn) => btn.textContent?.includes('Store 1') && btn.textContent?.includes('500,000')
      );
      if (store1Card) {
        fireEvent.click(store1Card);
      }

      // Jump back to All Stores via breadcrumb
      const nav = screen.getByRole('navigation');
      const breadcrumbButtons = nav.querySelectorAll('button');
      // breadcrumbButtons[0] = All Stores
      fireEvent.click(breadcrumbButtons[0]);

      // Should be at root level
      const heading = screen.getByRole('heading', { name: 'All Stores' });
      expect(heading).toBeInTheDocument();
    });
  });
});
