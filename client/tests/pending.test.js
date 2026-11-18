import { describe, expect, it, vi } from 'vitest';
import { createSlowTracker } from '../src/lib/pending';

describe('slow-server tracker', () => {
  it('reports slow only after a request has waited past the delay, and clears when it finishes', () => {
    vi.useFakeTimers();
    const t = createSlowTracker({ delayMs: 6000 });
    const seen = [];
    t.subscribe((v) => seen.push(v));
    const id = t.start();
    vi.advanceTimersByTime(5999);
    expect(t.isSlow()).toBe(false);
    vi.advanceTimersByTime(2);
    expect(t.isSlow()).toBe(true);
    t.end(id);
    expect(t.isSlow()).toBe(false);
    expect(seen).toEqual([true, false]);
    vi.useRealTimers();
  });

  it('quick requests never trigger it', () => {
    vi.useFakeTimers();
    const t = createSlowTracker({ delayMs: 6000 });
    const id = t.start();
    vi.advanceTimersByTime(300);
    t.end(id);
    vi.advanceTimersByTime(60000);
    expect(t.isSlow()).toBe(false);
    vi.useRealTimers();
  });

  it('stays slow while any request is still waiting', () => {
    vi.useFakeTimers();
    const t = createSlowTracker({ delayMs: 1000 });
    const a = t.start();
    const b = t.start();
    vi.advanceTimersByTime(1500);
    t.end(a);
    expect(t.isSlow()).toBe(true);
    t.end(b);
    expect(t.isSlow()).toBe(false);
    t.end(b); // ending twice is harmless
    vi.useRealTimers();
  });
});
