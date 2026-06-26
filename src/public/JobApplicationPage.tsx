import { useEffect, useMemo, useState } from 'react';
import API_URL from '../config';

const API = `${API_URL}/api`;

// ── Tipos ─────────────────────────────────────────────────────────────────────
interface Ctx { orgName: string }
type Sex = 'male' | 'female';
type Shift = 'morning' | 'night';

interface FormState {
  firstName: string;
  lastName: string;
  phone: string;
  idCard: string;
  sex: Sex | '';
  age: string;
  fullTimeAvailability: boolean | null;
  shift: Shift | '';
  workedInSimilar: boolean | null;
  previousWorkplace: string;
  previousDuration: string;
  livesAt: string;
  salaryExpectation: string;
  availableFrom: string;
  weekendAvailability: boolean | null;
}

const EMPTY: FormState = {
  firstName: '', lastName: '', phone: '', idCard: '', sex: '', age: '',
  fullTimeAvailability: null, shift: '', workedInSimilar: null,
  previousWorkplace: '', previousDuration: '', livesAt: '',
  salaryExpectation: '', availableFrom: '', weekendAvailability: null,
};

// ── Parseo de la URL: /jobs/:code ─────────────────────────────────────────────
function parseCode() {
  const parts = window.location.pathname.split('/').filter(Boolean); // ['jobs', '<code>']
  return parts[1] ?? '';
}

export default function JobApplicationPage() {
  const code = useMemo(parseCode, []);

  const [ctx, setCtx] = useState<Ctx | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [submitting, setSubmitting] = useState(false);
  const [submitErr, setSubmitErr] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  // Cargar contexto (valida el link y trae el nombre de la org).
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${API}/public/jobs/${code}`);
        if (!res.ok) throw new Error('no encontrado');
        setCtx(await res.json());
      } catch {
        setLoadErr('Este enlace no es válido o ya no está disponible.');
      }
    })();
  }, [code]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  // Validación mínima antes de habilitar el envío.
  const isValid =
    form.firstName.trim() &&
    form.lastName.trim() &&
    form.phone.trim().length >= 5 &&
    form.idCard.trim() &&
    form.sex &&
    Number(form.age) >= 14 &&
    form.fullTimeAvailability !== null &&
    form.shift &&
    form.workedInSimilar !== null &&
    form.livesAt.trim() &&
    form.salaryExpectation.trim() &&
    form.weekendAvailability !== null;

  const submit = async () => {
    if (!isValid) return;
    setSubmitting(true);
    setSubmitErr(null);
    try {
      const res = await fetch(`${API}/public/jobs/${code}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName: form.firstName.trim(),
          lastName: form.lastName.trim(),
          phone: form.phone.trim(),
          idCard: form.idCard.trim(),
          sex: form.sex,
          age: Number(form.age),
          fullTimeAvailability: form.fullTimeAvailability,
          shift: form.shift,
          workedInSimilar: form.workedInSimilar,
          previousWorkplace: form.previousWorkplace.trim() || undefined,
          previousDuration: form.previousDuration.trim() || undefined,
          livesAt: form.livesAt.trim(),
          salaryExpectation: form.salaryExpectation.trim(),
          availableFrom: form.availableFrom.trim() || undefined,
          weekendAvailability: form.weekendAvailability,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.message || 'No se pudo enviar la postulación');
      setSent(true);
    } catch (e) {
      setSubmitErr((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────────
  if (loadErr) return <Shell><Centered>{loadErr}</Centered></Shell>;
  if (!ctx) return <Shell><Centered><Spinner /></Centered></Shell>;

  if (sent) {
    return (
      <Shell>
        <Card>
          <div className="text-center py-4">
            <div className="text-5xl mb-3">✅</div>
            <h2 className="text-white font-bold text-lg">¡Postulación enviada!</h2>
            <p className="text-slate-400 text-sm mt-1">
              {ctx.orgName} recibió tus datos. Si tu perfil encaja, te contactarán.
            </p>
            <p className="text-slate-500 text-xs mt-4">Ya puedes cerrar esta ventana.</p>
          </div>
        </Card>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="text-center mb-4">
        <h1 className="text-xl font-bold text-white">{ctx.orgName}</h1>
        <p className="text-emerald-400 text-sm">Formulario de postulación</p>
      </div>

      <Card>
        <div className="space-y-4">
          {/* Nombre / Apellido */}
          <div className="grid grid-cols-2 gap-2">
            <Field label="Nombre">
              <Text value={form.firstName} onChange={(v) => set('firstName', v)} placeholder="Juan" />
            </Field>
            <Field label="Apellido">
              <Text value={form.lastName} onChange={(v) => set('lastName', v)} placeholder="Pérez" />
            </Field>
          </div>

          <Field label="Número de teléfono">
            <Text value={form.phone} onChange={(v) => set('phone', v)} placeholder="Ej: 78590523" type="tel" />
          </Field>

          <div className="grid grid-cols-2 gap-2">
            <Field label="Carnet (CI)">
              <Text value={form.idCard} onChange={(v) => set('idCard', v)} placeholder="1234567" />
            </Field>
            <Field label="Edad">
              <Text value={form.age} onChange={(v) => set('age', v.replace(/\D/g, ''))} placeholder="22" type="tel" />
            </Field>
          </div>

          <Field label="Sexo">
            <Choice
              value={form.sex}
              onChange={(v) => set('sex', v as Sex)}
              options={[['male', '👨 Masculino'], ['female', '👩 Femenino']]}
            />
          </Field>

          <Field label="¿Tiene disponibilidad de tiempo completo?">
            <YesNo value={form.fullTimeAvailability} onChange={(v) => set('fullTimeAvailability', v)} />
          </Field>

          <Field label="Turno preferido">
            <Choice
              value={form.shift}
              onChange={(v) => set('shift', v as Shift)}
              options={[['morning', '🌅 Mañana'], ['night', '🌙 Noche']]}
            />
          </Field>

          <Field label="¿Disponible fines de semana y feriados?">
            <YesNo value={form.weekendAvailability} onChange={(v) => set('weekendAvailability', v)} />
          </Field>

          <Field label="¿Trabajó antes en una hamburguesería o pollería?">
            <YesNo value={form.workedInSimilar} onChange={(v) => set('workedInSimilar', v)} />
          </Field>

          <Field label="¿Dónde trabajó antes? (opcional)">
            <Text value={form.previousWorkplace} onChange={(v) => set('previousWorkplace', v)} placeholder="Nombre del lugar" />
          </Field>

          <Field label="¿Cuánto tiempo en su anterior trabajo? (opcional)">
            <Text value={form.previousDuration} onChange={(v) => set('previousDuration', v)} placeholder="Ej: 1 año y medio" />
          </Field>

          <Field label="¿Desde cuándo puede empezar? (opcional)">
            <Text value={form.availableFrom} onChange={(v) => set('availableFrom', v)} placeholder="Ej: de inmediato / la próxima semana" />
          </Field>

          <Field label="¿Por dónde vive?">
            <textarea
              value={form.livesAt}
              onChange={(e) => set('livesAt', e.target.value)}
              placeholder="Zona, barrio, referencias..."
              rows={2}
              className="w-full bg-slate-700/60 border border-slate-600 rounded-xl px-4 py-2.5 text-white text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none"
            />
          </Field>

          <Field label="Pretensión salarial">
            <Text value={form.salaryExpectation} onChange={(v) => set('salaryExpectation', v)} placeholder="Ej: 2500 Bs." />
          </Field>

          {submitErr && <p className="text-red-400 text-xs">{submitErr}</p>}
        </div>
      </Card>

      <StickyBar>
        <span className="text-slate-400 text-xs">Revisa tus datos antes de enviar</span>
        <button
          onClick={submit}
          disabled={submitting || !isValid}
          className="bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-700 disabled:text-slate-500 text-white px-5 py-2 rounded-xl text-sm font-medium flex items-center gap-2"
        >
          {submitting && <Spinner small />}
          Enviar postulación
        </button>
      </StickyBar>
    </Shell>
  );
}

// ── UI helpers ────────────────────────────────────────────────────────────────
function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-900 text-white px-4 py-6">
      <div className="max-w-md mx-auto pb-24">{children}</div>
    </div>
  );
}
function Card({ children }: { children: React.ReactNode }) {
  return <div className="bg-slate-800 border border-slate-700/50 rounded-2xl p-5 mb-4">{children}</div>;
}
function Centered({ children }: { children: React.ReactNode }) {
  return <div className="flex items-center justify-center min-h-[60vh] text-slate-400 text-sm text-center px-6">{children}</div>;
}
function StickyBar({ children }: { children: React.ReactNode }) {
  return (
    <div className="fixed bottom-0 left-0 right-0 bg-slate-800 border-t border-slate-700 px-4 py-3">
      <div className="max-w-md mx-auto flex items-center justify-between gap-3">{children}</div>
    </div>
  );
}
function Spinner({ small }: { small?: boolean }) {
  const size = small ? 'w-3 h-3 border-2' : 'w-8 h-8 border-4';
  return <span className={`inline-block ${size} border-emerald-500 border-t-transparent rounded-full animate-spin`} />;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-white text-sm font-medium mb-1.5">{label}</label>
      {children}
    </div>
  );
}

function Text({ value, onChange, placeholder, type = 'text' }: {
  value: string; onChange: (v: string) => void; placeholder?: string; type?: string;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full bg-slate-700/60 border border-slate-600 rounded-xl px-4 py-2.5 text-white text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
    />
  );
}

function Choice({ value, onChange, options }: {
  value: string; onChange: (v: string) => void; options: [string, string][];
}) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {options.map(([key, label]) => {
        const selected = value === key;
        return (
          <button key={key} type="button" onClick={() => onChange(key)}
            className={`p-2.5 rounded-xl border text-center text-sm transition ${selected ? 'border-emerald-500 bg-emerald-600/15 text-white' : 'border-slate-600 bg-slate-700/40 text-slate-300'}`}>
            {label}
          </button>
        );
      })}
    </div>
  );
}

function YesNo({ value, onChange }: { value: boolean | null; onChange: (v: boolean) => void }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {([[true, 'Sí'], [false, 'No']] as const).map(([val, label]) => {
        const selected = value === val;
        return (
          <button key={label} type="button" onClick={() => onChange(val)}
            className={`p-2.5 rounded-xl border text-center text-sm transition ${selected ? 'border-emerald-500 bg-emerald-600/15 text-white' : 'border-slate-600 bg-slate-700/40 text-slate-300'}`}>
            {label}
          </button>
        );
      })}
    </div>
  );
}
