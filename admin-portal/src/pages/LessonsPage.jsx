import React, { useEffect, useState } from 'react';
import { GripVertical, Plus, CheckCircle2, EyeOff } from 'lucide-react';
import { AdminLayout } from '../components/AdminLayout.jsx';
import { adminApi } from '../services/adminApi.js';

const STATUS_OPTIONS = ['draft', 'under_review', 'approved', 'scheduled', 'published', 'archived'];

const STATUS_STYLES = {
  draft: 'bg-slate-100 text-slate-700',
  under_review: 'bg-amber-100 text-amber-800',
  approved: 'bg-sky-100 text-sky-700',
  scheduled: 'bg-violet-100 text-violet-700',
  published: 'bg-emerald-100 text-emerald-700',
  archived: 'bg-red-100 text-red-700',
};

export function LessonsPage() {
  const [subjects, setSubjects] = useState([]);
  const [chapters, setChapters] = useState([]);
  const [topics, setTopics] = useState([]);
  const [lessons, setLessons] = useState([]);
  const [videos, setVideos] = useState([]);
  const [filterSubject, setFilterSubject] = useState('');
  const [filterChapter, setFilterChapter] = useState('');
  const [dragIndex, setDragIndex] = useState(null);
  const [msg, setMsg] = useState('');

  const [form, setForm] = useState({
    subjectId: '',
    chapterId: '',
    topicId: '',
    title: '',
    description: '',
    lessonType: 'concept',
    durationSeconds: 600,
    boardCodes: ['AP', 'TS'],
    videoLanguage: 'TE_EN_MIX',
    isPremium: false,
    status: 'draft',
    videoProvider: 'pikpak_local',
    providerFileId: '',
    youtubeVideoId: '',
  });

  const load = async () => {
    const [sRes, cRes, tRes, lRes, vRes] = await Promise.all([
      adminApi.listSubjects(),
      adminApi.listChapters(),
      adminApi.listTopics(),
      adminApi.listLessons({ subjectId: filterSubject || undefined, chapterId: filterChapter || undefined }),
      adminApi.listVideos(),
    ]);
    const subs = sRes.items || [];
    const chs = cRes.items || [];
    setSubjects(subs);
    setChapters(chs);
    setTopics(tRes.items || []);
    setLessons(lRes.items || []);
    setVideos(vRes.items || []);
    if (!form.subjectId && subs[0]) {
      const firstCh = chs.find((c) => c.subject_id === subs[0].id);
      setForm((f) => ({ ...f, subjectId: subs[0].id, chapterId: firstCh?.id || '' }));
    }
  };

  useEffect(() => {
    load();
  }, [filterSubject, filterChapter]);

  const handleCreate = async (e) => {
    e.preventDefault();
    const payload = {
      subjectId: form.subjectId,
      chapterId: form.chapterId,
      topicId: form.topicId || null,
      title: form.title,
      description: form.description,
      lessonType: form.lessonType,
      durationSeconds: Number(form.durationSeconds || 0),
      displayOrder: lessons.length + 1,
      boardCodes: form.boardCodes,
      videoLanguage: form.videoLanguage,
      isPremium: form.isPremium,
      status: form.status,
      ...(form.providerFileId || form.youtubeVideoId
        ? {
            videoSource: {
              provider: form.videoProvider,
              providerFileId: form.providerFileId || null,
              youtubeVideoId: form.youtubeVideoId || null,
            },
          }
        : {}),
    };
    await adminApi.createLesson(payload);
    setForm((f) => ({ ...f, title: '', description: '', providerFileId: '', youtubeVideoId: '' }));
    setMsg(`Lesson created with status "${form.status}".`);
    load();
  };

  const handleStatusChange = async (lessonId, status) => {
    await adminApi.updateLesson(lessonId, { status });
    setMsg(`Lesson status moved to "${status}". Student mobile app updates automatically.`);
    load();
  };

  const handleBoardToggleOnLesson = async (lesson, code) => {
    const curr = lesson.boardCodes || ['AP', 'TS'];
    const next = curr.includes(code)
      ? curr.length > 1
        ? curr.filter((c) => c !== code)
        : curr
      : [...curr, code];
    await adminApi.updateLesson(lesson.id, { boardCodes: next });
    setMsg(`Updated board mapping for "${lesson.title}" -> ${next.join(', ')}`);
    load();
  };

  const handleDrop = async (targetIdx) => {
    if (dragIndex === null || dragIndex === targetIdx) return;
    const reordered = [...lessons];
    const [moved] = reordered.splice(dragIndex, 1);
    reordered.splice(targetIdx, 0, moved);
    setLessons(reordered);
    setDragIndex(null);
    await adminApi.reorderLessons(reordered.map((l) => l.id));
    setMsg('Lesson sequence saved via drag-and-drop.');
  };

  const formChapters = chapters.filter((c) => !form.subjectId || c.subject_id === form.subjectId);
  const formTopics = topics.filter((t) => !form.chapterId || t.chapter_id === form.chapterId);

  return (
    <AdminLayout
      title="Lessons & Content Publishing"
      subtitle="Create lessons, link PikPak videos (TE_EN_MIX), assign AP/TS board visibility, drag-and-drop order, and publish."
    >
      {msg && (
        <div className="mb-4 rounded-xl bg-blue-50 border border-blue-200 px-4 py-2.5 text-xs font-semibold text-[#155EEF] flex justify-between">
          <span>{msg}</span>
          <button type="button" onClick={() => setMsg('')}>✕</button>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        {/* Create Lesson Form */}
        <form onSubmit={handleCreate} className="card-panel p-5 space-y-3 h-fit">
          <h3 className="text-sm font-bold">Create New Lesson</h3>
          <div>
            <label className="field-label">Subject</label>
            <select
              className="field-input"
              value={form.subjectId}
              onChange={(e) => {
                const sid = e.target.value;
                const firstCh = chapters.find((c) => c.subject_id === sid);
                setForm({ ...form, subjectId: sid, chapterId: firstCh?.id || '', topicId: '' });
              }}
            >
              {subjects.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
            </select>
          </div>
          <div>
            <label className="field-label">Chapter</label>
            <select className="field-input" required value={form.chapterId} onChange={(e) => setForm({ ...form, chapterId: e.target.value, topicId: '' })}>
              <option value="">Select chapter...</option>
              {formChapters.map((c) => <option key={c.id} value={c.id}>Ch {c.chapter_number}: {c.title}</option>)}
            </select>
          </div>
          <div>
            <label className="field-label">Topic (Optional)</label>
            <select className="field-input" value={form.topicId} onChange={(e) => setForm({ ...form, topicId: e.target.value })}>
              <option value="">No specific topic</option>
              {formTopics.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
            </select>
          </div>
          <div>
            <label className="field-label">Lesson Title</label>
            <input className="field-input" required placeholder="e.g. 1.1 Real Numbers Introduction" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </div>
          <div>
            <label className="field-label">Description</label>
            <textarea className="field-input" rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="field-label">Lesson Type</label>
              <select className="field-input" value={form.lessonType} onChange={(e) => setForm({ ...form, lessonType: e.target.value })}>
                <option value="concept">Concept</option>
                <option value="examples">Examples</option>
                <option value="exercise">Exercise Solutions</option>
                <option value="revision">Revision</option>
                <option value="important_questions">Important Questions</option>
              </select>
            </div>
            <div>
              <label className="field-label">Duration (sec)</label>
              <input type="number" className="field-input" value={form.durationSeconds} onChange={(e) => setForm({ ...form, durationSeconds: e.target.value })} />
            </div>
          </div>

          <div className="p-3 rounded-xl bg-[#F5F8FF] border border-blue-100 space-y-2">
            <div className="text-[11px] font-bold text-[#155EEF]">Attach Video (Language: TE_EN_MIX)</div>
            <select className="field-input" value={form.videoProvider} onChange={(e) => setForm({ ...form, videoProvider: e.target.value })}>
              <option value="pikpak_local">Existing PikPak Asset</option>
              <option value="cloudflare_r2">Cloudflare R2 Object</option>
              <option value="youtube_unlisted">YouTube Unlisted ID</option>
            </select>
            {form.videoProvider === 'youtube_unlisted' ? (
              <input className="field-input" placeholder="11-char YouTube Video ID" value={form.youtubeVideoId} onChange={(e) => setForm({ ...form, youtubeVideoId: e.target.value })} />
            ) : (
              <select className="field-input" value={form.providerFileId} onChange={(e) => setForm({ ...form, providerFileId: e.target.value })}>
                <option value="">Select synced PikPak / R2 asset...</option>
                {videos.filter((v) => v.providerFileId).map((v) => (
                  <option key={v.lessonId} value={v.providerFileId}>
                    {v.originalFileName || v.displayTitle} ({v.provider})
                  </option>
                ))}
              </select>
            )}
          </div>

          <div className="flex items-center justify-between pt-1">
            <div className="flex gap-3">
              {['AP', 'TS'].map((code) => (
                <label key={code} className="flex items-center gap-1.5 text-xs font-semibold">
                  <input
                    type="checkbox"
                    checked={form.boardCodes.includes(code)}
                    onChange={() =>
                      setForm((f) => ({
                        ...f,
                        boardCodes: f.boardCodes.includes(code)
                          ? f.boardCodes.length > 1 ? f.boardCodes.filter((b) => b !== code) : f.boardCodes
                          : [...f.boardCodes, code],
                      }))
                    }
                  />
                  {code}
                </label>
              ))}
            </div>
            <label className="flex items-center gap-1.5 text-xs font-semibold">
              <input type="checkbox" checked={form.isPremium} onChange={(e) => setForm({ ...form, isPremium: e.target.checked })} />
              Premium
            </label>
          </div>

          <div>
            <label className="field-label">Initial Publishing Status</label>
            <select className="field-input" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
              {STATUS_OPTIONS.map((st) => <option key={st} value={st}>{st.replace('_', ' ')}</option>)}
            </select>
          </div>

          <button type="submit" className="btn-primary w-full"><Plus className="w-4 h-4" /> Save Lesson</button>
        </form>

        {/* Drag-and-Drop Lesson List & Publishing Controls */}
        <div className="xl:col-span-2 card-panel p-5">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
            <div>
              <h3 className="text-sm font-bold">Lessons ({lessons.length})</h3>
              <p className="text-xs text-slate-500">Drag rows to reorder lesson sequence. Only Published lessons appear in Student APK.</p>
            </div>
            <div className="flex gap-2">
              <select className="field-input w-44" value={filterSubject} onChange={(e) => { setFilterSubject(e.target.value); setFilterChapter(''); }}>
                <option value="">All Subjects</option>
                {subjects.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
              </select>
              <select className="field-input w-48" value={filterChapter} onChange={(e) => setFilterChapter(e.target.value)}>
                <option value="">All Chapters</option>
                {chapters.filter((c) => !filterSubject || c.subject_id === filterSubject).map((c) => (
                  <option key={c.id} value={c.id}>Ch {c.chapter_number}: {c.title}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-2.5">
            {lessons.map((l, idx) => (
              <div
                key={l.id}
                draggable
                onDragStart={() => setDragIndex(idx)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => handleDrop(idx)}
                className="flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-xl border border-slate-200/80 bg-white hover:border-blue-300 cursor-move"
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <GripVertical className="w-4 h-4 text-slate-400 shrink-0" />
                  <div className="min-w-0">
                    <div className="font-bold text-sm truncate">{idx + 1}. {l.title}</div>
                    <div className="text-xs text-slate-500 flex flex-wrap gap-2 mt-0.5">
                      <span>{l.videoLanguage}</span>
                      <span>• {l.videoSource ? `${l.videoSource.provider}` : 'No video'}</span>
                      <span>• {l.is_premium ? 'Premium' : 'Free'}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  {['AP', 'TS'].map((code) => (
                    <button
                      key={code}
                      type="button"
                      onClick={() => handleBoardToggleOnLesson(l, code)}
                      className={`px-2 py-0.5 rounded-md text-[11px] font-bold border ${
                        (l.boardCodes || ['AP', 'TS']).includes(code)
                          ? 'bg-blue-50 border-blue-300 text-[#155EEF]'
                          : 'bg-slate-50 border-slate-200 text-slate-400'
                      }`}
                    >
                      {code}
                    </button>
                  ))}

                  <select
                    value={l.status || 'published'}
                    onChange={(e) => handleStatusChange(l.id, e.target.value)}
                    className={`px-2.5 py-1 rounded-full text-xs font-bold border-0 cursor-pointer ${STATUS_STYLES[l.status || 'published']}`}
                  >
                    {STATUS_OPTIONS.map((st) => (
                      <option key={st} value={st}>{st.replace('_', ' ')}</option>
                    ))}
                  </select>

                  {l.status !== 'published' ? (
                    <button type="button" onClick={() => handleStatusChange(l.id, 'published')} className="btn-primary text-xs py-1 px-2.5">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Publish
                    </button>
                  ) : (
                    <button type="button" onClick={() => handleStatusChange(l.id, 'draft')} className="btn-secondary text-xs py-1 px-2.5">
                      <EyeOff className="w-3.5 h-3.5" /> Unpublish
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
