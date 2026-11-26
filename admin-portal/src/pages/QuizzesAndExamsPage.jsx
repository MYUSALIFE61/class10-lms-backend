import React, { useEffect, useState } from 'react';
import { Plus, CheckCircle2, Eye } from 'lucide-react';
import { AdminLayout } from '../components/AdminLayout.jsx';
import { adminApi } from '../services/adminApi.js';

export function QuizzesPage() {
  const [quizzes, setQuizzes] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [chapters, setChapters] = useState([]);
  const [questions, setQuestions] = useState([]);
  const [msg, setMsg] = useState('');

  const [form, setForm] = useState({
    title: '',
    description: '',
    quizType: 'chapter_test',
    subjectId: '',
    chapterId: '',
    randomCount: 10,
    durationMinutes: 15,
    passingMarks: 4,
    attemptsAllowed: 3,
    shuffleQuestions: true,
    negativeMarking: false,
    boardCodes: ['AP', 'TS'],
    status: 'published',
  });

  const load = async () => {
    const [qRes, sRes, cRes, qbRes] = await Promise.all([
      adminApi.listQuizzes(),
      adminApi.listSubjects(),
      adminApi.listChapters(),
      adminApi.listQuestions(),
    ]);
    setQuizzes(qRes.items || []);
    setSubjects(sRes.items || []);
    setChapters(cRes.items || []);
    setQuestions(qbRes.items || []);
  };

  useEffect(() => {
    load();
  }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    const pool = questions.filter(
      (q) =>
        (!form.subjectId || q.subject_id === form.subjectId) &&
        (!form.chapterId || q.chapter_id === form.chapterId)
    );
    const chosenIds = pool.slice(0, Number(form.randomCount || 10)).map((q) => q.id);
    await adminApi.createQuiz({
      ...form,
      questionIds: chosenIds,
      totalMarks: chosenIds.length || Number(form.randomCount),
    });
    setForm((f) => ({ ...f, title: '', description: '' }));
    setMsg(`Quiz created with ${chosenIds.length} questions from Question Bank.`);
    load();
  };

  return (
    <AdminLayout
      title="Practice & Quiz Management"
      subtitle="Build server-timed chapter, subject, weekly & model quizzes directly from your Question Bank."
    >
      {msg && <div className="mb-4 rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-2.5 text-xs font-semibold text-emerald-700">{msg}</div>}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        <form onSubmit={handleCreate} className="card-panel p-5 space-y-3 h-fit">
          <h3 className="text-sm font-bold">Create Timed Quiz</h3>
          <div>
            <label className="field-label">Quiz Title</label>
            <input className="field-input" required placeholder="e.g. Ch 1 Real Numbers 15-Min Quiz" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="field-label">Quiz Type</label>
              <select className="field-input" value={form.quizType} onChange={(e) => setForm({ ...form, quizType: e.target.value })}>
                <option value="chapter_test">Chapter Test</option>
                <option value="topic_practice">Topic Practice</option>
                <option value="subject_test">Subject Test</option>
                <option value="weekly_test">Weekly Test</option>
                <option value="monthly_test">Monthly Test</option>
                <option value="model_test">Model Test</option>
              </select>
            </div>
            <div>
              <label className="field-label">Subject</label>
              <select className="field-input" value={form.subjectId} onChange={(e) => setForm({ ...form, subjectId: e.target.value, chapterId: '' })}>
                <option value="">All Subjects</option>
                {subjects.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="field-label">Questions</label>
              <input type="number" className="field-input" value={form.randomCount} onChange={(e) => setForm({ ...form, randomCount: Number(e.target.value) })} />
            </div>
            <div>
              <label className="field-label">Timer (min)</label>
              <input type="number" className="field-input" value={form.durationMinutes} onChange={(e) => setForm({ ...form, durationMinutes: Number(e.target.value) })} />
            </div>
            <div>
              <label className="field-label">Attempts</label>
              <input type="number" className="field-input" value={form.attemptsAllowed} onChange={(e) => setForm({ ...form, attemptsAllowed: Number(e.target.value) })} />
            </div>
          </div>
          <div className="flex gap-4 text-xs font-semibold">
            <label className="flex items-center gap-1.5">
              <input type="checkbox" checked={form.shuffleQuestions} onChange={(e) => setForm({ ...form, shuffleQuestions: e.target.checked })} /> Shuffle
            </label>
            <label className="flex items-center gap-1.5">
              <input type="checkbox" checked={form.negativeMarking} onChange={(e) => setForm({ ...form, negativeMarking: e.target.checked })} /> Negative Marking
            </label>
          </div>
          <button type="submit" className="btn-primary w-full"><Plus className="w-4 h-4" /> Create &amp; Publish Quiz</button>
        </form>

        <div className="xl:col-span-2 card-panel p-5 space-y-3">
          <h3 className="text-sm font-bold">Configured Quizzes ({quizzes.length})</h3>
          {quizzes.map((q) => (
            <div key={q.id} className="flex flex-wrap items-center justify-between gap-3 p-4 rounded-xl border border-slate-200/80">
              <div>
                <div className="font-bold text-sm">{q.title}</div>
                <div className="text-xs text-slate-500">
                  {(q.question_ids || []).length} Questions • {q.duration_minutes} mins (server-enforced) • Pass: {q.passing_marks}/{q.total_marks}
                </div>
              </div>
              <button
                type="button"
                onClick={async () => {
                  await adminApi.updateQuiz(q.id, { status: q.status === 'published' ? 'draft' : 'published' });
                  load();
                }}
                className={`px-3 py-1 rounded-full text-xs font-bold ${q.status === 'published' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-800'}`}
              >
                {q.status}
              </button>
            </div>
          ))}
        </div>
      </div>
    </AdminLayout>
  );
}

export function ExamsPage() {
  const [exams, setExams] = useState([]);
  const [questions, setQuestions] = useState([]);
  const [selectedExam, setSelectedExam] = useState(null);
  const [attempts, setAttempts] = useState([]);
  const [msg, setMsg] = useState('');

  const [form, setForm] = useState({
    name: '',
    examType: 'monthly',
    examDate: new Date(Date.now() + 3 * 86400 * 1000).toISOString().slice(0, 16),
    durationMinutes: 60,
    totalMarks: 50,
    boardCodes: ['AP', 'TS'],
    instructions: 'Answer all questions honestly within the exam window.',
    status: 'published',
  });

  const load = async () => {
    const [eRes, qRes] = await Promise.all([adminApi.listExams(), adminApi.listQuestions()]);
    setExams(eRes.items || []);
    setQuestions(qRes.items || []);
  };

  useEffect(() => {
    load();
  }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    await adminApi.createExam({
      ...form,
      examDate: new Date(form.examDate).toISOString(),
      questionIds: questions.slice(0, 10).map((q) => q.id),
    });
    setForm((f) => ({ ...f, name: '' }));
    setMsg('Exam scheduled & synced to student Upcoming Exams.');
    load();
  };

  const openAttempts = async (exam) => {
    setSelectedExam(exam);
    const res = await adminApi.listExamAttempts(exam.id);
    setAttempts(res.items || []);
  };

  return (
    <AdminLayout
      title="Examination Management"
      subtitle="Schedule monthly, mock & full-length board exams, monitor student submissions, evaluate descriptive answers, and publish results."
    >
      {msg && <div className="mb-4 rounded-xl bg-blue-50 border border-blue-200 px-4 py-2.5 text-xs font-semibold text-[#155EEF]">{msg}</div>}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        <form onSubmit={handleCreate} className="card-panel p-5 space-y-3 h-fit">
          <h3 className="text-sm font-bold">Schedule Examination</h3>
          <div>
            <label className="field-label">Exam Name</label>
            <input className="field-input" required placeholder="e.g. Pre-Final SSC Model Exam" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="field-label">Type</label>
              <select className="field-input" value={form.examType} onChange={(e) => setForm({ ...form, examType: e.target.value })}>
                <option value="monthly">Monthly Exam</option>
                <option value="mock">Mock Exam</option>
                <option value="full_model">Full-Length Model</option>
                <option value="board_practice">Board Practice</option>
              </select>
            </div>
            <div>
              <label className="field-label">Duration (min)</label>
              <input type="number" className="field-input" value={form.durationMinutes} onChange={(e) => setForm({ ...form, durationMinutes: Number(e.target.value) })} />
            </div>
          </div>
          <div>
            <label className="field-label">Exam Date &amp; Start Time</label>
            <input type="datetime-local" className="field-input" value={form.examDate} onChange={(e) => setForm({ ...form, examDate: e.target.value })} />
          </div>
          <div>
            <label className="field-label">Instructions</label>
            <textarea className="field-input" rows={2} value={form.instructions} onChange={(e) => setForm({ ...form, instructions: e.target.value })} />
          </div>
          <button type="submit" className="btn-primary w-full"><Plus className="w-4 h-4" /> Schedule &amp; Publish Exam</button>
        </form>

        <div className="xl:col-span-2 space-y-4">
          <div className="card-panel p-5 space-y-3">
            <h3 className="text-sm font-bold">Scheduled Examinations ({exams.length})</h3>
            {exams.map((ex) => (
              <div key={ex.id} className="flex flex-wrap items-center justify-between gap-3 p-4 rounded-xl border border-slate-200/80">
                <div>
                  <div className="font-bold text-sm">{ex.name}</div>
                  <div className="text-xs text-slate-500">
                    {new Date(ex.exam_date).toLocaleString('en-IN')} • {ex.duration_minutes} mins • {ex.total_marks} Marks
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button type="button" onClick={() => openAttempts(ex)} className="btn-secondary text-xs py-1.5 px-3">
                    <Eye className="w-3.5 h-3.5" /> Submissions
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      await adminApi.updateExam(ex.id, { resultsPublished: !ex.results_published });
                      setMsg('Exam result visibility toggled.');
                      load();
                    }}
                    className="btn-primary text-xs py-1.5 px-3"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" /> {ex.results_published ? 'Results Live' : 'Publish Results'}
                  </button>
                </div>
              </div>
            ))}
          </div>

          {selectedExam && (
            <div className="card-panel p-5">
              <h3 className="text-sm font-bold mb-3">Student Submissions — {selectedExam.name}</h3>
              {attempts.length === 0 ? (
                <div className="text-xs text-slate-400">No students have submitted this exam yet.</div>
              ) : (
                <div className="space-y-2.5">
                  {attempts.map((a) => (
                    <div key={a.id} className="flex items-center justify-between p-3 rounded-xl bg-slate-50 text-xs">
                      <div>
                        <div className="font-bold">{a.studentName} ({a.studentCode})</div>
                        <div className="text-slate-500">Objective: {a.objective_score} | Descriptive: {a.descriptive_score} | Total: {a.total_score}/{a.total_marks}</div>
                      </div>
                      <button
                        type="button"
                        onClick={async () => {
                          const score = window.prompt('Enter descriptive marks to award:', String(a.descriptive_score || 0));
                          if (score === null) return;
                          await adminApi.evaluateExamAttempt(a.id, { descriptiveScore: Number(score) });
                          openAttempts(selectedExam);
                        }}
                        className="btn-secondary text-xs py-1 px-2.5"
                      >
                        Grade Descriptive
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}
