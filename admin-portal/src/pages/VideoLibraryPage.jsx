import React, { useEffect, useState } from 'react';
import { RefreshCw, Play, Link2, Upload, X } from 'lucide-react';
import { AdminLayout } from '../components/AdminLayout.jsx';
import { adminApi } from '../services/adminApi.js';

export function VideoLibraryPage() {
  const [videos, setVideos] = useState([]);
  const [providerMeta, setProviderMeta] = useState(null);
  const [subjects, setSubjects] = useState([]);
  const [chapters, setChapters] = useState([]);
  const [syncing, setSyncing] = useState(false);
  const [editing, setEditing] = useState(null);
  const [preview, setPreview] = useState(null);
  const [offlineTarget, setOfflineTarget] = useState(null);
  const [offlineAssets, setOfflineAssets] = useState([]);
  const [offlineFile, setOfflineFile] = useState(null);
  const [offlineQuality, setOfflineQuality] = useState('720p');
  const [uploadingOffline, setUploadingOffline] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(null);
  const [uploadError, setUploadError] = useState('');
  const [msg, setMsg] = useState('');

  const load = async () => {
    const [vRes, sRes, cRes] = await Promise.all([
      adminApi.listVideos(),
      adminApi.listSubjects(),
      adminApi.listChapters(),
    ]);
    setVideos(vRes.items || []);
    setProviderMeta(vRes.provider || null);
    setSubjects(sRes.items || []);
    setChapters(cRes.items || []);
  };

  useEffect(() => {
    load();
  }, []);

  const handleSync = async () => {
    setSyncing(true);
    setMsg('');
    try {
      const res = await adminApi.syncVideos();
      setMsg(`Synced ${res.syncedCount} video(s) from ${res.provider}. Original filenames preserved untouched.`);
      await load();
    } catch (err) {
      setMsg(`Sync notice: ${err.message}`);
    } finally {
      setSyncing(false);
    }
  };

  const handleMapSave = async (e) => {
    e.preventDefault();
    await adminApi.mapVideo(editing.lessonId, {
      displayTitle: editing.displayTitle,
      subjectId: editing.subjectId,
      chapterId: editing.chapterId,
      languageCode: editing.languageCode,
      boardCodes: editing.boardCodes,
      quality: editing.quality,
      isPremium: editing.isPremium,
      status: editing.status,
    });
    setEditing(null);
    setMsg('Video display title & syllabus mapping saved (original storage file untouched).');
    load();
  };

  const handlePreview = async (lessonId) => {
    const res = await adminApi.previewVideo(lessonId);
    setPreview(res);
  };

  const openOfflineModal = async (video) => {
    setOfflineTarget(video);
    setOfflineFile(null);
    setOfflineQuality('720p');
    setUploadProgress(null);
    setUploadError('');
    try {
      const res = await adminApi.listLessonOfflineAssets(video.lessonId);
      setOfflineAssets(res.items || []);
    } catch {
      setOfflineAssets([]);
    }
  };

  const handleUploadOfflineMp4 = async (e) => {
    if (e?.preventDefault) e.preventDefault();
    if (!offlineTarget || !offlineFile) return;

    const maxBytes = 1024 * 1024 * 1024;
    const isMp4 =
      offlineFile.type === 'video/mp4' || String(offlineFile.name || '').toLowerCase().endsWith('.mp4');
    if (!isMp4) {
      setUploadError('Only valid MP4 video files (.mp4, video/mp4) are accepted for private offline storage.');
      return;
    }
    if (offlineFile.size <= 0 || offlineFile.size > maxBytes) {
      setUploadError('MP4 file size must be between 1 byte and 1024 MB.');
      return;
    }

    setUploadingOffline(true);
    setUploadError('');
    setUploadProgress({ percent: 0, loaded: 0, total: offlineFile.size });
    setMsg('');
    try {
      const res = await adminApi.uploadLessonOfflineMp4(offlineTarget.lessonId, {
        file: offlineFile,
        qualityLabel: offlineQuality,
        onProgress: (p) => setUploadProgress(p),
      });
      setMsg(
        `Authorized offline MP4 uploaded for "${offlineTarget.displayTitle}" (SHA-256: ${String(
          res.asset?.sha256Checksum || ''
        ).slice(0, 12)}…).`
      );
      const listRes = await adminApi.listLessonOfflineAssets(offlineTarget.lessonId);
      setOfflineAssets(listRes.items || []);
      setOfflineFile(null);
      setUploadProgress(null);
    } catch (err) {
      setUploadError(err.message || 'Offline MP4 upload failed.');
    } finally {
      setUploadingOffline(false);
    }
  };

  return (
    <AdminLayout
      title="Video Library — PikPak & Protected Storage"
      subtitle="Browse synced PikPak videos, map raw filenames (e.g., VID-20261108-WA0001.mp4) to clean TE_EN_MIX lessons without modifying storage assets, and preview streams."
      actions={
        <button type="button" onClick={handleSync} disabled={syncing} className="btn-primary">
          <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
          {syncing ? 'Syncing PikPak...' : 'Sync PikPak Storage'}
        </button>
      }
    >
      {msg && (
        <div className="mb-4 rounded-xl bg-blue-50 border border-blue-200 px-4 py-2.5 text-xs font-semibold text-[#155EEF] flex justify-between">
          <span>{msg}</span>
          <button type="button" onClick={() => setMsg('')}>✕</button>
        </div>
      )}

      {providerMeta && (
        <div className="card-panel p-4 mb-5 flex flex-wrap items-center justify-between gap-3 bg-gradient-to-r from-[#EFF6FF] to-white">
          <div className="text-xs">
            <span className="font-bold text-[#155EEF]">Active Storage Provider:</span>{' '}
            <code className="px-2 py-0.5 rounded bg-white border border-blue-200 font-bold">{providerMeta.provider}</code>{' '}
            • Default Teaching Language: <span className="font-bold">TE_EN_MIX (Telugu + English Mixed)</span>
          </div>
          <div className="text-xs text-slate-500">
            Total Linked Videos: <strong>{videos.length}</strong>
          </div>
        </div>
      )}

      <div className="card-panel overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-[#F5F8FF] text-slate-500 uppercase text-[11px]">
              <tr>
                <th className="px-4 py-3 text-left">Display Title / Original Storage File</th>
                <th className="px-4 py-3 text-left">Mapped Syllabus</th>
                <th className="px-4 py-3 text-left">Provider / Lang</th>
                <th className="px-4 py-3 text-left">Boards</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {videos.map((v) => (
                <tr key={v.lessonId} className="hover:bg-blue-50/30">
                  <td className="px-4 py-3">
                    <div className="font-bold text-[#172554]">{v.displayTitle}</div>
                    <div className="text-[11px] text-slate-500 font-mono">
                      Raw File: {v.originalFileName || '—'} {v.sizeLabel ? `(${v.sizeLabel})` : ''}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-semibold">{v.subjectTitle}</div>
                    <div className="text-slate-500">{v.chapterTitle}</div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="px-2 py-0.5 rounded bg-slate-100 font-mono">{v.provider}</span>{' '}
                    <span className="px-2 py-0.5 rounded bg-indigo-100 text-indigo-700 font-bold">{v.languageCode}</span>
                  </td>
                  <td className="px-4 py-3 font-bold text-[#155EEF]">{(v.boardCodes || ['AP', 'TS']).join(', ')}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full font-bold ${v.status === 'published' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-800'}`}>
                      {v.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right space-x-1.5 whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => openOfflineModal(v)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 font-semibold"
                    >
                      <Upload className="w-3.5 h-3.5" /> Offline MP4
                    </button>
                    <button
                      type="button"
                      onClick={() => handlePreview(v.lessonId)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 font-semibold"
                    >
                      <Play className="w-3.5 h-3.5" /> Preview
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setEditing({
                          ...v,
                          subjectId: v.subjectId || subjects[0]?.id || '',
                          chapterId: v.chapterId || chapters[0]?.id || '',
                        })
                      }
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#EFF6FF] text-[#155EEF] hover:bg-blue-100 font-semibold"
                    >
                      <Link2 className="w-3.5 h-3.5" /> Map / Rename
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Non-Destructive Video Mapping Modal */}
      {editing && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <form onSubmit={handleMapSave} className="bg-white rounded-2xl max-w-lg w-full p-6 space-y-3.5 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-extrabold">Map Uploaded Video to Lesson</h3>
              <button type="button" onClick={() => setEditing(null)}><X className="w-5 h-5" /></button>
            </div>
            <div className="text-xs bg-slate-50 border border-slate-200 rounded-xl p-2.5 font-mono">
              Original Storage File (preserved): {editing.originalFileName}
            </div>
            <div>
              <label className="field-label">Clean Student Display Title</label>
              <input className="field-input" required value={editing.displayTitle} onChange={(e) => setEditing({ ...editing, displayTitle: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="field-label">Subject</label>
                <select className="field-input" value={editing.subjectId} onChange={(e) => setEditing({ ...editing, subjectId: e.target.value })}>
                  {subjects.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
                </select>
              </div>
              <div>
                <label className="field-label">Chapter</label>
                <select className="field-input" value={editing.chapterId} onChange={(e) => setEditing({ ...editing, chapterId: e.target.value })}>
                  {chapters.filter((c) => !editing.subjectId || c.subject_id === editing.subjectId).map((c) => (
                    <option key={c.id} value={c.id}>Ch {c.chapter_number}: {c.title}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="field-label">Video Language</label>
                <select className="field-input" value={editing.languageCode} onChange={(e) => setEditing({ ...editing, languageCode: e.target.value })}>
                  <option value="TE_EN_MIX">TE_EN_MIX (Telugu + English)</option>
                  <option value="EN">EN (English)</option>
                  <option value="TE">TE (Telugu)</option>
                </select>
              </div>
              <div>
                <label className="field-label">Status</label>
                <select className="field-input" value={editing.status} onChange={(e) => setEditing({ ...editing, status: e.target.value })}>
                  <option value="published">Published</option>
                  <option value="draft">Draft</option>
                  <option value="archived">Archived</option>
                </select>
              </div>
            </div>
            <div className="flex gap-4 items-center">
              {['AP', 'TS'].map((code) => (
                <label key={code} className="flex items-center gap-1.5 text-xs font-bold">
                  <input
                    type="checkbox"
                    checked={(editing.boardCodes || ['AP', 'TS']).includes(code)}
                    onChange={() => {
                      const curr = editing.boardCodes || ['AP', 'TS'];
                      const next = curr.includes(code)
                        ? curr.length > 1 ? curr.filter((x) => x !== code) : curr
                        : [...curr, code];
                      setEditing({ ...editing, boardCodes: next });
                    }}
                  />
                  Map to {code} SSC
                </label>
              ))}
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setEditing(null)} className="btn-secondary">Cancel</button>
              <button type="submit" className="btn-primary">Save Mapping</button>
            </div>
          </form>
        </div>
      )}

      {/* Authorized Offline MP4 Upload Modal */}
      {offlineTarget && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4">
          <form onSubmit={handleUploadOfflineMp4} className="bg-white rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-extrabold">Authorized Offline MP4 Asset</h3>
              <button type="button" onClick={() => setOfflineTarget(null)}><X className="w-5 h-5" /></button>
            </div>
            <div className="text-xs text-slate-600">
              Lesson: <strong className="text-slate-900">{offlineTarget.displayTitle}</strong>. Upload an organization-owned MP4 for encrypted offline student downloads (YouTube Unlisted online links remain untouched).
            </div>
            {offlineAssets.length > 0 && (
              <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-3 space-y-1.5 text-xs">
                <div className="font-bold text-emerald-800">Attached Offline Assets ({offlineAssets.length})</div>
                {offlineAssets.map((a) => (
                  <div key={a.id} className="flex items-center justify-between gap-2 text-emerald-900 font-mono text-[11px]">
                    <span>{a.qualityLabel} • {(a.fileSizeBytes / (1024 * 1024)).toFixed(2)} MB • SHA256:{a.sha256Checksum?.slice(0, 10)}…</span>
                    <button
                      type="button"
                      className="text-red-600 underline font-sans font-semibold"
                      onClick={async () => {
                        await adminApi.deleteLessonOfflineAsset(a.id);
                        const listRes = await adminApi.listLessonOfflineAssets(offlineTarget.lessonId);
                        setOfflineAssets(listRes.items || []);
                      }}
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div>
              <label className="field-label">Select Organization MP4 File</label>
              <input
                type="file"
                accept="video/mp4,.mp4"
                required
                className="field-input"
                onChange={(e) => setOfflineFile(e.target.files?.[0] || null)}
              />
            </div>
            <div>
              <label className="field-label">Quality Variant Label</label>
              <select className="field-input" value={offlineQuality} onChange={(e) => setOfflineQuality(e.target.value)}>
                <option value="720p">720p (Recommended)</option>
                <option value="480p">480p (Data Saver)</option>
                <option value="1080p">1080p (HD)</option>
                <option value="original">Original</option>
              </select>
            </div>
            {uploadProgress && (
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs font-semibold text-[#155EEF]">
                  <span>Uploading & Computing SHA-256…</span>
                  <span>
                    {uploadProgress.percent}% ({(uploadProgress.loaded / (1024 * 1024)).toFixed(1)} /{' '}
                    {(uploadProgress.total / (1024 * 1024)).toFixed(1)} MB)
                  </span>
                </div>
                <div className="w-full h-2 rounded-full bg-blue-100 overflow-hidden">
                  <div
                    className="h-full bg-[#155EEF] transition-all"
                    style={{ width: `${uploadProgress.percent}%` }}
                  />
                </div>
              </div>
            )}
            {uploadError && (
              <div className="rounded-xl bg-red-50 border border-red-200 p-3 text-xs text-red-700 flex items-center justify-between gap-2">
                <span>{uploadError}</span>
                <button
                  type="button"
                  onClick={handleUploadOfflineMp4}
                  disabled={uploadingOffline || !offlineFile}
                  className="px-2.5 py-1 rounded-lg bg-red-600 text-white font-bold shrink-0"
                >
                  Retry
                </button>
              </div>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setOfflineTarget(null)} className="btn-secondary">Close</button>
              <button type="submit" disabled={uploadingOffline || !offlineFile} className="btn-primary">
                {uploadingOffline ? `Uploading ${uploadProgress?.percent ?? 0}%...` : 'Upload Authorized MP4'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Protected Video Preview Modal */}
      {preview && (
        <div className="fixed inset-0 z-50 bg-slate-900/75 flex items-center justify-center p-4">
          <div className="bg-slate-950 text-white rounded-2xl max-w-3xl w-full overflow-hidden shadow-2xl">
            <div className="px-5 py-3 flex items-center justify-between border-b border-slate-800">
              <div className="font-bold text-sm truncate">{preview.title}</div>
              <button type="button" onClick={() => setPreview(null)} className="p-1 hover:bg-slate-800 rounded-lg"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-4">
              {preview.streamUrl ? (
                <video src={preview.streamUrl} controls autoPlay className="w-full max-h-[65vh] rounded-xl bg-black" />
              ) : preview.youtubeVideoId ? (
                <iframe
                  title={preview.title}
                  className="w-full aspect-video rounded-xl"
                  src={`https://www.youtube.com/embed/${preview.youtubeVideoId}`}
                  allowFullScreen
                />
              ) : (
                <div className="text-center py-12 text-slate-400 text-sm">No playable stream URL configured for this asset.</div>
              )}
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
