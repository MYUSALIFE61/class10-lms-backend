import React, { useEffect, useState } from 'react';
import { Plus, Archive, CheckCircle2 } from 'lucide-react';
import { AdminLayout } from '../components/AdminLayout.jsx';
import { adminApi } from '../services/adminApi.js';

export function AcademicManagementPage() {
  const [tab, setTab] = useState('subjects');
  const [boards, setBoards] = useState([]);
  const [years, setYears] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [chapters, setChapters] = useState([]);
  const [topics, setTopics] = useState([]);
  const [selectedSubjectId, setSelectedSubjectId] = useState('');
  const [selectedChapterId, setSelectedChapterId] = useState('');
  const [msg, setMsg] = useState('');

  // Forms
  const [boardForm, setBoardForm] = useState({ code: '', name: '', shortName: '', syllabusVersion: 'SSC-2026' });
  const [yearForm, setYearForm] = useState({ name: '', startDate: '2026-06-01', endDate: '2027-04-30', syllabusVersion: 'SSC-2026' });
  const [subForm, setSubForm] = useState({ title: '', description: '', boardCodes: ['AP', 'TS'], languageCategory: 'core', displayOrder: 1 });
  const [chForm, setChForm] = useState({ subjectId: '', chapterNumber: 1, title: '', summary: '', boardCodes: ['AP', 'TS'] });
  const [topForm, setTopForm] = useState({ chapterId: '', title: '', description: '', learningObjectives: '', displayOrder: 1 });

  const loadAll = async () => {
    const [bRes, yRes, sRes, cRes, tRes] = await Promise.all([
      adminApi.listBoards(),
      adminApi.listAcademicYears(),
      adminApi.listSubjects(),
      adminApi.listChapters(),
      adminApi.listTopics(),
    ]);
    setBoards(bRes.items || []);
    setYears(yRes.items || []);
    const subs = sRes.items || [];
    setSubjects(subs);
    const chs = cRes.items || [];
    setChapters(chs);
    setTopics(tRes.items || []);
    if (!selectedSubjectId && subs[0]) {
      setSelectedSubjectId(subs[0].id);
      setChForm((f) => ({ ...f, subjectId: subs[0].id }));
    }
    if (!selectedChapterId && chs[0]) {
      setSelectedChapterId(chs[0].id);
      setTopForm((f) => ({ ...f, chapterId: chs[0].id }));
    }
  };

  useEffect(() => {
    loadAll();
  }, []);

  const toggleBoardCode = (list, code) =>
    list.includes(code) ? (list.length > 1 ? list.filter((c) => c !== code) : list) : [...list, code];

  const handleCreateBoard = async (e) => {
    e.preventDefault();
    await adminApi.createBoard(boardForm);
    setBoardForm({ code: '', name: '', shortName: '', syllabusVersion: 'SSC-2026' });
    setMsg('Board created.');
    loadAll();
  };

  const handleCreateYear = async (e) => {
    e.preventDefault();
    await adminApi.createAcademicYear(yearForm);
    setYearForm({ name: '', startDate: '2026-06-01', endDate: '2027-04-30', syllabusVersion: 'SSC-2026' });
    setMsg('Academic year created.');
    loadAll();
  };

  const handleCreateSubject = async (e) => {
    e.preventDefault();
    await adminApi.createSubject({ ...subForm, status: 'published' });
    setSubForm({ title: '', description: '', boardCodes: ['AP', 'TS'], languageCategory: 'core', displayOrder: subjects.length + 1 });
    setMsg('Subject created & published dynamically to student app.');
    loadAll();
  };

  const handleCreateChapter = async (e) => {
    e.preventDefault();
    await adminApi.createChapter({ ...chForm, subjectId: chForm.subjectId || selectedSubjectId, status: 'published' });
    setChForm((p) => ({ ...p, chapterNumber: Number(p.chapterNumber) + 1, title: '', summary: '' }));
    setMsg('Chapter created & published.');
    loadAll();
  };

  const handleCreateTopic = async (e) => {
    e.preventDefault();
    await adminApi.createTopic({ ...topForm, chapterId: topForm.chapterId || selectedChapterId, status: 'published' });
    setTopForm((p) => ({ ...p, title: '', description: '', learningObjectives: '', displayOrder: Number(p.displayOrder) + 1 }));
    setMsg('Topic added inside chapter.');
    loadAll();
  };

  const visibleChapters = selectedSubjectId
    ? chapters.filter((c) => c.subject_id === selectedSubjectId)
    : chapters;
  const visibleTopics = selectedChapterId
    ? topics.filter((t) => t.chapter_id === selectedChapterId)
    : topics;

  return (
    <AdminLayout
      title="Academic Structure Management"
      subtitle="Manage Board → Academic Year → Class 10 → Subject → Chapter → Topic hierarchy dynamically."
    >
      {msg && (
        <div className="mb-4 rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-2.5 text-xs font-semibold text-emerald-700 flex justify-between">
          <span>{msg}</span>
          <button type="button" onClick={() => setMsg('')}>✕</button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex flex-wrap gap-2 mb-5">
        {[
          ['boards', `Boards (${boards.length})`],
          ['years', `Academic Years (${years.length})`],
          ['subjects', `Subjects (${subjects.length})`],
          ['chapters', `Chapters (${chapters.length})`],
          ['topics', `Topics (${topics.length})`],
        ].map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition ${
              tab === key ? 'bg-[#155EEF] text-white shadow-sm' : 'bg-white text-slate-600 border border-slate-200'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* BOARDS */}
      {tab === 'boards' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <form onSubmit={handleCreateBoard} className="card-panel p-5 space-y-3">
            <h3 className="text-sm font-bold">Add SSC Board</h3>
            <div>
              <label className="field-label">Board Code</label>
              <input className="field-input" required placeholder="e.g. CBSE" value={boardForm.code} onChange={(e) => setBoardForm({ ...boardForm, code: e.target.value })} />
            </div>
            <div>
              <label className="field-label">Board Name</label>
              <input className="field-input" required placeholder="Full Board Name" value={boardForm.name} onChange={(e) => setBoardForm({ ...boardForm, name: e.target.value })} />
            </div>
            <div>
              <label className="field-label">Short Name</label>
              <input className="field-input" placeholder="e.g. AP SSC" value={boardForm.shortName} onChange={(e) => setBoardForm({ ...boardForm, shortName: e.target.value })} />
            </div>
            <div>
              <label className="field-label">Syllabus Version</label>
              <input className="field-input" value={boardForm.syllabusVersion} onChange={(e) => setBoardForm({ ...boardForm, syllabusVersion: e.target.value })} />
            </div>
            <button type="submit" className="btn-primary w-full"><Plus className="w-4 h-4" /> Create Board</button>
          </form>

          <div className="lg:col-span-2 card-panel p-5 space-y-3">
            <h3 className="text-sm font-bold">Configured Boards</h3>
            {boards.map((b) => (
              <div key={b.id} className="flex items-center justify-between p-3.5 rounded-xl border border-slate-200/80">
                <div>
                  <div className="font-bold text-sm">{b.name} <span className="text-xs text-[#155EEF]">({b.code})</span></div>
                  <div className="text-xs text-slate-500">Syllabus: {b.syllabus_version} • {b.description}</div>
                </div>
                <button
                  type="button"
                  onClick={async () => {
                    await adminApi.updateBoard(b.id, { isActive: !b.is_active });
                    loadAll();
                  }}
                  className={`px-3 py-1 rounded-full text-xs font-bold ${b.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'}`}
                >
                  {b.is_active ? 'Active' : 'Inactive'}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ACADEMIC YEARS */}
      {tab === 'years' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <form onSubmit={handleCreateYear} className="card-panel p-5 space-y-3">
            <h3 className="text-sm font-bold">Create Academic Year</h3>
            <div>
              <label className="field-label">Academic Year</label>
              <input className="field-input" required placeholder="2027-2028" value={yearForm.name} onChange={(e) => setYearForm({ ...yearForm, name: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="field-label">Start Date</label>
                <input type="date" className="field-input" value={yearForm.startDate} onChange={(e) => setYearForm({ ...yearForm, startDate: e.target.value })} />
              </div>
              <div>
                <label className="field-label">End Date</label>
                <input type="date" className="field-input" value={yearForm.endDate} onChange={(e) => setYearForm({ ...yearForm, endDate: e.target.value })} />
              </div>
            </div>
            <button type="submit" className="btn-primary w-full"><Plus className="w-4 h-4" /> Add Year</button>
          </form>

          <div className="lg:col-span-2 card-panel p-5 space-y-3">
            <h3 className="text-sm font-bold">Academic Years</h3>
            {years.map((y) => (
              <div key={y.id} className="flex items-center justify-between p-3.5 rounded-xl border border-slate-200/80">
                <div>
                  <div className="font-bold text-sm">{y.name}</div>
                  <div className="text-xs text-slate-500">{y.start_date} → {y.end_date} • Syllabus {y.syllabus_version}</div>
                </div>
                <button
                  type="button"
                  onClick={async () => {
                    await adminApi.updateAcademicYear(y.id, { isArchived: !y.is_archived, isActive: y.is_archived });
                    loadAll();
                  }}
                  className="btn-secondary text-xs py-1.5"
                >
                  {y.is_archived ? 'Restore' : 'Archive'}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* SUBJECTS */}
      {tab === 'subjects' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <form onSubmit={handleCreateSubject} className="card-panel p-5 space-y-3">
            <h3 className="text-sm font-bold">Create Subject</h3>
            <div>
              <label className="field-label">Subject Title</label>
              <input className="field-input" required placeholder="e.g. General Science / Hindi" value={subForm.title} onChange={(e) => setSubForm({ ...subForm, title: e.target.value })} />
            </div>
            <div>
              <label className="field-label">Description</label>
              <textarea className="field-input" rows={2} value={subForm.description} onChange={(e) => setSubForm({ ...subForm, description: e.target.value })} />
            </div>
            <div>
              <label className="field-label">Category</label>
              <select className="field-input" value={subForm.languageCategory} onChange={(e) => setSubForm({ ...subForm, languageCategory: e.target.value })}>
                <option value="core">Core Subject</option>
                <option value="first_language">First Language</option>
                <option value="second_language">Second Language</option>
                <option value="third_language">Third Language</option>
              </select>
            </div>
            <div>
              <label className="field-label">Applicable Boards</label>
              <div className="flex gap-3">
                {['AP', 'TS'].map((code) => (
                  <label key={code} className="flex items-center gap-1.5 text-xs font-semibold">
                    <input
                      type="checkbox"
                      checked={subForm.boardCodes.includes(code)}
                      onChange={() => setSubForm({ ...subForm, boardCodes: toggleBoardCode(subForm.boardCodes, code) })}
                    />
                    {code} SSC
                  </label>
                ))}
              </div>
            </div>
            <button type="submit" className="btn-primary w-full"><Plus className="w-4 h-4" /> Publish Subject</button>
          </form>

          <div className="lg:col-span-2 card-panel p-5">
            <h3 className="text-sm font-bold mb-3">Class 10 Subjects (Live in Student App)</h3>
            <div className="space-y-2.5">
              {subjects.map((s) => (
                <div key={s.id} className="flex items-center justify-between p-3.5 rounded-xl border border-slate-200/80">
                  <div>
                    <div className="font-bold text-sm">{s.title}</div>
                    <div className="text-xs text-slate-500">
                      Boards: {(s.boardCodes || ['AP', 'TS']).join(', ')} • {s.chapterCount} Chapters • {s.lessonCount} Lessons
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold ${s.status === 'published' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'}`}>
                      {s.status}
                    </span>
                    <button
                      type="button"
                      onClick={async () => {
                        await adminApi.updateSubject(s.id, { status: s.status === 'published' ? 'archived' : 'published' });
                        loadAll();
                      }}
                      className="btn-secondary text-xs py-1 px-2.5"
                    >
                      {s.status === 'published' ? <Archive className="w-3.5 h-3.5" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* CHAPTERS */}
      {tab === 'chapters' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <form onSubmit={handleCreateChapter} className="card-panel p-5 space-y-3">
            <h3 className="text-sm font-bold">Add Chapter</h3>
            <div>
              <label className="field-label">Subject</label>
              <select className="field-input" value={chForm.subjectId || selectedSubjectId} onChange={(e) => { setChForm({ ...chForm, subjectId: e.target.value }); setSelectedSubjectId(e.target.value); }}>
                {subjects.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="field-label">Ch. No</label>
                <input type="number" className="field-input" value={chForm.chapterNumber} onChange={(e) => setChForm({ ...chForm, chapterNumber: Number(e.target.value) })} />
              </div>
              <div className="col-span-2">
                <label className="field-label">Chapter Title</label>
                <input className="field-input" required placeholder="e.g. Sets / Statistics" value={chForm.title} onChange={(e) => setChForm({ ...chForm, title: e.target.value })} />
              </div>
            </div>
            <div>
              <label className="field-label">Summary</label>
              <textarea className="field-input" rows={2} value={chForm.summary} onChange={(e) => setChForm({ ...chForm, summary: e.target.value })} />
            </div>
            <div className="flex gap-3">
              {['AP', 'TS'].map((code) => (
                <label key={code} className="flex items-center gap-1.5 text-xs font-semibold">
                  <input type="checkbox" checked={chForm.boardCodes.includes(code)} onChange={() => setChForm({ ...chForm, boardCodes: toggleBoardCode(chForm.boardCodes, code) })} />
                  {code} SSC
                </label>
              ))}
            </div>
            <button type="submit" className="btn-primary w-full"><Plus className="w-4 h-4" /> Add Chapter</button>
          </form>

          <div className="lg:col-span-2 card-panel p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold">Chapters</h3>
              <select className="field-input w-56" value={selectedSubjectId} onChange={(e) => setSelectedSubjectId(e.target.value)}>
                <option value="">All Subjects</option>
                {subjects.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
              </select>
            </div>
            {visibleChapters.map((c) => (
              <div key={c.id} className="flex items-center justify-between p-3 rounded-xl border border-slate-200/80">
                <div>
                  <div className="font-bold text-sm">Ch {c.chapter_number}: {c.title}</div>
                  <div className="text-xs text-slate-500">{c.topicCount} Topics • {c.lessonCount} Lessons • Boards: {(c.boardCodes || ['AP', 'TS']).join(', ')}</div>
                </div>
                <button
                  type="button"
                  onClick={async () => {
                    await adminApi.updateChapter(c.id, { status: c.status === 'published' ? 'draft' : 'published' });
                    loadAll();
                  }}
                  className={`px-3 py-1 rounded-full text-xs font-bold ${c.status === 'published' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-800'}`}
                >
                  {c.status}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TOPICS */}
      {tab === 'topics' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <form onSubmit={handleCreateTopic} className="card-panel p-5 space-y-3">
            <h3 className="text-sm font-bold">Add Topic Inside Chapter</h3>
            <div>
              <label className="field-label">Chapter</label>
              <select className="field-input" value={topForm.chapterId || selectedChapterId} onChange={(e) => { setTopForm({ ...topForm, chapterId: e.target.value }); setSelectedChapterId(e.target.value); }}>
                {chapters.map((c) => <option key={c.id} value={c.id}>Ch {c.chapter_number}: {c.title}</option>)}
              </select>
            </div>
            <div>
              <label className="field-label">Topic Title</label>
              <input className="field-input" required placeholder="e.g. Fundamental Theorem of Arithmetic" value={topForm.title} onChange={(e) => setTopForm({ ...topForm, title: e.target.value })} />
            </div>
            <div>
              <label className="field-label">Learning Objectives</label>
              <textarea className="field-input" rows={2} value={topForm.learningObjectives} onChange={(e) => setTopForm({ ...topForm, learningObjectives: e.target.value })} />
            </div>
            <button type="submit" className="btn-primary w-full"><Plus className="w-4 h-4" /> Add Topic</button>
          </form>

          <div className="lg:col-span-2 card-panel p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold">Chapter Topics</h3>
              <select className="field-input w-64" value={selectedChapterId} onChange={(e) => setSelectedChapterId(e.target.value)}>
                <option value="">All Chapters</option>
                {chapters.map((c) => <option key={c.id} value={c.id}>Ch {c.chapter_number}: {c.title}</option>)}
              </select>
            </div>
            {visibleTopics.length === 0 ? (
              <div className="text-xs text-slate-400 py-8 text-center">No topics created for this chapter yet.</div>
            ) : (
              visibleTopics.map((t) => (
                <div key={t.id} className="p-3 rounded-xl border border-slate-200/80 flex justify-between items-center">
                  <div>
                    <div className="font-bold text-sm">{t.display_order}. {t.title}</div>
                    <div className="text-xs text-slate-500">{t.learning_objectives || t.description}</div>
                  </div>
                  <span className="px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-[11px] font-bold">
                    {t.status}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
