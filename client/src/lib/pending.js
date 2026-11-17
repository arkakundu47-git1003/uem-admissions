// Tracks requests that are still waiting. When one has waited longer than `delayMs` (a free-tier server waking up from
// sleep can take about a minute) listeners are told, so the UI can explain the delay instead of looking frozen.
export function createSlowTracker({ delayMs = 6000, setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
  let nextId = 0;
  const open = new Set();
  const listeners = new Set();
  let slow = false;
  let timer = null;

  const set = (value) => {
    if (slow === value) return;
    slow = value;
    listeners.forEach((l) => l(slow));
  };
  const arm = () => {
    if (timer || !open.size) return;
    timer = setTimer(() => { timer = null; if (open.size) set(true); }, delayMs);
  };

  return {
    start() {
      const id = ++nextId;
      open.add(id);
      arm();
      return id;
    },
    end(id) {
      if (!open.delete(id)) return;
      if (!open.size) {
        if (timer) { clearTimer(timer); timer = null; }
        set(false);
      }
    },
    isSlow: () => slow,
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}

export const slowTracker = createSlowTracker();
