import { useState, type FormEvent } from 'react';
import { ApiError, type Client, type TestClientInput } from '../api';
import { useWorkspaceApi } from '../agents/ApiContext';
import { useT } from '../i18n';
import { SettingsGroup } from './SettingsUI';

interface Props {
  onCreated: (client: Client) => void;
}

interface AnswerRow {
  question: string;
  answer: string;
}

/** The last concluded tax year — the year a declaration filed now most likely refers to. */
function defaultTaxYear(): number {
  return new Date().getFullYear() - 1;
}

/**
 * The admin-only test tab's form (openspec `admin-test-client`): the identity
 * the monday kickoff reads from the CRM card and the questionnaire item,
 * typed by hand. Posts to the agent's `/clients/test` (view-as only).
 */
export function TestClientForm({ onCreated }: Props) {
  const { t } = useT();
  const api = useWorkspaceApi();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [taxYear, setTaxYear] = useState(String(defaultTaxYear()));
  const [idNumber, setIdNumber] = useState('');
  const [fileNumber, setFileNumber] = useState('');
  const [maritalStatus, setMaritalStatus] = useState<'' | 'married' | 'not_married'>('');
  const [spouseName, setSpouseName] = useState('');
  const [spouseIdNumber, setSpouseIdNumber] = useState('');
  const [answers, setAnswers] = useState<AnswerRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const setAnswer = (index: number, patch: Partial<AnswerRow>) =>
    setAnswers(answers.map((row, i) => (i === index ? { ...row, ...patch } : row)));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const year = /^\d{4}$/.test(taxYear.trim()) ? Number(taxYear.trim()) : null;
    if (year === null) {
      setError(t.testClientInvalidYear);
      return;
    }
    if (!phone.trim()) {
      setError(t.testClientPhoneRequired);
      return;
    }
    const body: TestClientInput = {
      name: name.trim(),
      phone: phone.trim(),
      taxYear: year,
      idNumber: idNumber.trim() || null,
      fileNumber: fileNumber.trim() || null,
      maritalStatus: maritalStatus || null,
      spouseName: spouseName.trim() || null,
      spouseIdNumber: spouseIdNumber.trim() || null,
      formAnswers: answers.filter((row) => row.question.trim() !== '').map((row) => ({ question: row.question.trim(), answer: row.answer })),
    };
    setBusy(true);
    setError(null);
    try {
      const { client } = await api.createTestClient(body);
      onCreated(client);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t.testClientCreateFailed);
      setBusy(false);
    }
  };

  return (
    <form className="test-client-form" onSubmit={submit}>
      <p className="muted test-client-lead">{t.testClientLead}</p>

      <SettingsGroup title={t.testClientGroupIdentity}>
        <div className="test-client-fields">
          <label className="field">
            <span>{t.nameLabel}</span>
            <input value={name} onChange={(e) => setName(e.target.value)} required />
          </label>
          <label className="field">
            <span>{t.phoneLabel}</span>
            <input dir="ltr" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder={t.waPhonePlaceholder} required />
          </label>
          <label className="field">
            <span>{t.taxYearLabel}</span>
            <input dir="ltr" inputMode="numeric" value={taxYear} onChange={(e) => setTaxYear(e.target.value)} required />
          </label>
          <label className="field">
            <span>{t.idNumberLabel}</span>
            <input dir="ltr" inputMode="numeric" value={idNumber} onChange={(e) => setIdNumber(e.target.value)} />
          </label>
          <label className="field">
            <span>{t.fileNumberLabel}</span>
            <input dir="ltr" value={fileNumber} onChange={(e) => setFileNumber(e.target.value)} />
          </label>
        </div>
      </SettingsGroup>

      <SettingsGroup title={t.testClientGroupHousehold}>
        <div className="test-client-fields">
          <label className="field">
            <span>{t.maritalStatusLabel}</span>
            <select value={maritalStatus} onChange={(e) => setMaritalStatus(e.target.value as '' | 'married' | 'not_married')}>
              <option value="">{t.maritalStatusUnknown}</option>
              <option value="married">{t.maritalStatusMarried}</option>
              <option value="not_married">{t.maritalStatusNotMarried}</option>
            </select>
          </label>
          <label className="field">
            <span>{t.spouseNameLabel}</span>
            <input value={spouseName} onChange={(e) => setSpouseName(e.target.value)} />
          </label>
          <label className="field">
            <span>{t.spouseIdLabel}</span>
            <input dir="ltr" inputMode="numeric" value={spouseIdNumber} onChange={(e) => setSpouseIdNumber(e.target.value)} />
          </label>
        </div>
      </SettingsGroup>

      <SettingsGroup title={t.testClientGroupForm}>
        <p className="muted">{t.testClientFormHint}</p>
        {answers.length > 0 && (
          <ul className="test-client-answers">
            {answers.map((row, i) => (
              <li key={i} className="test-client-answer">
                <input
                  value={row.question}
                  onChange={(e) => setAnswer(i, { question: e.target.value })}
                  placeholder={t.formQuestionPlaceholder}
                  aria-label={t.formQuestionPlaceholder}
                />
                <input
                  value={row.answer}
                  onChange={(e) => setAnswer(i, { answer: e.target.value })}
                  placeholder={t.formAnswerPlaceholder}
                  aria-label={t.formAnswerPlaceholder}
                />
                <button
                  type="button"
                  className="chip-x"
                  title={t.removeFormAnswer}
                  onClick={() => setAnswers(answers.filter((_, j) => j !== i))}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="btn-row">
          <button
            type="button"
            className="btn btn-ghost"
            disabled={answers.length >= 40}
            onClick={() => setAnswers([...answers, { question: '', answer: '' }])}
          >
            {t.addFormAnswer}
          </button>
        </div>
      </SettingsGroup>

      {error && <div className="error-banner">{error}</div>}
      <div className="btn-row">
        <button className="btn btn-primary" type="submit" disabled={busy}>
          {busy ? t.creating : t.createTestClient}
        </button>
      </div>
    </form>
  );
}
