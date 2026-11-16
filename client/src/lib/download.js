import { api, parseError } from './api';

/** Download a protected file (the access token is sent with the request, so a plain link would not work). */
export async function downloadFile(path, params, fallbackName) {
  let res;
  try {
    res = await api.get(path, { params, responseType: 'blob', timeout: 120000 });
  } catch (err) {
    // error bodies arrive as a Blob when responseType is 'blob': read the JSON message out of it
    const blob = err?.response?.data;
    if (blob instanceof Blob) {
      try {
        const json = JSON.parse(await blob.text());
        throw new Error(json.message || 'Download failed');
      } catch (inner) {
        if (inner instanceof SyntaxError) throw new Error('Download failed');
        throw inner;
      }
    }
    throw new Error(parseError(err).message);
  }
  const match = /filename="?([^";]+)"?/i.exec(res.headers['content-disposition'] || '');
  const url = URL.createObjectURL(res.data);
  const a = document.createElement('a');
  a.href = url;
  a.download = match ? decodeURIComponent(match[1]) : fallbackName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
