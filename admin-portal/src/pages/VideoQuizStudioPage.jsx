import React, { useEffect, useState } from 'react';
import { Sparkles, Check, X, Plus, Gamepad2, BarChart3, Clock, Trophy } from 'lucide-react';
import { AdminLayout } from '../components/AdminLayout.jsx';
import { adminApi } from '../services/adminApi.js';

const ROUNDS = [
  { key: 'quick_challenge', label: '1. Quick Challenge (Easy)' },
  { key: 'brain_battle', label: '2. Brain Battle (Conceptual)' },
  { key: 'master_challenge', label: '3. Master Challenge (Application)' },
  { key: 'victory_round', label: '4. Victory Round (Bonus)' },
];

export function VideoQuizStudioPage() {
  const [tab, setTab] = useState('transcript'); // transcript | manual | quizzes | analytics
  const [subjects, setSubjects] = useState([]);
  const [lessons, setLessons] = useState([]);
  const [selectedSubjectId, setSelectedSubjectId] = useState('');
  const [selectedLessonId, setSelectedLessonId] = useState('');
  const [lessonQuestions, setLessonQuestions] = useState([]);
  const [videoQuizzes, setVideoQuizzes] = useState([]);
  const [analytics, setAnalytics] = useState(null);

  const [transcriptText, setTranscriptText] = useState('');
  const [aiCount, setAiCount] = useState(6);
  const [generating, setGenerating] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const [manualForm, setManualForm] = useState({
    roundType: 'quick_challenge',
    difficulty: 'easy',
    conceptTag: '',
    questionText: '',
    optA: '',
    optB: '',
    optC: '',
    optD: '',
    correctOptionIndex: 0,
    explanation: '',
    referenceNote: '',
  });

  const [quizForm, setQuizForm] = useState({
    title: '',
    description: '',
    durationMinutes: 10,
    timerEnabled: true,
    allowSkip: true,
    allowReview: true,
    leaderboardEnabled: true,
    xpPerCorrect: 20,
    streakBonusXp: 10,
    understandingBonusXp: 25,
    victoryBonusXp: 50,
    status: 'published',
    scheduledPublishAt: '',
  });

  const loadBase = async () => {
    const [sRes, lRes, qzRes, anRes] = await Promise.all([
      adminApi.listSubjects(),
      adminApi.listLessons(),
      adminApi.listVideoQuizzes(),
      adminApi.getVideoQuizAnalytics(),
    ]);
    const subs = sRes.items || [];
    const ls = lRes.items || [];
    setSubjects(subs);
    setLessons(ls);
    setVideoQuizzes(qzRes.items || []);
    setAnalytics(anRes);

    if (!selectedLessonId && ls[0]) {
      setSelectedLessonId(ls[0].id);
      setSelectedSubjectId(ls[0].subject_id || '');
      setTranscriptText(ls[0].transcript_text || '');
      setQuizForm((f) => ({ ...f, title: `${ls[0].title} — 4-Round Video Challenge` }));
    }
  };

  const loadQuestionsForLesson = async (lid) => {
    if (!lid) return;
    const res = await adminApi.listLessonVideoQuestions(lid);
    setLessonQuestions(res.items || []);
  };

  useEffect(() => {
    loadBase();
  }, []);

  useEffect(() => {
    if (!selectedLessonId) return;
    const lesson = lessons.find((l) => l.id === selectedLessonId);
    if (lesson) {
      setTranscriptText(lesson.transcript_text || '');
      setQuizForm((f) => ({ ...f, title: `${lesson.title} — 4-Round Video Challenge` }));
    }
    loadQuestionsForLesson(selectedLessonId);
  }, [selectedLessonId]);

  const handleGenerateAi = async () => {
    setErr('');
    setMsg('');
    setGenerating(true);
    try {
      const res = await adminApi.generateAiVideoQuestions({
        lessonId: selectedLessonId,
        transcriptText,
        count: Number(aiCount),
      });
      setMsg(`Generated ${res.generatedCount} transcript-grounded draft MCQs. Review & Approve them below before publishing!`);
      await loadQuestionsForLesson(selectedLessonId);
      await loadBase();
    } catch (e) {
      setErr(e.message);
    } finally {
      setGenerating(false);
    }
  };

  const handleReview = async (questionId, decision) => {
    await adminApi.reviewAiVideoQuestion(questionId, decision);
    setMsg(`Question ${decision}.`);
    await loadQuestionsForLesson(selectedLessonId);
  };

  const handleCreateManual = async (e) => {
    e.preventDefault();
    setErr('');
    setMsg('');
    try {
      await adminApi.createManualVideoQuestion(selectedLessonId, {
        ...manualForm,
        options: [manualForm.optA, manualForm.optB, manualForm.optC, manualForm.optD],
      });
      setManualForm((f) => ({ ...f, questionText: '', optA: '', optB: '', optC: '', optD: '', explanation: '', referenceNote: '' }));
      setMsg('Manual 4-option video MCQ saved & approved.');
      await loadQuestionsForLesson(selectedLessonId);
    } catch (e2) {
      setErr(e2.message);
    }
  };

  const handlePublishQuiz = async (e) => {
    e.preventDefault();
    setErr('');
    setMsg('');
    try {
      const approvedIds = lessonQuestions
        .filter((q) => (q.ai_approval_status || 'approved') === 'approved' && q.status === 'published')
        .map((q) => q.id);
      await adminApi.createVideoQuiz({
        lessonId: selectedLessonId,
        questionIds: approvedIds,
        ...quizForm,
        scheduledPublishAt: quizForm.scheduledPublishAt || null,
      });
      setMsg(`Gamified Video Quiz saved (${approvedIds.length} approved questions, status: ${quizForm.status}).`);
      await loadBase();
    } catch (e2) {
      setErr(e2.message);
    }
  };

  const filteredLessons = selectedSubjectId
    ? lessons.filter((l) => l.subject_id === selectedSubjectId)
    : lessons;

  const approvedCount = lessonQuestions.filter(
    (q) => (q.ai_approval_status || 'approved') === 'approved' && q.status === 'published'
  ).length;
  const pendingCount = lessonQuestions.filter((q) => q.ai_approval_status === 'pending_review').length;

  return (
    <AdminLayout
      title="Gamified Video Quiz Studio"
      subtitle="Link 4-Round gamified MCQ challenges directly to individual video lessons, generate transcript-grounded AI MCQs, approve before publishing, and monitor concept accuracy."
    >
      {msg && <div className="mb-4 rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-2.5 text-xs font-semibold text-emerald-700">{msg}</div>}
      {err && <div className="mb-4 rounded-xl bg-red-50 border border-red-200 px-4 py-2.5 text-xs font-semibold text-red-700">{err}</div>}

      {/* Target Video Selector Bar */}
      <div className="card-panel p-4 mb-5 grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
        <div>
          <label className="field-label">Filter by Subject</label>
          <select
            className="field-input"
            value={selectedSubjectId}
            onChange={(e) => {
              const sid = e.target.value;
              setSelectedSubjectId(sid);
              const first = lessons.find((l) => !sid || l.subject_id === sid);
              if (first) setSelectedLessonId(first.id);
            }}
          >
            <option value="">All Class 10 Subjects</option>
            {subjects.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
          </select>
        </div>
        <div className="md:col-span-2">
          <label className="field-label">Select Video Lesson (Every Quiz Is Tied Strictly to One Video)</label>
          <select className="field-input" value={selectedLessonId} onChange={(e) => setSelectedLessonId(e.target.value)}>
            {filteredLessons.map((l) => (
              <option key={l.id} value={l.id}>
                {l.title} ({l.videoLanguage || 'TE_EN_MIX'})
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Studio Tabs */}
      <div className="flex flex-wrap gap-2 mb-5">
        {[
          ['transcript', `1. Transcript & AI Generator (${pendingCount} Pending)`],
          ['manual', `2. Manual Video MCQs (${approvedCount} Approved)`],
          ['quizzes', `3. Configure & Publish Quizzes (${videoQuizzes.length})`],
          ['analytics', '4. Attempts & Difficult Concepts Analytics'],
        ].map(([k, label]) => (
          <button
            key={k}
            type="button"
            onClick={() => setTab(k)}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition ${
              tab === k ? 'bg-[#155EEF] text-white shadow-sm' : 'bg-white text-slate-600 border border-slate-200'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* TAB 1: Transcript + AI Generator + Approval Queue */}
      {tab === 'transcript' && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
          <div className="card-panel p-5 space-y-3">
            <h3 className="text-sm font-bold flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-[#155EEF]" /> Video Lesson Transcript (TE_EN_MIX Concepts)
            </h3>
            <p className="text-xs text-slate-500">
              Paste the video transcript or concept summary taught in this exact video. AI generates 4-option MCQs across all 4 game rounds strictly grounded in this text — saved as <strong>Pending Review</strong> until you approve them.
            </p>
            <textarea
              className="field-input"
              rows={9}
              placeholder="Paste actual video transcript, formulas, and Telugu-English mixed lesson explanations here..."
              value={transcriptText}
              onChange={(e) => setTranscriptText(e.target.value)}
            />
            <div className="flex items-center gap-3">
              <div className="w-36">
                <label className="field-label">MCQ Count</label>
                <input type="number" min={1} max={20} className="field-input" value={aiCount} onChange={(e) => setAiCount(e.target.value)} />
              </div>
              <button
                type="button"
                disabled={generating || !selectedLessonId}
                onClick={handleGenerateAi}
                className="btn-primary flex-1 mt-4"
              >
                <Sparkles className="w-4 h-4" />
                {generating ? 'Generating Grounded MCQs...' : 'Generate AI MCQs from Transcript'}
              </button>
            </div>
          </div>

          <div className="card-panel p-5 space-y-3 max-h-[650px] overflow-y-auto">
            <h3 className="text-sm font-bold">Video Lesson Questions &amp; AI Approval Queue ({lessonQuestions.length})</h3>
            {lessonQuestions.length === 0 ? (
              <div className="text-xs text-slate-400 py-10 text-center">
                No questions for this video yet. Generate from transcript or add manually.
              </div>
            ) : (
              lessonQuestions.map((q) => (
                <div key={q.id} className="p-3.5 rounded-xl border border-slate-200/80 space-y-2">
                  <div className="flex justify-between items-start gap-2">
                    <div className="font-bold text-xs text-[#172554]">{q.question_text}</div>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold shrink-0 ${
                        q.ai_approval_status === 'pending_review'
                          ? 'bg-amber-100 text-amber-800'
                          : q.ai_approval_status === 'approved'
                            ? 'bg-emerald-100 text-emerald-700'
                            : 'bg-red-100 text-red-700'
                      }`}
                    >
                      {q.ai_approval_status || 'approved'}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-500">
                    Round: <strong>{q.round_type || 'quick_challenge'}</strong> • Concept: <strong>{q.concept_tag || 'General'}</strong> • Source: {q.source_origin || 'manual'}
                  </div>
                  <div className="grid grid-cols-2 gap-1.5 text-[11px]">
                    {(q.options_json || []).map((opt, idx) => (
                      <div
                        key={idx}
                        className={`px-2 py-1 rounded ${
                          idx === q.correct_option_index ? 'bg-emerald-50 text-emerald-800 font-bold border border-emerald-200' : 'bg-slate-50 text-slate-600'
                        }`}
                      >
                        {String.fromCharCode(65 + idx)}. {opt}
                      </div>
                    ))}
                  </div>
                  {q.transcript_excerpt && (
                    <div className="text-[11px] italic text-blue-700 bg-blue-50/70 rounded px-2 py-1">
                      Transcript source: &ldquo;{q.transcript_excerpt}&rdquo;
                    </div>
                  )}
                  {q.ai_approval_status === 'pending_review' && (
                    <div className="flex gap-2 pt-1">
                      <button type="button" onClick={() => handleReview(q.id, 'approved')} className="btn-primary text-xs py-1 px-3">
                        <Check className="w-3.5 h-3.5" /> Approve &amp; Publish
                      </button>
                      <button type="button" onClick={() => handleReview(q.id, 'rejected')} className="btn-danger text-xs py-1 px-3">
                        <X className="w-3.5 h-3.5" /> Reject
                      </button>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* TAB 2: Manual Video MCQ Creator */}
      {tab === 'manual' && (
        <form onSubmit={handleCreateManual} className="card-panel p-6 max-w-2xl space-y-3">
          <h3 className="text-sm font-bold">Add Manual Video-Linked MCQ</h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="field-label">Game Round</label>
              <select className="field-input" value={manualForm.roundType} onChange={(e) => setManualForm({ ...manualForm, roundType: e.target.value })}>
                {ROUNDS.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
              </select>
            </div>
            <div>
              <label className="field-label">Concept Tag (for Analytics)</label>
              <input className="field-input" required placeholder="e.g. Assumed Mean Formula" value={manualForm.conceptTag} onChange={(e) => setManualForm({ ...manualForm, conceptTag: e.target.value })} />
            </div>
          </div>
          <div>
            <label className="field-label">Question Text (Simple Student-Friendly Terminology)</label>
            <textarea className="field-input" required rows={2} value={manualForm.questionText} onChange={(e) => setManualForm({ ...manualForm, questionText: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input className="field-input" required placeholder="Option A" value={manualForm.optA} onChange={(e) => setManualForm({ ...manualForm, optA: e.target.value })} />
            <input className="field-input" required placeholder="Option B" value={manualForm.optB} onChange={(e) => setManualForm({ ...manualForm, optB: e.target.value })} />
            <input className="field-input" required placeholder="Option C" value={manualForm.optC} onChange={(e) => setManualForm({ ...manualForm, optC: e.target.value })} />
            <input className="field-input" required placeholder="Option D" value={manualForm.optD} onChange={(e) => setManualForm({ ...manualForm, optD: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="field-label">Correct Answer</label>
              <select className="field-input" value={manualForm.correctOptionIndex} onChange={(e) => setManualForm({ ...manualForm, correctOptionIndex: Number(e.target.value) })}>
                <option value={0}>Option A</option>
                <option value={1}>Option B</option>
                <option value={2}>Option C</option>
                <option value={3}>Option D</option>
              </select>
            </div>
            <div>
              <label className="field-label">Reference Material / Textbook Page</label>
              <input className="field-input" placeholder="e.g. AP/TS SSC Maths Ch 14 Ex 14.1" value={manualForm.referenceNote} onChange={(e) => setManualForm({ ...manualForm, referenceNote: e.target.value })} />
            </div>
          </div>
          <div>
            <label className="field-label">Immediate Explanation (Shown After Answering)</label>
            <textarea className="field-input" required rows={2} value={manualForm.explanation} onChange={(e) => setManualForm({ ...manualForm, explanation: e.target.value })} />
          </div>
          <button type="submit" className="btn-primary"><Plus className="w-4 h-4" /> Save Approved Video MCQ</button>
        </form>
      )}

      {/* TAB 3: Configure Rewards, Timer, Skip/Review & Publish Video Quiz */}
      {tab === 'quizzes' && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
          <form onSubmit={handlePublishQuiz} className="card-panel p-5 space-y-3">
            <h3 className="text-sm font-bold flex items-center gap-2">
              <Gamepad2 className="w-4 h-4 text-[#155EEF]" /> Publish Gamified Challenge for Selected Video
            </h3>
            <div className="text-xs bg-blue-50 text-[#155EEF] px-3 py-2 rounded-xl font-semibold">
              Approved questions ready for this video: <strong>{approvedCount}</strong> (unapproved AI drafts are strictly excluded).
            </div>
            <div>
              <label className="field-label">Challenge Title</label>
              <input className="field-input" required value={quizForm.title} onChange={(e) => setQuizForm({ ...quizForm, title: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="field-label">Timer Duration (Minutes)</label>
                <input type="number" className="field-input" value={quizForm.durationMinutes} onChange={(e) => setQuizForm({ ...quizForm, durationMinutes: Number(e.target.value) })} />
              </div>
              <div>
                <label className="field-label">Publish Status</label>
                <select className="field-input" value={quizForm.status} onChange={(e) => setQuizForm({ ...quizForm, status: e.target.value })}>
                  <option value="published">Published (Live Now)</option>
                  <option value="scheduled">Scheduled</option>
                  <option value="draft">Draft (Hidden)</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <div>
                <label className="field-label">XP / Correct</label>
                <input type="number" className="field-input" value={quizForm.xpPerCorrect} onChange={(e) => setQuizForm({ ...quizForm, xpPerCorrect: Number(e.target.value) })} />
              </div>
              <div>
                <label className="field-label">Streak Bonus</label>
                <input type="number" className="field-input" value={quizForm.streakBonusXp} onChange={(e) => setQuizForm({ ...quizForm, streakBonusXp: Number(e.target.value) })} />
              </div>
              <div>
                <label className="field-label">Mastery Bonus</label>
                <input type="number" className="field-input" value={quizForm.understandingBonusXp} onChange={(e) => setQuizForm({ ...quizForm, understandingBonusXp: Number(e.target.value) })} />
              </div>
              <div>
                <label className="field-label">Victory Bonus</label>
                <input type="number" className="field-input" value={quizForm.victoryBonusXp} onChange={(e) => setQuizForm({ ...quizForm, victoryBonusXp: Number(e.target.value) })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs font-semibold pt-1">
              <label className="flex items-center gap-2"><input type="checkbox" checked={quizForm.timerEnabled} onChange={(e) => setQuizForm({ ...quizForm, timerEnabled: e.target.checked })} /> Enable Countdown Timer</label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={quizForm.allowSkip} onChange={(e) => setQuizForm({ ...quizForm, allowSkip: e.target.checked })} /> Allow Skip</label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={quizForm.allowReview} onChange={(e) => setQuizForm({ ...quizForm, allowReview: e.target.checked })} /> Allow Review</label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={quizForm.leaderboardEnabled} onChange={(e) => setQuizForm({ ...quizForm, leaderboardEnabled: e.target.checked })} /> Enable Optional Leaderboard</label>
            </div>
            <button type="submit" className="btn-primary w-full"><Trophy className="w-4 h-4" /> Save &amp; Publish Gamified Video Quiz</button>
          </form>

          <div className="card-panel p-5 space-y-3">
            <h3 className="text-sm font-bold">Published &amp; Draft Video Quizzes ({videoQuizzes.length})</h3>
            {videoQuizzes.map((qz) => (
              <div key={qz.id} className="p-3.5 rounded-xl border border-slate-200/80 flex justify-between items-center gap-3">
                <div>
                  <div className="font-bold text-sm">{qz.title}</div>
                  <div className="text-xs text-slate-500">
                    Video: {qz.lessonTitle} • {qz.questionCount} Qs • +{qz.xp_per_correct} XP • {qz.attemptCount} Attempts (Avg {qz.averageScorePct}%)
                  </div>
                </div>
                <button
                  type="button"
                  onClick={async () => {
                    await adminApi.updateVideoQuiz(qz.id, {
                      lessonId: qz.lesson_id,
                      questionIds: qz.question_ids,
                      title: qz.title,
                      status: qz.status === 'published' ? 'draft' : 'published',
                    });
                    loadBase();
                  }}
                  className={`px-3 py-1 rounded-full text-xs font-bold ${qz.status === 'published' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-800'}`}
                >
                  {qz.status}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 4: Question-Wise Accuracy & Difficult Concepts Analytics */}
      {tab === 'analytics' && analytics && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5">
            <div className="card-panel p-4">
              <div className="text-xs text-slate-500 font-semibold">Total Video Quiz Attempts</div>
              <div className="text-2xl font-extrabold text-[#155EEF] mt-1">{analytics.summary.totalAttempts}</div>
            </div>
            <div className="card-panel p-4">
              <div className="text-xs text-slate-500 font-semibold">Avg Concept Accuracy</div>
              <div className="text-2xl font-extrabold text-emerald-600 mt-1">{analytics.summary.averageAccuracyPct}%</div>
            </div>
            <div className="card-panel p-4">
              <div className="text-xs text-slate-500 font-semibold">Total XP Awarded</div>
              <div className="text-2xl font-extrabold text-amber-600 mt-1">{analytics.summary.totalXpAwarded} XP</div>
            </div>
            <div className="card-panel p-4">
              <div className="text-xs text-slate-500 font-semibold">Tracked Questions</div>
              <div className="text-2xl font-extrabold text-indigo-600 mt-1">{analytics.summary.trackedQuestions}</div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div className="card-panel p-5">
              <h3 className="text-sm font-bold mb-3 flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-red-600" /> Most Difficult Concepts (Lowest Accuracy First)
              </h3>
              {(analytics.difficultConcepts || []).length === 0 ? (
                <div className="text-xs text-slate-400 py-8 text-center">No student quiz submissions recorded yet.</div>
              ) : (
                <div className="space-y-3">
                  {analytics.difficultConcepts.map((c) => (
                    <div key={c.conceptTag}>
                      <div className="flex justify-between text-xs font-semibold mb-1">
                        <span>{c.conceptTag}</span>
                        <span className={c.accuracyPct < 60 ? 'text-red-600 font-bold' : 'text-emerald-700'}>
                          {c.accuracyPct}% ({c.correct}/{c.attempts})
                        </span>
                      </div>
                      <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                        <div
                          className="h-full rounded-full"
                          style={{ width: `${Math.max(4, c.accuracyPct)}%`, backgroundColor: c.accuracyPct < 60 ? '#DC2626' : '#16A34A' }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="card-panel p-5">
              <h3 className="text-sm font-bold mb-3 flex items-center gap-2">
                <Clock className="w-4 h-4 text-[#155EEF]" /> Recent Student Attempts
              </h3>
              {(analytics.recentAttempts || []).length === 0 ? (
                <div className="text-xs text-slate-400 py-8 text-center">No attempts yet.</div>
              ) : (
                <div className="space-y-2 text-xs">
                  {analytics.recentAttempts.map((a) => (
                    <div key={a.attemptId} className="flex justify-between items-center p-2.5 rounded-xl bg-slate-50">
                      <div>
                        <div className="font-bold">{a.studentName} ({a.studentBoard})</div>
                        <div className="text-slate-500">{a.quizTitle}</div>
                      </div>
                      <div className="text-right">
                        <div className="font-bold text-[#155EEF]">{a.percentage}% • +{a.xpEarned} XP</div>
                        <div className="text-slate-500">Max Streak: {a.maxStreak}🔥</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
