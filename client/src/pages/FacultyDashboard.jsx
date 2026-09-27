import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import PortalNav from '../components/PortalNav';
import StatusBadge from '../components/StatusBadge';
import { useAuth } from '../context/AuthContext';
import { facultyService } from '../services/facultyService';
export default function FacultyDashboard() {
  const { user } = useAuth(); const [apps,setApps]=useState([]); const [error,setError]=useState('');
  useEffect(()=>{ facultyService.listApplications().then(r=>setApps(r.applications)).catch(()=>setError('Could not load department applications.')); },[]);
  return <main className="min-h-screen bg-paper"><PortalNav/><section className="px-5 md:px-8 py-8">
    <p className="text-xs uppercase tracking-wide text-slate">Faculty Coordinator</p><h1 className="font-display text-3xl font-semibold mt-1">{user?.department || 'Department'} applications</h1>
    <p className="text-sm text-slate mt-2">Review submitted applications for your department. Document decisions are available from each review page.</p>
    {error&&<p className="text-danger text-sm mt-6">{error}</p>}
    <div className="mt-7 bg-white border border-ink/10 rounded-sm overflow-auto"><table className="w-full text-sm"><thead className="bg-indigo/5 text-left text-xs text-slate uppercase"><tr><th className="px-4 py-3">Application</th><th className="px-4 py-3">Applicant</th><th className="px-4 py-3">Program</th><th className="px-4 py-3">Status</th><th className="px-4 py-3"></th></tr></thead><tbody>{apps.map(a=><tr key={a._id} className="border-t border-ink/5"><td className="px-4 py-3">{a.applicationNumber||'—'}</td><td className="px-4 py-3">{a.studentId?.name}</td><td className="px-4 py-3 text-slate">{a.courseId?.name}</td><td className="px-4 py-3"><StatusBadge status={a.status}/></td><td className="px-4 py-3"><Link className="text-amber font-medium" to={`/faculty/applications/${a._id}`}>Review →</Link></td></tr>)}{apps.length===0&&<tr><td colSpan="5" className="p-8 text-center text-slate">No submitted applications found.</td></tr>}</tbody></table></div>
  </section></main>;
}
