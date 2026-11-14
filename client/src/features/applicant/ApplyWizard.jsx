import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { AnimatePresence, motion } from 'framer-motion';
import { toast } from 'sonner';
import { ArrowLeft, ArrowRight, Banknote, CheckCircle2, CircleAlert, CreditCard, Landmark, Loader2, Send, Smartphone, XCircle } from 'lucide-react';
import { api, parseError } from '../../lib/api';
import { useDebounce } from '../../hooks/useDebounce';
import { DOC_TYPES } from '../../lib/constants';
import { formatDate, formatDateTime, formatINR, toInputDate } from '../../lib/format';
import { Button } from '../../components/ui/Button';
import { SelectField, TextAreaField, TextField } from '../../components/ui/Field';
import { Alert, ErrorState, Skeleton } from '../../components/ui/Feedback';
import { Stepper } from '../../components/ui/Misc';
import { DocUpload } from './DocUpload';
import { DocumentPreview } from '../../components/shared/DocumentPreview';

/* ---------------- validation ---------------- */
const req = (m) => z.string().trim().min(1, m);
const phone = (m) => z.string().trim().regex(/^\+?\d{10,13}$/, m);
const numOpt = (max, m) => z.string().optional().refine((v) => !v || (!Number.isNaN(Number(v)) && Number(v) >= 0 && Number(v) <= max), m);
const schema = z.object({
  personal: z.object({
    fullName: req('Enter your full name'),
    dateOfBirth: req('Enter your date of birth'),
    gender: req('Select a gender'),
    phone: phone('Enter a valid phone number (10–13 digits)'),
    address: req('Enter your address'),
    city: req('Enter your city'),
    state: req('Enter your state'),
    pincode: z.string().trim().regex(/^\d{6}$/, 'Enter a 6-digit PIN code'),
    guardianName: req('Enter a guardian’s name'),
    guardianPhone: phone('Enter a valid phone number (10–13 digits)'),
  }),
  academic: z.object({
    board: req('Enter your board / university'),
    schoolName: req('Enter your school or college'),
    passingYear: z.string().trim().regex(/^(19|20)\d{2}$/, 'Enter a valid year, e.g. 2026'),
    percentage: z.string().trim().min(1, 'Enter your aggregate percentage').refine((v) => !Number.isNaN(Number(v)) && Number(v) >= 0 && Number(v) <= 100, 'Enter a value between 0 and 100'),
    entranceExam: z.string().optional(),
    entranceScore: numOpt(1000, 'Enter a valid score'),
  }),
  statement: z.string().max(2000, 'Keep your statement under 2000 characters').optional(),
});

const STEP_FIELDS = {
  Personal: ['personal.fullName', 'personal.dateOfBirth', 'personal.gender', 'personal.phone', 'personal.address', 'personal.city', 'personal.state', 'personal.pincode', 'personal.guardianName', 'personal.guardianPhone'],
  Academic: ['academic.board', 'academic.schoolName', 'academic.passingYear', 'academic.percentage', 'academic.entranceExam', 'academic.entranceScore', 'statement'],
};

const toForm = (a) => ({
  personal: {
    fullName: a.personal?.fullName ?? '', dateOfBirth: toInputDate(a.personal?.dateOfBirth), gender: a.personal?.gender ?? '', phone: a.personal?.phone ?? '',
    address: a.personal?.address ?? '', city: a.personal?.city ?? '', state: a.personal?.state ?? '', pincode: a.personal?.pincode ?? '',
    guardianName: a.personal?.guardianName ?? '', guardianPhone: a.personal?.guardianPhone ?? '',
  },
  academic: {
    board: a.academic?.board ?? '', schoolName: a.academic?.schoolName ?? '', passingYear: a.academic?.passingYear?.toString() ?? '',
    percentage: a.academic?.percentage?.toString() ?? '', entranceExam: a.academic?.entranceExam ?? '', entranceScore: a.academic?.entranceScore?.toString() ?? '',
  },
  statement: a.statement ?? '',
});

/** Drop values the draft endpoint would reject while the user is mid-typing, so autosave never nags. */
function cleanDraft(v, step) {
  const num = (s, lo, hi) => (s !== '' && !Number.isNaN(Number(s)) && Number(s) >= lo && Number(s) <= hi ? s : undefined);
  const p = v.personal;
  const year = new Date().getFullYear() + 1;
  return {
    step,
    statement: (v.statement || '').slice(0, 2000),
    personal: { ...p, phone: p.phone.slice(0, 15), guardianPhone: p.guardianPhone.slice(0, 15), pincode: /^\d{6}$/.test(p.pincode) ? p.pincode : '', dateOfBirth: p.dateOfBirth || undefined },
    academic: { ...v.academic, passingYear: num(v.academic.passingYear, 1990, year), percentage: num(v.academic.percentage, 0, 100), entranceScore: num(v.academic.entranceScore, 0, 1000) },
  };
}

const variants = { enter: { opacity: 0, x: 24 }, center: { opacity: 1, x: 0 }, exit: { opacity: 0, x: -24 } };

/* ---------------- page ---------------- */
export default function ApplyWizard() {
  const { courseId } = useParams();
  const qc = useQueryClient();

  // POST /applications is idempotent: it returns the existing application for this course or creates a draft.
  const { data: application, error, refetch, isLoading } = useQuery({
    queryKey: ['apply', courseId],
    queryFn: async () => (await api.post('/applications', { courseId })).data.application,
    staleTime: Infinity,
    refetchOnMount: 'always',
    retry: false,
  });

  if (isLoading) return <div className="stack"><Skeleton h={36} w="40%" /><Skeleton h={80} /><Skeleton h={360} /></div>;
  if (error) return <ErrorState error={parseError(error)} onRetry={refetch} title="We couldn’t open this application" />;
  if (application.status !== 'draft') return <Navigate to={`/applicant/applications/${application._id}`} replace />;
  return <Wizard key={application._id} initial={application} qc={qc} />;
}

function Wizard({ initial, qc }) {
  const navigate = useNavigate();
  const [app, setApp] = useState(initial);
  const course = app.course;
  const steps = useMemo(() => ['Personal', 'Academic', 'Documents', ...(app.payment.status !== 'not_required' ? ['Payment'] : []), 'Review'], [app.payment.status]);
  const [step, setStep] = useState(Math.min(initial.step || 0, steps.length - 1));
  const [saveState, setSaveState] = useState({ status: 'idle', at: null });
  const [submitted, setSubmitted] = useState(null);
  const [preview, setPreview] = useState(null);
  const headingRef = useRef(null);
  const current = steps[step];

  const form = useForm({ resolver: zodResolver(schema), mode: 'onTouched', defaultValues: toForm(initial) });
  const { register, control, trigger, getValues, setError, formState: { errors } } = form;
  const values = useWatch({ control });
  const debounced = useDebounce(JSON.stringify(values), 1200);

  /* ----- autosave ----- */
  const save = useMutation({
    mutationFn: async (stepIndex) => (await api.put(`/applications/${app._id}`, cleanDraft(getValues(), stepIndex))).data,
    onMutate: () => setSaveState((s) => ({ ...s, status: 'saving' })),
    onSuccess: (d) => setSaveState({ status: 'saved', at: new Date(d.savedAt) }),
    onError: () => setSaveState((s) => ({ ...s, status: 'error' })),
  });
  const firstRun = useRef(true);
  useEffect(() => {
    if (firstRun.current) { firstRun.current = false; return; }
    save.mutate(step);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);

  useEffect(() => { headingRef.current?.focus(); window.scrollTo({ top: 0, behavior: 'smooth' }); }, [step]);

  const percent = Number(values.academic?.percentage);
  const hasPercent = values.academic?.percentage !== '' && !Number.isNaN(percent);
  const eligible = !hasPercent || percent >= course.minPercentage;

  const goTo = useCallback((i) => { setStep(i); save.mutate(i); }, [save]);

  const next = async () => {
    const fields = STEP_FIELDS[current];
    if (fields && !(await trigger(fields, { shouldFocus: true }))) return;
    if (current === 'Academic' && !eligible) {
      setError('academic.percentage', { message: `This programme requires at least ${course.minPercentage}%` }, { shouldFocus: true });
      return;
    }
    if (current === 'Documents') {
      const have = new Set(app.documents.map((d) => d.type));
      if (course.requiredDocuments.some((t) => !have.has(t))) { toast.error('Upload every required document to continue'); return; }
    }
    goTo(step + 1);
  };

  const pay = useMutation({
    mutationFn: async (method) => (await api.post(`/applications/${app._id}/pay`, { method })).data.application,
    onSuccess: (a) => { setApp(a); toast.success('Payment received'); },
    onError: (e) => toast.error(parseError(e).message),
  });

  const submit = useMutation({
    mutationFn: async () => {
      await api.put(`/applications/${app._id}`, cleanDraft(getValues(), step));
      return (await api.post(`/applications/${app._id}/submit`)).data.application;
    },
    onSuccess: (a) => {
      setSubmitted(a);
      qc.invalidateQueries({ queryKey: ['applications'] });
      qc.invalidateQueries({ queryKey: ['notifications'] });
      qc.setQueryData(['apply', course._id], a);
    },
  });

  if (submitted) return <SuccessScreen app={submitted} onDone={() => navigate('/applicant')} />;

  return (
    <div className="wizard">
      <div className="page-head" style={{ marginBottom: 0 }}>
        <div>
          <Link to={`/courses/${course._id}`} className="row" style={{ gap: 6, fontSize: 'var(--text-sm)' }}><ArrowLeft size={15} aria-hidden="true" /> {course.code} · {course.name}</Link>
          <h1 style={{ marginTop: 6, fontSize: 'var(--text-2xl)' }}>Admission application</h1>
          <p>Application no. <strong className="mono">{app.applicationNo}</strong></p>
        </div>
        <span className="save-state" role="status" aria-live="polite">
          {saveState.status === 'saving' && <><Loader2 size={15} className="spin" style={{ animation: 'spin 0.8s linear infinite' }} aria-hidden="true" /> Saving…</>}
          {saveState.status === 'saved' && <><CheckCircle2 size={15} color="var(--success)" aria-hidden="true" /> Draft saved {formatDateTime(saveState.at).split(', ').pop()}</>}
          {saveState.status === 'error' && <><XCircle size={15} color="var(--danger)" aria-hidden="true" /> Couldn’t save — we’ll retry</>}
          {saveState.status === 'idle' && 'Changes save automatically'}
        </span>
      </div>

      <Stepper steps={steps} current={step} />

      <form className="card wizard-card" noValidate onSubmit={(e) => e.preventDefault()} aria-labelledby="step-title">
        <h2 id="step-title" ref={headingRef} tabIndex={-1} style={{ fontSize: 'var(--text-xl)', marginBottom: 'var(--space-5)' }}>
          Step {step + 1} of {steps.length}: {current === 'Review' ? 'Review & submit' : current === 'Personal' ? 'Personal details' : current === 'Academic' ? 'Academic details' : current === 'Documents' ? 'Upload documents' : 'Application fee'}
        </h2>

        <AnimatePresence mode="wait">
          <motion.div key={current} variants={variants} initial="enter" animate="center" exit="exit" transition={{ duration: 0.22 }}>
            {current === 'Personal' && (
              <div className="form-grid cols-2">
                <TextField label="Full name" required autoComplete="name" error={errors.personal?.fullName?.message} {...register('personal.fullName')} />
                <TextField label="Date of birth" type="date" required autoComplete="bday" error={errors.personal?.dateOfBirth?.message} {...register('personal.dateOfBirth')} />
                <SelectField label="Gender" required error={errors.personal?.gender?.message} {...register('personal.gender')}>
                  <option value="">Select…</option><option value="female">Female</option><option value="male">Male</option><option value="other">Other / prefer not to say</option>
                </SelectField>
                <TextField label="Mobile number" type="tel" required autoComplete="tel" error={errors.personal?.phone?.message} {...register('personal.phone')} />
                <div className="span-2"><TextField label="Address" required autoComplete="street-address" error={errors.personal?.address?.message} {...register('personal.address')} /></div>
                <TextField label="City" required autoComplete="address-level2" error={errors.personal?.city?.message} {...register('personal.city')} />
                <TextField label="State" required autoComplete="address-level1" error={errors.personal?.state?.message} {...register('personal.state')} />
                <TextField label="PIN code" required inputMode="numeric" maxLength={6} autoComplete="postal-code" error={errors.personal?.pincode?.message} {...register('personal.pincode')} />
                <span />
                <TextField label="Parent / guardian name" required error={errors.personal?.guardianName?.message} {...register('personal.guardianName')} />
                <TextField label="Guardian mobile" type="tel" required error={errors.personal?.guardianPhone?.message} {...register('personal.guardianPhone')} />
              </div>
            )}

            {current === 'Academic' && (
              <div className="stack">
                <div className="form-grid cols-2">
                  <TextField label="Board / university" required placeholder="CBSE, ISC, WBCHSE…" error={errors.academic?.board?.message} {...register('academic.board')} />
                  <TextField label="School / college" required error={errors.academic?.schoolName?.message} {...register('academic.schoolName')} />
                  <TextField label="Year of passing" required inputMode="numeric" maxLength={4} placeholder="2026" error={errors.academic?.passingYear?.message} {...register('academic.passingYear')} />
                  <TextField label="Aggregate percentage" required inputMode="decimal" hint={`Minimum required: ${course.minPercentage}%`} error={errors.academic?.percentage?.message} {...register('academic.percentage')} />
                  {course.requiredDocuments.includes('entranceScorecard') && (
                    <>
                      <TextField label="Entrance exam" placeholder="WBJEE, JEE Main, CAT…" error={errors.academic?.entranceExam?.message} {...register('academic.entranceExam')} />
                      <TextField label="Entrance score / rank" inputMode="decimal" error={errors.academic?.entranceScore?.message} {...register('academic.entranceScore')} />
                    </>
                  )}
                </div>
                {hasPercent && (eligible
                  ? <Alert tone="success" aria-live="polite">You meet the minimum eligibility of {course.minPercentage}% for {course.code}.</Alert>
                  : <Alert tone="danger" title="Below the minimum eligibility" aria-live="polite">{course.name} requires at least {course.minPercentage}%. You entered {percent}%. Double-check the figure or consider another programme.</Alert>)}
                <TextAreaField label="Statement of purpose (optional)" hint={`${(values.statement || '').length}/2000 characters`} placeholder="Tell us why you want to join this programme…" error={errors.statement?.message} {...register('statement')} />
              </div>
            )}

            {current === 'Documents' && (
              <div className="stack">
                <Alert tone="info">Upload clear scans or photos. Each file must be a PDF, JPG or PNG up to 5 MB. Our officers will verify them after you submit.</Alert>
                {course.requiredDocuments.map((t) => (
                  <DocUpload key={t} appId={app._id} type={t} doc={app.documents.find((d) => d.type === t)} onChange={setApp} onPreview={setPreview} />
                ))}
                <p className="muted" style={{ fontSize: 'var(--text-sm)' }} aria-live="polite">{app.documents.length} of {course.requiredDocuments.length} required documents uploaded.</p>
              </div>
            )}

            {current === 'Payment' && <PaymentStep app={app} pay={pay} />}

            {current === 'Review' && (
              <ReviewStep app={app} course={course} values={values} eligible={eligible} goTo={goTo} steps={steps} submit={submit} />
            )}
          </motion.div>
        </AnimatePresence>

        <div className="wizard-nav">
          <Button icon={<ArrowLeft size={16} />} disabled={step === 0} onClick={() => goTo(step - 1)}>Back</Button>
          {current !== 'Review' && <Button variant="primary" onClick={next}>Save &amp; continue <ArrowRight size={16} aria-hidden="true" /></Button>}
        </div>
      </form>

      <DocumentPreview appId={app._id} doc={preview} onClose={() => setPreview(null)} />
    </div>
  );
}

/* ---------------- steps ---------------- */
const METHODS = [
  { id: 'upi', label: 'UPI', icon: Smartphone, hint: 'GPay, PhonePe, Paytm' },
  { id: 'card', label: 'Card', icon: CreditCard, hint: 'Debit or credit' },
  { id: 'netbanking', label: 'Net banking', icon: Landmark, hint: 'All major banks' },
];

function PaymentStep({ app, pay }) {
  const [method, setMethod] = useState('upi');
  if (app.payment.status === 'paid') {
    return (
      <div className="stack">
        <Alert tone="success" title="Payment received">Thank you. Your application fee of {formatINR(app.payment.amount)} is paid.</Alert>
        <dl className="kv"><dt>Transaction ID</dt><dd className="mono">{app.payment.transactionId}</dd><dt>Method</dt><dd style={{ textTransform: 'uppercase' }}>{app.payment.method}</dd><dt>Paid on</dt><dd>{formatDateTime(app.payment.paidAt)}</dd></dl>
      </div>
    );
  }
  return (
    <div className="stack">
      <Alert tone="info" title="Test mode">This demo uses a simulated payment. No money is charged.</Alert>
      <div className="row-between"><span>Application fee</span><strong style={{ fontSize: 'var(--text-xl)', fontFamily: 'var(--font-display)' }}>{formatINR(app.payment.amount)}</strong></div>
      <div role="radiogroup" aria-label="Payment method" className="pay-options">
        {METHODS.map((m) => (
          <button key={m.id} type="button" role="radio" aria-checked={method === m.id} className="pay-option" onClick={() => setMethod(m.id)}>
            <m.icon size={22} aria-hidden="true" /><strong>{m.label}</strong><span className="muted" style={{ fontSize: 'var(--text-xs)' }}>{m.hint}</span>
          </button>
        ))}
      </div>
      <Button variant="accent" size="lg" loading={pay.isPending} icon={<Banknote size={18} />} onClick={() => pay.mutate(method)}>Pay {formatINR(app.payment.amount)}</Button>
    </div>
  );
}

function ReviewStep({ app, course, values, eligible, goTo, steps, submit }) {
  const [agree, setAgree] = useState(false);
  const detailsOk = schema.safeParse(values).success;
  const docsOk = course.requiredDocuments.every((t) => app.documents.some((d) => d.type === t));
  const feeOk = app.payment.status !== 'unpaid';
  const checks = [
    { ok: detailsOk, text: 'Personal and academic details are complete', fix: detailsOk ? null : 0 },
    { ok: eligible && !!values.academic?.percentage, text: `Meets the ${course.minPercentage}% minimum eligibility`, fix: 1 },
    { ok: docsOk, text: `All ${course.requiredDocuments.length} required documents uploaded`, fix: steps.indexOf('Documents') },
    ...(app.payment.status === 'not_required' ? [] : [{ ok: feeOk, text: 'Application fee paid', fix: steps.indexOf('Payment') }]),
  ];
  const ready = checks.every((c) => c.ok) && agree;
  const p = values.personal || {};
  const a = values.academic || {};
  const err = submit.error ? parseError(submit.error) : null;

  return (
    <div className="stack-lg">
      <section aria-labelledby="chk"><h3 id="chk" style={{ fontSize: 'var(--text-lg)', marginBottom: 10 }}>Readiness checklist</h3>
        <ul className="checklist">
          {checks.map((c) => (
            <li key={c.text}>
              {c.ok ? <CheckCircle2 size={18} className="ok" aria-label="Done" /> : <CircleAlert size={18} className="bad" aria-label="Needs attention" />}
              <span>{c.text}</span>
              {!c.ok && c.fix != null && c.fix >= 0 && <Button size="sm" variant="ghost" onClick={() => goTo(c.fix)} style={{ marginLeft: 'auto' }}>Fix</Button>}
            </li>
          ))}
        </ul>
      </section>

      <div className="form-grid cols-2" style={{ alignItems: 'start' }}>
        <section className="card card-pad" aria-labelledby="sp">
          <div className="row-between" style={{ marginBottom: 10 }}><h3 id="sp" style={{ fontSize: 'var(--text-md)' }}>Personal</h3><Button size="sm" variant="ghost" onClick={() => goTo(0)}>Edit</Button></div>
          <dl className="kv"><dt>Name</dt><dd>{p.fullName}</dd><dt>Date of birth</dt><dd>{p.dateOfBirth ? formatDate(p.dateOfBirth) : '—'}</dd><dt>Phone</dt><dd>{p.phone}</dd><dt>Address</dt><dd>{[p.address, p.city, p.state, p.pincode].filter(Boolean).join(', ')}</dd><dt>Guardian</dt><dd>{p.guardianName} · {p.guardianPhone}</dd></dl>
        </section>
        <section className="card card-pad" aria-labelledby="sa">
          <div className="row-between" style={{ marginBottom: 10 }}><h3 id="sa" style={{ fontSize: 'var(--text-md)' }}>Academic</h3><Button size="sm" variant="ghost" onClick={() => goTo(1)}>Edit</Button></div>
          <dl className="kv"><dt>Board</dt><dd>{a.board}</dd><dt>School</dt><dd>{a.schoolName}</dd><dt>Passing year</dt><dd>{a.passingYear}</dd><dt>Percentage</dt><dd>{a.percentage}%</dd>{a.entranceExam && <><dt>Entrance</dt><dd>{a.entranceExam} · {a.entranceScore}</dd></>}</dl>
        </section>
      </div>

      <label className="check"><input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} /> I declare that all information and documents provided are true and complete. I understand that false information can lead to cancellation of admission.</label>
      {err && <Alert tone="danger" title={err.message}>{Object.values(err.fields || {}).join(' · ')}</Alert>}
      <Button variant="accent" size="lg" disabled={!ready} loading={submit.isPending} icon={<Send size={18} />} onClick={() => submit.mutate()}>Submit application</Button>
    </div>
  );
}

function SuccessScreen({ app, onDone }) {
  return (
    <motion.div className="card success-screen" initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} role="status">
      <svg className="check-draw" width="96" height="96" viewBox="0 0 64 64" fill="none" stroke="var(--success)" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="32" cy="32" r="27" /><path d="m20 33 8 8 17-18" />
      </svg>
      <h1 style={{ fontSize: 'var(--text-2xl)' }}>Application submitted!</h1>
      <p className="muted" style={{ maxWidth: '46ch' }}>Your application <strong className="mono">{app.applicationNo}</strong> is with our admissions team. We’ll notify you as soon as it moves to the next stage.</p>
      <div className="row" style={{ justifyContent: 'center' }}>
        <Button variant="primary" to={`/applicant/applications/${app._id}`}>Track status</Button>
        <Button onClick={onDone}>Back to dashboard</Button>
      </div>
    </motion.div>
  );
}
