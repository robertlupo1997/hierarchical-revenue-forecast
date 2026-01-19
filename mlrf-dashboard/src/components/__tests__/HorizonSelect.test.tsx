import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { HorizonSelect, type ForecastHorizon } from '../HorizonSelect';

describe('HorizonSelect', () => {
  it('renders with default value', () => {
    const onChange = vi.fn();
    render(<HorizonSelect value={30} onChange={onChange} />);

    const select = screen.getByRole('combobox', { name: /forecast horizon/i });
    expect(select).toBeInTheDocument();
    expect(select).toHaveValue('30');
  });

  it('renders all horizon options (15, 30, 60, 90)', () => {
    const onChange = vi.fn();
    render(<HorizonSelect value={15} onChange={onChange} />);

    const options = screen.getAllByRole('option');
    expect(options).toHaveLength(4);

    const values = options.map((opt) => opt.getAttribute('value'));
    expect(values).toEqual(['15', '30', '60', '90']);
  });

  it('displays correct labels for each option', () => {
    const onChange = vi.fn();
    render(<HorizonSelect value={15} onChange={onChange} />);

    expect(screen.getByRole('option', { name: '15 days' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: '30 days' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: '60 days' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: '90 days' })).toBeInTheDocument();
  });

  it('calls onChange with correct value when selection changes', () => {
    const onChange = vi.fn();
    render(<HorizonSelect value={30} onChange={onChange} />);

    const select = screen.getByRole('combobox');
    fireEvent.change(select, { target: { value: '60' } });

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(60);
  });

  it('converts string value to number in onChange', () => {
    const onChange = vi.fn();
    render(<HorizonSelect value={15} onChange={onChange} />);

    const select = screen.getByRole('combobox');
    fireEvent.change(select, { target: { value: '90' } });

    // Should be called with a number, not a string
    expect(onChange).toHaveBeenCalledWith(90);
    expect(typeof onChange.mock.calls[0][0]).toBe('number');
  });

  it('renders BarChart3 icon', () => {
    const onChange = vi.fn();
    const { container } = render(<HorizonSelect value={30} onChange={onChange} />);

    // Check for SVG icon (lucide icons render as SVG)
    const svg = container.querySelector('svg');
    expect(svg).toBeInTheDocument();
  });

  it('accepts custom className', () => {
    const onChange = vi.fn();
    const { container } = render(
      <HorizonSelect value={30} onChange={onChange} className="custom-class" />
    );

    const wrapper = container.firstChild;
    expect(wrapper).toHaveClass('custom-class');
  });

  it('reflects value prop correctly when changed externally', () => {
    const onChange = vi.fn();
    const { rerender } = render(<HorizonSelect value={15} onChange={onChange} />);

    const select = screen.getByRole('combobox');
    expect(select).toHaveValue('15');

    // Rerender with new value
    rerender(<HorizonSelect value={90} onChange={onChange} />);
    expect(select).toHaveValue('90');
  });

  it.each([15, 30, 60, 90] as ForecastHorizon[])(
    'handles horizon value %i correctly',
    (horizon) => {
      const onChange = vi.fn();
      render(<HorizonSelect value={horizon} onChange={onChange} />);

      const select = screen.getByRole('combobox');
      expect(select).toHaveValue(String(horizon));
    }
  );

  it('has proper aria-label for accessibility', () => {
    const onChange = vi.fn();
    render(<HorizonSelect value={30} onChange={onChange} />);

    const select = screen.getByLabelText(/forecast horizon/i);
    expect(select).toBeInTheDocument();
  });
});
