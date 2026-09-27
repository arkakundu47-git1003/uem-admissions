const styles = {
  Draft: 'bg-slate/10 text-slate',
  Submitted: 'bg-amber/10 text-amber-dark',
  'Under Review': 'bg-amber/10 text-amber-dark',
  Approved: 'bg-success/10 text-success',
  Rejected: 'bg-danger/10 text-danger',
};

export default function StatusBadge({ status }) {
  return (
    <span
      className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${
        styles[status] || 'bg-slate/10 text-slate'
      }`}
    >
      {status}
    </span>
  );
}
