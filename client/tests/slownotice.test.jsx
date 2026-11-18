import { describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { createSlowTracker } from '../src/lib/pending';
import { SlowServerNotice } from '../src/components/shared/SlowServerNotice';

describe('SlowServerNotice', () => {
  it('appears only while a request has been waiting for a long time', () => {
    vi.useFakeTimers();
    const tracker = createSlowTracker({ delayMs: 6000 });
    render(<SlowServerNotice tracker={tracker} />);
    expect(screen.queryByRole('status')).toBeNull();
    let id;
    act(() => { id = tracker.start(); });
    act(() => { vi.advanceTimersByTime(6100); });
    expect(screen.getByRole('status')).toHaveTextContent('taking longer than usual');
    act(() => tracker.end(id));
    expect(screen.queryByRole('status')).toBeNull();
    vi.useRealTimers();
  });
});
