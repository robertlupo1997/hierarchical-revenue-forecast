import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import {
  Skeleton,
  StatCardSkeleton,
  ChartSkeleton,
  WaterfallSkeleton,
  HierarchySkeleton,
  ModelComparisonSkeleton,
  LoadingSkeleton,
} from '../Skeleton';

describe('Skeleton', () => {
  describe('Base Skeleton', () => {
    it('renders with default classes', () => {
      const { container } = render(<Skeleton />);
      const skeleton = container.firstChild as HTMLElement;

      expect(skeleton).toHaveClass('animate-pulse');
      expect(skeleton).toHaveClass('rounded-md');
      expect(skeleton).toHaveClass('bg-muted');
    });

    it('accepts custom className', () => {
      const { container } = render(<Skeleton className="h-10 w-10" />);
      const skeleton = container.firstChild as HTMLElement;

      expect(skeleton).toHaveClass('h-10');
      expect(skeleton).toHaveClass('w-10');
    });

    it('accepts custom style', () => {
      const { container } = render(<Skeleton style={{ width: '100px' }} />);
      const skeleton = container.firstChild as HTMLElement;

      expect(skeleton).toHaveStyle({ width: '100px' });
    });
  });

  describe('StatCardSkeleton', () => {
    it('renders card structure', () => {
      const { container } = render(<StatCardSkeleton />);

      expect(container.querySelector('.card')).toBeInTheDocument();
    });

    it('renders multiple skeleton elements', () => {
      const { container } = render(<StatCardSkeleton />);
      const skeletons = container.querySelectorAll('.animate-pulse');

      expect(skeletons.length).toBeGreaterThan(1);
    });
  });

  describe('ChartSkeleton', () => {
    it('renders with default structure', () => {
      const { container } = render(<ChartSkeleton />);
      const skeletons = container.querySelectorAll('.animate-pulse');

      expect(skeletons.length).toBeGreaterThan(1);
    });

    it('accepts custom className', () => {
      const { container } = render(<ChartSkeleton className="custom-class" />);

      expect(container.firstChild).toHaveClass('custom-class');
    });

    it('includes chart area skeleton', () => {
      const { container } = render(<ChartSkeleton />);

      // Should have a large skeleton for the chart area
      const chartArea = container.querySelector('.h-64');
      expect(chartArea).toBeInTheDocument();
    });
  });

  describe('WaterfallSkeleton', () => {
    it('renders header skeleton', () => {
      const { container } = render(<WaterfallSkeleton />);
      const skeletons = container.querySelectorAll('.animate-pulse');

      expect(skeletons.length).toBeGreaterThan(1);
    });

    it('renders multiple bar skeletons', () => {
      const { container } = render(<WaterfallSkeleton />);

      // Should render 8 waterfall bars
      const rows = container.querySelectorAll('.flex.items-center.gap-3');
      expect(rows.length).toBe(8);
    });
  });

  describe('HierarchySkeleton', () => {
    it('renders tree structure', () => {
      const { container } = render(<HierarchySkeleton />);
      const skeletons = container.querySelectorAll('.animate-pulse');

      expect(skeletons.length).toBeGreaterThan(1);
    });

    it('renders child node skeletons with indentation', () => {
      const { container } = render(<HierarchySkeleton />);

      // Should have indented child nodes (ml-6 class)
      const indentedSection = container.querySelector('.ml-6');
      expect(indentedSection).toBeInTheDocument();
    });

    it('renders 4 child node skeletons', () => {
      const { container } = render(<HierarchySkeleton />);
      const childSection = container.querySelector('.ml-6');
      const childSkeletons = childSection?.querySelectorAll('.h-10');

      expect(childSkeletons?.length).toBe(4);
    });
  });

  describe('ModelComparisonSkeleton', () => {
    it('renders header and table rows', () => {
      const { container } = render(<ModelComparisonSkeleton />);
      const skeletons = container.querySelectorAll('.animate-pulse');

      expect(skeletons.length).toBeGreaterThan(1);
    });

    it('renders 4 table row skeletons', () => {
      const { container } = render(<ModelComparisonSkeleton />);

      // Each row has multiple skeleton columns
      const rows = container.querySelectorAll('.flex.items-center.gap-4');
      expect(rows.length).toBe(4);
    });
  });

  describe('LoadingSkeleton', () => {
    it('renders generic loading structure', () => {
      const { container } = render(<LoadingSkeleton />);
      const skeletons = container.querySelectorAll('.animate-pulse');

      expect(skeletons.length).toBe(3);
    });

    it('accepts custom className', () => {
      const { container } = render(<LoadingSkeleton className="my-class" />);

      expect(container.firstChild).toHaveClass('my-class');
    });
  });
});
