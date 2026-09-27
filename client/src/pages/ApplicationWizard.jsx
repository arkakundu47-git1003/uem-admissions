import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { applicationService } from '../services/applicationService';
import { documentService } from '../services/documentService';

const STEPS = ['Personal Information', 'Academic Information', 'Program', 'Documents', 'Review'];

export default function ApplicationWizard() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [application, setApplication] = useState(null);
  const [course, setCourse] = useState(null);
  const [documents, setDocuments] = useState([]);
  const [step, setStep] = useState(1);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const [personal, setPersonal] = useState({
    fullName: '',
    dateOfBirth: '',
    gender: '',
    phone: '',
    address: '',
  });
  const [academic, setAcademic] = useState({
    classXPercentage: '',
    classXIIPercentage: '',
    board: '',
    passingYear: '',
  });

  useEffect(() => {
    load();
  }, [id]);

  async function load() {
    try {
      const res = await applicationService.getById(id);
      setApplication(res.application);
      setCourse(res.application.courseId);
      setDocuments(res.documents || []);
      setStep(Math.min(res.application.currentStep || 1, 5));
      if (res.application.personalInformation) {
        setPersonal((p) => ({
          ...p,
          ...res.application.personalInformation,
          dateOfBirth: res.application.personalInformation.dateOfBirth?.slice(0, 10) || '',
        }));
      }
      if (res.application.academicInformation) {
        setAcademic((a) => ({ ...a, ...res.application.academicInformation }));
      }
    } catch {
      setError("We couldn't load your application.");
    }
  }

  async function goToStep(next) {
    setError('');
    setSaving(true);
    try {
      if (step === 1) {
        await applicationService.update(id, { personalInformation: personal, currentStep: next });
      } else if (step === 2) {
        await applicationService.update(id, {
          academicInformation: {
            ...academic,
            classXPercentage: Number(academic.classXPercentage),
            classXIIPercentage: Number(academic.classXIIPercentage),
            passingYear: Number(academic.passingYear),
          },
          currentStep: next,
        });
        const refreshed = await applicationService.getById(id);
        setApplication(refreshed.application);
      } else {
        await applicationService.update(id, { currentStep: next });
      }
      setStep(next);
    } catch (err) {
      setError(err.response?.data?.message || 'Could not save this step.');
    } finally {
      setSaving(false);
    }
  }

  async function handleUpload(documentType, file) {
    setError('');
    try {
      await documentService.upload(id, documentType, file);
      const res = await documentService.listForApplication(id);
      setDocuments(res.documents);
    } catch (err) {
      setError(err.response?.data?.message || 'Upload failed.');
    }
  }

  async function handleSubmit() {
    setError('');
    setSaving(true);
    try {
      await applicationService.submit(id);
      navigate('/student/dashboard');
    } catch (err) {
      setError(err.response?.data?.message || 'Could not submit application.');
    } finally {
      setSaving(false);
    }
  }

  if (!application) {
    return <p className="p-10 text-slate text-sm">{error || 'Loading your application…'}</p>;
  }

  const docStatus = (type) => documents.find((d) => d.documentType === type);

  return (
    <main className="min-h-screen bg-paper px-8 py-10 max-w-2xl">
      <h1 className="font-display text-2xl font-semibold text-ink">
        Applying to {course?.name}
      </h1>

      <ol className="flex gap-4 mt-6 text-xs">
        {STEPS.map((s, i) => (
          <li
            key={s}
            className={i + 1 === step ? 'text-amber font-semibold' : 'text-slate'}
          >
            {i + 1}. {s}
          </li>
        ))}
      </ol>

      {error && (
        <p className="text-danger text-sm bg-danger/10 rounded-sm px-3 py-2 mt-6">{error}</p>
      )}

      <div className="mt-8">
        {step === 1 && (
          <div className="space-y-4">
            <Field label="Full name" value={personal.fullName} onChange={(v) => setPersonal({ ...personal, fullName: v })} />
            <Field label="Date of birth" type="date" value={personal.dateOfBirth} onChange={(v) => setPersonal({ ...personal, dateOfBirth: v })} />
            <Field label="Gender" value={personal.gender} onChange={(v) => setPersonal({ ...personal, gender: v })} />
            <Field label="Phone" value={personal.phone} onChange={(v) => setPersonal({ ...personal, phone: v })} />
            <Field label="Address" value={personal.address} onChange={(v) => setPersonal({ ...personal, address: v })} />
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <Field label="Class X percentage" type="number" value={academic.classXPercentage} onChange={(v) => setAcademic({ ...academic, classXPercentage: v })} />
            <Field label="Class XII percentage" type="number" value={academic.classXIIPercentage} onChange={(v) => setAcademic({ ...academic, classXIIPercentage: v })} />
            <Field label="Board" value={academic.board} onChange={(v) => setAcademic({ ...academic, board: v })} />
            <Field label="Passing year" type="number" value={academic.passingYear} onChange={(v) => setAcademic({ ...academic, passingYear: v })} />
            {application.eligibility?.isEligible !== null && application.eligibility?.isEligible !== undefined && (
              <p className={application.eligibility.isEligible ? 'text-success text-sm' : 'text-danger text-sm'}>
                {application.eligibility.isEligible ? '✓' : '✕'} Prototype Eligibility Criteria: {application.eligibility.rule}
              </p>
            )}
          </div>
        )}

        {step === 3 && (
          <div className="text-sm text-slate">
            <p className="text-ink font-medium">{course?.name}</p>
            <p className="mt-1">{course?.department} · {course?.degree}</p>
            <p className="mt-1">Program selection is locked to the course you applied from.</p>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-3">
            {(course?.requiredDocuments || []).map((docType) => {
              const doc = docStatus(docType);
              return (
                <div key={docType} className="flex items-center justify-between border border-ink/10 rounded-sm p-3">
                  <div>
                    <p className="text-sm font-medium text-ink">{docType}</p>
                    <p className="text-xs text-slate mt-0.5">
                      {doc ? `${doc.status} — ${doc.fileName}` : 'Pending'}
                    </p>
                  </div>
                  <label className="text-xs text-amber font-medium cursor-pointer">
                    {doc ? 'Replace' : 'Upload'}
                    <input
                      type="file"
                      accept="image/jpeg,image/png,application/pdf"
                      className="hidden"
                      onChange={(e) => e.target.files[0] && handleUpload(docType, e.target.files[0])}
                    />
                  </label>
                </div>
              );
            })}
          </div>
        )}

        {step === 5 && (
          <div className="space-y-4 text-sm">
            <ReviewBlock title="Applicant" rows={personal} />
            <ReviewBlock title="Academic Information" rows={academic} />
            <ReviewBlock title="Documents" rows={Object.fromEntries(documents.map((d) => [d.documentType, d.status]))} />
          </div>
        )}
      </div>

      <div className="mt-10 flex justify-between">
        <button
          disabled={step === 1}
          onClick={() => setStep((s) => s - 1)}
          className="text-sm text-slate disabled:opacity-40"
        >
          ← Back
        </button>

        {step < 5 ? (
          <button
            disabled={saving}
            onClick={() => goToStep(step + 1)}
            className="bg-amber text-white px-5 py-2 rounded-sm text-sm font-medium hover:bg-amber-dark disabled:opacity-60"
          >
            {saving ? 'Saving…' : 'Next'}
          </button>
        ) : (
          <button
            disabled={saving}
            onClick={handleSubmit}
            className="bg-amber text-white px-5 py-2 rounded-sm text-sm font-medium hover:bg-amber-dark disabled:opacity-60"
          >
            {saving ? 'Submitting…' : 'Submit Application'}
          </button>
        )}
      </div>
    </main>
  );
}

function Field({ label, type = 'text', value, onChange }) {
  return (
    <div>
      <label className="text-sm font-medium text-ink/80">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full border border-ink/20 rounded-sm px-3 py-2 text-sm focus:outline-none focus:border-amber"
      />
    </div>
  );
}

function ReviewBlock({ title, rows }) {
  return (
    <div className="border border-ink/10 rounded-sm p-4">
      <h3 className="font-display text-sm font-semibold text-ink">{title}</h3>
      <dl className="mt-2 space-y-1">
        {Object.entries(rows).map(([k, v]) => (
          <div key={k} className="flex justify-between text-xs">
            <dt className="text-slate capitalize">{k.replace(/([A-Z])/g, ' $1')}</dt>
            <dd className="text-ink">{String(v || '—')}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
