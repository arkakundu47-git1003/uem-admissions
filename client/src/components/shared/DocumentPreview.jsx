import { useEffect, useState } from 'react';
import { Download, ExternalLink } from 'lucide-react';
import { api, parseError } from '../../lib/api';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Alert, Skeleton } from '../ui/Feedback';
import { DOC_TYPES } from '../../lib/constants';

export function DocumentPreview({ appId, doc, onClose }) {
  const [url, setUrl] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!doc) return undefined;
    let objectUrl;
    let cancelled = false;
    setUrl(null);
    setError(null);
    api.get(`/applications/${appId}/documents/${doc._id}/file`, { responseType: 'blob' })
      .then((res) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(res.data);
        setUrl(objectUrl);
      })
      .catch((e) => !cancelled && setError(parseError(e).message));
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [appId, doc]);

  const isImage = doc?.mimeType?.startsWith('image/');
  return (
    <Modal
      open={!!doc}
      onClose={onClose}
      wide
      title={doc ? DOC_TYPES[doc.type] : ''}
      description={doc?.originalName}
      footer={
        <>
          {url && <Button icon={<ExternalLink size={16} />} onClick={() => window.open(url, '_blank', 'noopener')}>Open in new tab</Button>}
          {url && (
            <a className="btn btn-secondary" href={url} download={doc?.originalName}><Download size={16} aria-hidden="true" /> Download</a>
          )}
          <Button variant="primary" onClick={onClose}>Done</Button>
        </>
      }
    >
      {error && <Alert tone="danger">{error}</Alert>}
      {!url && !error && <Skeleton h={360} />}
      {url && (isImage ? <img className="preview-img" src={url} alt={`${DOC_TYPES[doc.type]} preview`} /> : <iframe className="preview-frame" src={url} title={`${DOC_TYPES[doc.type]} preview`} />)}
    </Modal>
  );
}
