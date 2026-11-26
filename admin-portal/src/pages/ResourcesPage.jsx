import React, { useEffect, useState } from 'react';
import { Upload, FileText } from 'lucide-react';
import { AdminLayout } from '../components/AdminLayout.jsx';
import { adminApi } from '../services/adminApi.js';

const RESOURCE_TYPES = [
  ['chapter_notes', 'Chapter Notes'],
  ['lesson_notes', 'Lesson Notes'],
  ['pdf_document', 'PDF Document'],
  ['textbook', 'Textbook Resource'],
  ['formula_sheet', 'Formula Sheet'],
  ['important_questions', 'Important Questions'],
  ['worksheet', 'Worksheet'],
  ['diagram', 'Diagram'],
  ['revision_notes', 'Revision Notes'],
  ['practical_sheet', 'Practical Activity Sheet'],
  ['model_paper', 'Model Paper'],
  ['previous_paper', 'Previous Question Paper'],
];

export function ResourcesPage() {
  const [resources, setResources] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [chapters, setChapters] = useState([]);
  const [msg, setMsg] = useState('');
  const [uploading, setUploading] = useState(false);

  const [form, setForm] = useState({
    title: '',
    description: '',
    subjectId: '',
    chapterId: '',
    resourceType: 'chapter_notes',
    medium: 'EN',
    boardCodes: ['AP', 'TS'],
    contentMarkdown: '',
    fileName: '',
    mimeType: 'application/pdf',
    contentBase64: '',
    isPremium: false,
    status: 'published',
  });

  const load = async () => {
    const [rRes, sRes, cRes] = await Promise.all([
      adminApi.listResources(),
      adminApi.listSubjects(),
      adminApi.listChapters(),
    ]);
    setResources(rRes.items || []);
    const subs = sRes.items || [];
    setSubjects(subs);
    setChapters(cRes.items || []);
    if (!form.subjectId && subs[0]) setForm((f) => ({ ...f, subjectId: subs[0].id }));
  };

  useEffect(() => {
    load();
  }, []);

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      const base64 = result.includes(',') ? result.split(',')[1] : '';
      setForm((f) => ({
        ...f,
        fileName: file.name,
        mimeType: file.type || 'application/pdf',
        contentBase64: base64,
      }));
    };
    reader.readAsDataURL(file);
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    setUploading(true);
    try {
      await adminApi.createResource(form);
      setForm((f) => ({ ...f, title: '', description: '', contentMarkdown: '', fileName: '', contentBase64: '' }));
      setMsg('Study material uploaded & published to Student App.');
      load();
    } finally {
      setUploading(false);
    }
  };

  return (
    <AdminLayout
      title="Notes & Study Material Management"
      subtitle="Upload PDFs, images, formula sheets & model papers with separate English Medium (EN) and Telugu Medium (TE) versions."
    >
      {msg && (
        <div className="mb-4 rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-2.5 text-xs font-semibold text-emerald-700 flex justify-between">
          <span>{msg}</span>
          <button type="button" onClick={() => setMsg('')}>✕</button>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        <form onSubmit={handleCreate} className="card-panel p-5 space-y-3 h-fit">
          <h3 className="text-sm font-bold">Upload Study Material</h3>
          <div>
            <label className="field-label">Resource Title</label>
            <input className="field-input" required placeholder="e.g. Ch 1 Real Numbers Formula PDF" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </div>
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
                <option value="">All / Subject-level</option>
                {chapters.filter((c) => c.subject_id === form.subjectId).map((c) => (
                  <option key={c.id} value={c.id}>Ch {c.chapter_number}: {c.title}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="field-label">Resource Type</label>
              <select className="field-input" value={form.resourceType} onChange={(e) => setForm({ ...form, resourceType: e.target.value })}>
                {RESOURCE_TYPES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
            </div>
            <div>
              <label className="field-label">Written Medium (Separate from Video)</label>
              <select className="field-input" value={form.medium} onChange={(e) => setForm({ ...form, medium: e.target.value })}>
                <option value="EN">English Medium (EN)</option>
                <option value="TE">Telugu Medium (TE)</option>
                <option value="BOTH">Both Mediums</option>
              </select>
            </div>
          </div>

          <div>
            <label className="field-label">Attach PDF / Image File (Max 15 MB)</label>
            <input type="file" accept=".pdf,image/png,image/jpeg,image/webp,.md,.txt" onChange={handleFileChange} className="text-xs block w-full" />
            {form.fileName && <div className="text-[11px] text-[#155EEF] mt-1 font-semibold">Selected: {form.fileName}</div>}
          </div>

          <div>
            <label className="field-label">Or Markdown Notes Content</label>
            <textarea className="field-input" rows={3} placeholder="Write revision notes or key formulas..." value={form.contentMarkdown} onChange={(e) => setForm({ ...form, contentMarkdown: e.target.value })} />
          </div>

          <label className="flex items-center gap-2 text-xs font-semibold">
            <input type="checkbox" checked={form.isPremium} onChange={(e) => setForm({ ...form, isPremium: e.target.checked })} />
            Premium Subscribers Only
          </label>

          <button type="submit" disabled={uploading} className="btn-primary w-full">
            <Upload className="w-4 h-4" /> {uploading ? 'Uploading...' : 'Publish Resource'}
          </button>
        </form>

        <div className="xl:col-span-2 card-panel p-5 space-y-3">
          <h3 className="text-sm font-bold">Study Materials Library ({resources.length})</h3>
          {resources.map((r) => (
            <div key={r.id} className="flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-xl border border-slate-200/80">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-xl bg-blue-50 text-[#155EEF] flex items-center justify-center shrink-0">
                  <FileText className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <div className="font-bold text-sm truncate">{r.title}</div>
                  <div className="text-xs text-slate-500">
                    {r.resource_type.replace('_', ' ')} • Medium: <strong>{r.medium}</strong> • {r.file_name || 'Markdown'}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={async () => {
                    await adminApi.updateResource(r.id, { status: r.status === 'published' ? 'archived' : 'published' });
                    load();
                  }}
                  className={`px-3 py-1 rounded-full text-xs font-bold ${r.status === 'published' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'}`}
                >
                  {r.status}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </AdminLayout>
  );
}
