const STAGES = ['Profile', 'Application', 'Documents', 'Submitted', 'Under Review', 'Decision'];

export default function ProgressTracker({ currentIndex }) {
  return (
    <div className="flex items-center flex-wrap gap-y-3">
      {STAGES.map((stage, i) => (
        <div key={stage} className="flex items-center">
          <div className="flex flex-col items-center gap-1">
            <span
              className={
                i < currentIndex
                  ? 'w-6 h-6 rounded-full bg-success text-white text-xs flex items-center justify-center'
                  : i === currentIndex
                  ? 'w-6 h-6 rounded-full bg-amber text-white text-xs flex items-center justify-center'
                  : 'w-6 h-6 rounded-full border border-ink/20 text-slate text-xs flex items-center justify-center'
              }
            >
              {i < currentIndex ? '✓' : i === currentIndex ? '●' : '○'}
            </span>
            <span className="text-[11px] text-slate whitespace-nowrap">{stage}</span>
          </div>
          {i < STAGES.length - 1 && <span className="w-8 h-px bg-ink/15 mx-1 mb-4" />}
        </div>
      ))}
    </div>
  );
}
