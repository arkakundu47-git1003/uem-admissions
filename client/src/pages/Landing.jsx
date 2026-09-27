import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api';
import PortalNav from '../components/PortalNav';
const journey = ['Explore', 'Apply', 'Submit', 'Review', 'Track'];
export default function Landing() {
  const [status, setStatus] = useState('checking');
  useEffect(() => { api.get('/health').then((res) => setStatus(res.data.dbState)).catch(() => setStatus('unreachable')); }, []);
  return <main className="min-h-screen bg-paper text-ink"><PortalNav />
    <section className="px-6 md:px-8 py-16 md:py-20 max-w-4xl">
      <p className="text-xs uppercase tracking-[0.2em] text-amber font-semibold">Digital Admission Journey</p>
      <h1 className="font-display text-4xl md:text-6xl leading-tight font-semibold mt-3">Your journey to university starts here.</h1>
      <p className="mt-6 text-slate text-lg max-w-2xl">Explore programs, create an application, upload documents, and track admission progress from one place.</p>
      <div className="mt-10 flex flex-wrap gap-3">{journey.map((step,i)=><span key={step} className="text-sm font-medium">{step}{i<journey.length-1 && <span className="text-amber ml-3">→</span>}</span>)}</div>
      <div className="mt-12 flex flex-wrap gap-4"><Link to="/courses" className="bg-amber text-white px-5 py-2.5 rounded-sm font-medium hover:bg-amber-dark">Explore Programs</Link><Link to="/register" className="border border-ink/20 px-5 py-2.5 rounded-sm font-medium hover:border-ink/40">Start Application</Link></div>
      <p className="mt-14 text-xs text-slate">API connection: <span className={status === 'connected' ? 'text-success font-medium' : status === 'checking' ? 'text-slate' : 'text-danger font-medium'}>{status}</span></p>
    </section>
  </main>;
}
