import { useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { CheckCircle2, Eye, FileCheck2, RefreshCw, Trash2, UploadCloud, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { api, parseError } from '../../lib/api';
import { DOC_TYPES } from '../../lib/constants';
import { fileSize } from '../../lib/format';
import { Button } from '../../components/ui/Button';
import { DocBadge } from '../../components/ui/Badge';
import { ProgressBar } from '../../components/ui/Misc';

const OK_TYPES = ['application/pdf', 'image/jpeg', 'image/png'];
const MAX = 5 * 1024 * 1024;

/** One required document: drag & drop or browse, with progress, validation and status. */
export function DocUpload({ appId, type, doc, canEdit = true, canRemove = true, onChange, onPreview }) {
  const input = useRef(null);
  const [drag, setDrag] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');

  const upload = useMutation({
    mutationFn: async (file) => {
      const fd = new FormData();
      fd.append('type', type);
      fd.append('file', file);
      return (await api.post(`/applications/${appId}/documents`, fd, { onUploadProgress: (e) => setProgress(Math.round((e.loaded / (e.total || file.size)) * 100)) })).data.application;
    },
    onSuccess: (app) => { setProgress(0); setError(''); onChange(app); toast.success(`${DOC_TYPES[type]} uploaded`); },
    onError: (e) => { setProgress(0); setError(parseError(e).message); },
  });
  const remove = useMutation({
    mutationFn: async () => (await api.delete(`/applications/${appId}/documents/${doc._id}`)).data.application,
    onSuccess: (app) => { onChange(app); toast.success('Document removed'); },
    onError: (e) => toast.error(parseError(e).message),
  });

  const pick = (file) => {
    if (!file) return;
    if (!OK_TYPES.includes(file.type)) return setError('Only PDF, JPG or PNG files are accepted.');
    if (file.size > MAX) return setError(`That file is ${fileSize(file.size)}. The limit is 5 MB.`);
    setError('');
    upload.mutate(file);
  };

  const state = doc ? (doc.status === 'verified' ? 'verified' : doc.status === 'rejected' ? 'rejected' : 'uploaded') : undefined;
  const Icon = state === 'verified' ? CheckCircle2 : state === 'rejected' ? XCircle : doc ? FileCheck2 : UploadCloud;
  const busy = upload.isPending;

  return (
    <div>
      <div
        className="dropzone"
        data-drag={drag}
        data-state={state}
        onDragOver={(e) => { if (canEdit) { e.preventDefault(); setDrag(true); } }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); if (canEdit) pick(e.dataTransfer.files?.[0]); }}
      >
        <span className="dz-icon" aria-hidden="true"><Icon size={22} /></span>
        <div style={{ minWidth: 0 }}>
          <div className="dz-title">{DOC_TYPES[type]}</div>
          <div className="dz-meta truncate">
            {busy ? `Uploading… ${progress}%` : doc ? `${doc.originalName} · ${fileSize(doc.size)}` : 'Drag a file here or browse · PDF, JPG, PNG · max 5 MB'}
          </div>
          {doc && <div style={{ marginTop: 6 }}><DocBadge status={doc.status} /></div>}
        </div>
        <div className="dz-actions row" style={{ gap: 6, flexWrap: 'nowrap' }}>
          <input ref={input} type="file" accept=".pdf,.jpg,.jpeg,.png" className="sr-only" tabIndex={-1} aria-hidden="true" onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ''; }} />
          {doc && <Button size="sm" iconOnly onClick={() => onPreview?.(doc)} aria-label={`Preview ${DOC_TYPES[type]}`}><Eye size={16} /></Button>}
          {canEdit && (
            <Button size="sm" variant={doc ? 'secondary' : 'primary'} loading={busy} icon={doc ? <RefreshCw size={15} /> : <UploadCloud size={15} />} onClick={() => input.current?.click()} aria-label={`${doc ? 'Replace' : 'Upload'} ${DOC_TYPES[type]}`}>
              {doc ? 'Replace' : 'Upload'}
            </Button>
          )}
          {doc && canRemove && canEdit && <Button size="sm" variant="ghost" iconOnly loading={remove.isPending} onClick={() => remove.mutate()} aria-label={`Remove ${DOC_TYPES[type]}`}><Trash2 size={16} /></Button>}
        </div>
      </div>
      {busy && <div style={{ marginTop: 8 }}><ProgressBar value={progress} label={`Uploading ${DOC_TYPES[type]}`} /></div>}
      {error && <p className="field-error" role="alert" style={{ marginTop: 6 }}>{error}</p>}
      {doc?.status === 'rejected' && doc.remark && (
        <motion.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} className="field-error" style={{ marginTop: 6 }} role="status">Reviewer note: {doc.remark}</motion.p>
      )}
    </div>
  );
}
