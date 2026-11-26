import React, { useEffect, useState } from 'react';
import { Plus, Upload, Download } from 'lucide-react';
import { AdminLayout } from '../components/AdminLayout.jsx';
import { adminApi, getAdminToken } from '../services/adminApi.js';

const QUESTION_TYPES = [
  ['mcq', 'Multiple Choice (MCQ)'],
  ['true_false', 'True or False'],
  ['fill_blank', 'Fill in the Blanks'],
  ['match', 'Match the Following'],
  ['short_answer', 'Short Answer'],
  ['long_answer', 'Long Answer'],
  ['numerical', 'Numerical Problem'],
  ['diagram', 'Diagram-Based'],
  ['assertion_reason', 'Assertion & Reason'],
  ['previous_board', 'Previous Board Question'],
];

function parseSimpleCsv(csvText) {
  const lines = csvText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) return [];
  const rows = [];
  for (let i = 1; i < lines.length; i += 1) {
    const cols = lines[i].split(',').map((c) => c.trim().replace(/^"|"$/g, ''));
    if (cols.length < 6) continue;
    rows.push({
      questionType: 'mcq',
      questionText: cols[0],
      options: [cols[1], cols[2], cols[3], cols[4]].filter(Boolean),
      correctOptionIndex: Number(cols[5] || 0),
      explanation: cols[6] || '',
      difficulty: cols[7] || 'medium',
      marks: Number(cols[8] || 1),
    });
  }
  return rows;
}

export function QuestionBankPage() {
  const [questions, setQuestions] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [chapters, setChapters] = useState([]);
  const [filters, setFilters] = useState({ subjectId: '', difficulty: '', questionType: '', search: '' });
  const [bulkText, setBulkText] = useState('');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const [form, setForm] = useState({
    subjectId: '',
    chapterId: '',
    questionType: 'mcq',
    difficulty: 'medium',
    questionText: '',
    optA: '',
    optB: '',
    optC: '',
    optD: '',
    correctOptionIndex: 0,
    explanation: '',
    marks: 1,
    negativeMarks: 0,
    boardCodes: ['AP', 'TS'],
  });

  const load = async () => {
    const [qRes, sRes, cRes] = await Promise.all([
      adminApi.listQuestions(filters),
      adminApi.listSubjects(),
      adminApi.listChapters(),
    ]);
    setQuestions(qRes.items || []);
    const subs = sRes.items || [];
    setSubjects(subs);
    setChapters(cRes.items || []);
    if (!form.subjectId && subs[0]) setForm((f) => ({ ...f, subjectId: subs[0].id }));
  };

  useEffect(() => {
    load();
  }, [filters.subjectId, filters.difficulty, filters.questionType]);

  const handleCreate = async (e) => {
    e.preventDefault();
    setErr('');
    setMsg('');
    try {
      await adminApi.createQuestion({
        subjectId: form.subjectId,
        chapterId: form.chapterId || null,
        questionType: form.questionType,
        difficulty: form.difficulty,
        questionText: form.questionText,
        options: [form.optA, form.optB, form.optC, form.optD].filter((x) => x.trim()),
        correctOptionIndex: Number(form.correctOptionIndex),
        explanation: form.explanation,
        marks: Number(form.marks),
        negativeMarks: Number(form.negativeMarks),
        boardCodes: form.boardCodes,
        status: 'published',
      });
      setForm((f) => ({ ...f, questionText: '', optA: '', optB: '', optC: '', optD: '', explanation: '' }));
      setMsg('Question validated and saved to Question Bank.');
      load();
    } catch (e2) {
      setErr(e2.message);
    }
  };

  const handleBulkImport = async () => {
    setErr('');
    setMsg('');
    const rows = parseSimpleCsv(bulkText);
    if (!rows.length) {
      setErr('Paste CSV rows with header: question,optA,optB,optC,optD,correctIdx,explanation,difficulty,marks');
      return;
    }
    const res = await adminApi.bulkImportQuestions({
      subjectId: form.subjectId,
      chapterId: form.chapterId || null,
      rows,
    });
    setBulkText('');
    setMsg(`Bulk import complete: ${res.importedCount} imported, ${res.skippedCount} skipped/duplicates.`);
    load();
  };

  const handleExport = async () => {
    const url = adminApi.getQuestionsExportUrl({ subjectId: filters.subjectId });
    const res = await fetch(url, { headers: { Authorization: `Bearer ${getAdminToken()}` } });
    const blob = await res.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'class10-question-bank.csv';
    a.click();
  };

  return (
    <AdminLayout
      title="Question Bank — MCQs & Board Questions"
      subtitle="Create validated questions across 10 categories, prevent duplicates, and bulk import/export CSV/Excel sheets."
      actions={
        <button type="button" onClick={handleExport} className="btn-secondary">
          <Download className="w-4 h-4" /> Export CSV
        </button>
      }
    >
      {msg && <div className="mb-4 rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-2.5 text-xs font-semibold text-emerald-700">{msg}</div>}
      {err && <div className="mb-4 rounded-xl bg-red-50 border border-red-200 px-4 py-2.5 text-xs font-semibold text-red-700">{err}</div>}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        <div className="space-y-5">
          <form onSubmit={handleCreate} className="card-panel p-5 space-y-3">
            <h3 className="text-sm font-bold">Add Question</h3>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="field-label">Subject</label>
                <select className="field-input" value={form.subjectId} onChange={(e) => setForm({ ...form, subjectId: e.target.value, chapterId: '' })}>
                  {subjects.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
                </select>
              </div>
              <div>
                <label className="field-label">Chapter</label>
                <select className="field-input" value={form.chapterId} onChange={(e) => setForm({ ...form, chapterId: e.target.value })}>
                  <option value="">General</option>
                  {chapters.filter((c) => c.subject_id === form.subjectId).map((c) => (
                    <option key={c.id} value={c.id}>Ch {c.chapter_number}: {c.title}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="field-label">Category</label>
                <select className="field-input" value={form.questionType} onChange={(e) => setForm({ ...form, questionType: e.target.value })}>
                  {QUESTION_TYPES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                </select>
              </div>
              <div>
                <label className="field-label">Difficulty</label>
                <select className="field-input" value={form.difficulty} onChange={(e) => setForm({ ...form, difficulty: e.target.value })}>
                  <option value="easy">Easy</option>
                  <option value="medium">Medium</option>
                  <option value="hard">Hard</option>
                </select>
              </div>
            </div>
            <div>
              <label className="field-label">Question Text</label>
              <textarea className="field-input" required rows={2} value={form.questionText} onChange={(e) => setForm({ ...form, questionText: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <input className="field-input" placeholder="Option A" value={form.optA} onChange={(e) => setForm({ ...form, optA: e.target.value })} />
              <input className="field-input" placeholder="Option B" value={form.optB} onChange={(e) => setForm({ ...form, optB: e.target.value })} />
              <input className="field-input" placeholder="Option C" value={form.optC} onChange={(e) => setForm({ ...form, optC: e.target.value })} />
              <input className="field-input" placeholder="Option D" value={form.optD} onChange={(e) => setForm({ ...form, optD: e.target.value })} />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="field-label">Correct</label>
                <select className="field-input" value={form.correctOptionIndex} onChange={(e) => setForm({ ...form, correctOptionIndex: Number(e.target.value) })}>
                  <option value={0}>Option A</option>
                  <option value={1}>Option B</option>
                  <option value={2}>Option C</option>
                  <option value={3}>Option D</option>
                </select>
              </div>
              <div>
                <label className="field-label">Marks</label>
                <input type="number" className="field-input" value={form.marks} onChange={(e) => setForm({ ...form, marks: e.target.value })} />
              </div>
              <div>
                <label className="field-label">Neg. Marks</label>
                <input type="number" step="0.25" className="field-input" value={form.negativeMarks} onChange={(e) => setForm({ ...form, negativeMarks: e.target.value })} />
              </div>
            </div>
            <div>
              <label className="field-label">Answer Explanation</label>
              <input className="field-input" value={form.explanation} onChange={(e) => setForm({ ...form, explanation: e.target.value })} />
            </div>
            <button type="submit" className="btn-primary w-full"><Plus className="w-4 h-4" /> Save Question</button>
          </form>

          {/* Bulk CSV / Excel Paste Import */}
          <div className="card-panel p-5 space-y-2.5">
            <h3 className="text-sm font-bold flex items-center gap-1.5">
              <Upload className="w-4 h-4 text-[#155EEF]" /> Bulk Import MCQs (CSV / Excel)
            </h3>
            <p className="text-[11px] text-slate-500">
              Format: <code>question,optA,optB,optC,optD,correctIdx,explanation,difficulty,marks</code>
            </p>
            <textarea
              className="field-input font-mono text-xs"
              rows={4}
              placeholder={'question,optA,optB,optC,optD,correctIdx,explanation,difficulty,marks\nWhat is HCF(12,18)?,6,3,9,12,0,6 divides both 12 and 18,easy,1'}
              value={bulkText}
              onChange={(e) => setBulkText(e.target.value)}
            />
            <button type="button" onClick={handleBulkImport} className="btn-secondary w-full text-xs">
              Validate &amp; Bulk Import
            </button>
          </div>
        </div>

        <div className="xl:col-span-2 card-panel p-5">
          <div className="flex flex-wrap gap-2 justify-between mb-4">
            <h3 className="text-sm font-bold">Questions ({questions.length})</h3>
            <div className="flex gap-2">
              <select className="field-input w-40" value={filters.subjectId} onChange={(e) => setFilters({ ...filters, subjectId: e.target.value })}>
                <option value="">All Subjects</option>
                {subjects.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
              </select>
              <select className="field-input w-32" value={filters.difficulty} onChange={(e) => setFilters({ ...filters, difficulty: e.target.value })}>
                <option value="">Difficulty</option>
                <option value="easy">Easy</option>
                <option value="medium">Medium</option>
                <option value="hard">Hard</option>
              </select>
            </div>
          </div>

          <div className="space-y-3 max-h-[740px] overflow-y-auto pr-1">
            {questions.map((q, idx) => (
              <div key={q.id} className="p-3.5 rounded-xl border border-slate-200/80">
                <div className="flex justify-between items-start gap-2">
                  <div className="font-bold text-sm">{idx + 1}. {q.question_text}</div>
                  <span className="px-2 py-0.5 rounded-full bg-blue-50 text-[#155EEF] text-[10px] font-bold shrink-0">
                    {q.question_type} • {q.difficulty} • {q.marks}m
                  </span>
                </div>
                {Array.isArray(q.options_json) && q.options_json.length > 0 && (
                  <div className="grid grid-cols-2 gap-1.5 mt-2 text-xs">
                    {q.options_json.map((opt, oi) => (
                      <div
                        key={oi}
                        className={`px-2.5 py-1 rounded-lg ${
                          oi === q.correct_option_index
                            ? 'bg-emerald-50 border border-emerald-200 text-emerald-800 font-bold'
                            : 'bg-slate-50 text-slate-600'
                        }`}
                      >
                        {String.fromCharCode(65 + oi)}. {opt}
                      </div>
                    ))}
                  </div>
                )}
                {q.explanation && <div className="text-[11px] text-slate-500 mt-1.5">Explanation: {q.explanation}</div>}
              </div>
            ))}
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
