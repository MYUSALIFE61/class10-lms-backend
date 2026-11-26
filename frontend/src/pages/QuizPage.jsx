import React, { useEffect, useState } from 'react';
import { Clock, CheckCircle2, RotateCcw, Trophy, Play, Award, Flame, Zap, Medal } from 'lucide-react';
import { AppLayout } from '../components/common/AppLayout.jsx';
import { EmptyState, ErrorState, LoadingSkeleton } from '../components/common/StateViews.jsx';
import { GamifiedVideoQuizPlayer } from '../components/learning/GamifiedVideoQuizPlayer.jsx';
import { lmsApi } from '../services/lmsApi.js';

function formatTimer(seconds) {
  const safe = Math.max(0, seconds);
  const hrs = Math.floor(safe / 3600);
  const mins = Math.floor((safe % 3600) / 60);
  const secs = safe % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(hrs)}:${pad(mins)}:${pad(secs)}`;
}

/**
 * Dynamic Gamified Video Quiz Hub, Timed Practice Quizzes, Board Exams & Optional Leaderboard.
 * 100% database-backed — zero hardcoded questions, scores, or static rewards.
 */
export function QuizPage() {
  const [videoQuizzes, setVideoQuizzes] = useState([]);
  const [quizzes, setQuizzes] = useState([]);
  const [exams, setExams] = useState([]);
  const [gProfile, setGProfile] = useState(null);
  const [leaderboard, setLeaderboard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Active 4-Round Gamified Video Quiz
  const [activeGameQuizId, setActiveGameQuizId] = useState(null);

  // Active standard timed quiz session
  const [session, setSession] = useState(null);
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState({});
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);

  const loadAll = async () => {
    setLoading(true);
    setError(null);
    try {
      const [vqRes, qRes, eRes, gpRes, lbRes] = await Promise.all([
        lmsApi.getStudentVideoQuizzes().catch(() => ({ items: [] })),
        lmsApi.getStudentQuizzes().catch(() => ({ items: [] })),
        lmsApi.getStudentExams().catch(() => ({ items: [] })),
        lmsApi.getGamificationProfile().catch(() => null),
        lmsApi.getGamificationLeaderboard().catch(() => null),
      ]);
      setVideoQuizzes(vqRes.items || []);
      setQuizzes((qRes.items || []).filter((q) => !(vqRes.items || []).some((v) => v.id === q.id)));
      setExams(eRes.items || []);
      setGProfile(gpRes);
      setLeaderboard(lbRes);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, []);

  useEffect(() => {
    if (!session || result) return undefined;
    const id = setInterval(() => {
      const rem = Math.max(0, Math.floor((new Date(session.expiresAt).getTime() - Date.now()) / 1000));
      setSecondsLeft(rem);
      if (rem <= 0) {
        clearInterval(id);
        handleSubmitQuiz();
      }
    }, 1000);
    return () => clearInterval(id);
  }, [session, result]);

  const startStandardQuiz = async (quizId) => {
    setError(null);
    setResult(null);
    try {
      const started = await lmsApi.startStudentQuiz(quizId);
      setSession(started);
      setIndex(0);
      setAnswers({});
      setSecondsLeft(started.remainingSeconds || started.quiz.durationMinutes * 60);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleSubmitQuiz = async () => {
    if (!session || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const formatted = session.questions.map((q) => ({
        questionId: q.id,
        selectedOptionIndex: answers[q.id] !== undefined ? answers[q.id] : null,
      }));
      const res = await lmsApi.submitStudentQuiz(session.quiz.id, {
        attemptId: session.attemptId,
        answers: formatted,
      });
      setResult(res);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  // Active 4-Round Gamified Video Quiz Full-Focus View
  if (activeGameQuizId) {
    return (
      <AppLayout title="Video Challenge" showBack hideBottomNav>
        <GamifiedVideoQuizPlayer
          quizId={activeGameQuizId}
          onExit={() => {
            setActiveGameQuizId(null);
            loadAll();
          }}
        />
      </AppLayout>
    );
  }

  // Standard Quiz Result View
  if (session && result) {
    return (
      <AppLayout title="Quiz Result" showBack hideBottomNav>
        <div className="card" style={{ textAlign: 'center', padding: '24px 18px' }}>
          <Trophy size={38} color="#f59e0b" />
          <h2 style={{ margin: '8px 0 6px', fontSize: '1.25rem' }}>{result.passed ? 'Quiz Passed!' : 'Quiz Completed'}</h2>
          <p style={{ margin: '0 0 16px', color: 'var(--text-muted)', fontSize: '0.92rem' }}>
            Score: <strong>{result.score} / {result.totalMarks}</strong> ({result.percentage}%)
          </p>
          <button type="button" className="btn btn-primary btn-block" onClick={() => { setSession(null); setResult(null); loadAll(); }}>
            <RotateCcw size={16} /> Back to Tests &amp; Challenges
          </button>
        </div>
      </AppLayout>
    );
  }

  // Standard Quiz Active Runner
  if (session) {
    const current = session.questions[index];
    const selectedOpt = current ? answers[current.id] : undefined;
    return (
      <AppLayout
        title={session.quiz.title}
        showBack
        hideBottomNav
        rightAction={
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: 'rgba(255,255,255,0.18)', padding: '5px 10px', borderRadius: 999, fontSize: '0.82rem', fontWeight: 700 }}>
            <Clock size={14} /> <span>{formatTimer(secondsLeft)}</span>
          </div>
        }
      >
        {current && (
          <div style={{ display: 'flex', flexDirection: 'column', minHeight: 'calc(100dvh - 110px)' }}>
            <div style={{ fontSize: '1rem', fontWeight: 800, marginBottom: 12 }}>
              Question {index + 1} of {session.questions.length}
            </div>
            <div className="game-question-card">{current.questionText}</div>
            <div style={{ flex: 1 }}>
              {(current.options || []).map((opt, optIdx) => (
                <button
                  key={`${current.id}-${optIdx}`}
                  type="button"
                  className={`quiz-option-card ${selectedOpt === optIdx ? 'selected' : ''}`}
                  onClick={() => setAnswers((prev) => ({ ...prev, [current.id]: optIdx }))}
                >
                  <span className="quiz-radio-dot" aria-hidden="true" />
                  <span>{opt}</span>
                </button>
              ))}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.25fr', gap: 12, paddingTop: 14 }}>
              <button type="button" className="btn btn-outline" onClick={() => (index < session.questions.length - 1 ? setIndex((i) => i + 1) : handleSubmitQuiz())}>Skip</button>
              <button type="button" className="btn btn-primary" disabled={submitting} onClick={() => (index < session.questions.length - 1 ? setIndex((i) => i + 1) : handleSubmitQuiz())}>
                {index === session.questions.length - 1 ? (<><CheckCircle2 size={17} /> Submit</>) : 'Next'}
              </button>
            </div>
          </div>
        )}
      </AppLayout>
    );
  }

  return (
    <AppLayout title="Tests & Video Challenges" subtitle="4-Round Gamified Video Quizzes, XP, Badges & SSC Exams">
      {loading && <LoadingSkeleton rows={4} />}
      {!loading && error && <ErrorState message={error} onRetry={loadAll} />}

      {!loading && !error && (
        <>
          {/* Live Gamification Profile Card (XP, Level, Daily Streak, Personal Best & Badges) */}
          {gProfile && (
            <div className="card" style={{ background: 'linear-gradient(135deg, #1049c7 0%, #2563eb 100%)', color: '#fff', border: 'none' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <div>
                  <div style={{ fontSize: '0.72rem', opacity: 0.85, fontWeight: 700, textTransform: 'uppercase' }}>
                    Level {gProfile.level} Scholar
                  </div>
                  <div style={{ fontSize: '1.35rem', fontWeight: 800 }}>⚡ {gProfile.totalXp} XP</div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <div style={{ background: 'rgba(255,255,255,0.16)', borderRadius: 12, padding: '6px 10px', textAlign: 'center' }}>
                    <div style={{ fontWeight: 800, fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: 3 }}><Flame size={15} color="#fde047" /> {gProfile.currentDailyStreak}</div>
                    <div style={{ fontSize: '0.64rem', opacity: 0.85 }}>Streak</div>
                  </div>
                  <div style={{ background: 'rgba(255,255,255,0.16)', borderRadius: 12, padding: '6px 10px', textAlign: 'center' }}>
                    <div style={{ fontWeight: 800, fontSize: '0.95rem' }}>{gProfile.personalBestScorePct}%</div>
                    <div style={{ fontSize: '0.64rem', opacity: 0.85 }}>Best</div>
                  </div>
                </div>
              </div>
              <div style={{ height: 7, borderRadius: 999, background: 'rgba(255,255,255,0.25)', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${gProfile.progressInLevelPct || 0}%`, background: '#fde047', borderRadius: 999 }} />
              </div>
              <div style={{ fontSize: '0.7rem', opacity: 0.88, marginTop: 4 }}>
                {gProfile.totalXp} / {gProfile.nextLevelXp} XP to Level {gProfile.level + 1} &bull; {gProfile.achievements.length} Badges Unlocked
              </div>
            </div>
          )}

          {/* 4-Round Gamified Video Quizzes */}
          <h2 style={{ margin: '0 0 10px', fontSize: '1rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Zap size={18} color="#155EEF" /> Gamified Video Challenges
          </h2>
          {videoQuizzes.length === 0 ? (
            <EmptyState
              title="No Video Challenges Published Yet"
              description="Once your teacher approves and publishes a video-linked challenge in the Admin Portal, it will appear right here."
            />
          ) : (
            videoQuizzes.map((vq) => (
              <div key={vq.id} className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                <div style={{ minWidth: 0 }}>
                  <span className="badge badge-blue" style={{ marginBottom: 4 }}>{vq.subjectTitle}</span>
                  <div style={{ fontWeight: 800, fontSize: '0.94rem' }}>{vq.title}</div>
                  <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)', marginTop: 2 }}>
                    Video: {vq.lessonTitle} &bull; {vq.questionCount} Qs &bull; +{vq.xpPerCorrect} XP
                    {vq.bestScorePct !== null ? ` • Best: ${vq.bestScorePct}%` : ''}
                  </div>
                </div>
                <button type="button" className="btn btn-primary" style={{ minHeight: 38, padding: '6px 15px', fontSize: '0.82rem' }} onClick={() => setActiveGameQuizId(vq.id)}>
                  <Play size={14} fill="#fff" /> Play
                </button>
              </div>
            ))
          )}

          {/* Earned Badges & Achievements */}
          {(gProfile?.achievements || []).length > 0 && (
            <div className="card">
              <h3 style={{ margin: '0 0 10px', fontSize: '0.95rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: 6 }}>
                <Medal size={17} color="#f59e0b" /> Unlocked Badges &amp; Achievements
              </h3>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {gProfile.achievements.map((a) => (
                  <span key={a.id} className="badge badge-amber" style={{ padding: '5px 10px' }}>
                    🏅 {a.title}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Optional Admin-Controlled Board Leaderboard */}
          {leaderboard?.enabled && (leaderboard.entries || []).length > 0 && (
            <div className="card">
              <h3 style={{ margin: '0 0 10px', fontSize: '0.95rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: 6 }}>
                <Trophy size={17} color="#155EEF" /> {leaderboard.board} SSC Top Learners
              </h3>
              {leaderboard.entries.map((row) => (
                <div
                  key={row.rank}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    padding: '8px 10px',
                    borderRadius: 10,
                    background: row.isCurrentUser ? '#eff6ff' : 'transparent',
                    fontWeight: row.isCurrentUser ? 800 : 600,
                    fontSize: '0.84rem',
                  }}
                >
                  <span>#{row.rank} {row.studentName} (Lvl {row.level})</span>
                  <span style={{ color: '#155EEF' }}>{row.totalXp} XP • {row.dailyStreak}🔥</span>
                </div>
              ))}
            </div>
          )}

          {/* Other Published Practice Quizzes & Exams */}
          {quizzes.length > 0 && (
            <>
              <h2 style={{ margin: '16px 0 10px', fontSize: '1rem', fontWeight: 800 }}>Timed Practice Tests</h2>
              {quizzes.map((q) => (
                <div key={q.id} className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                  <div>
                    <div style={{ fontWeight: 800, fontSize: '0.92rem' }}>{q.title}</div>
                    <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>
                      {q.questionCount} Qs &bull; {q.durationMinutes} Mins
                    </div>
                  </div>
                  <button type="button" className="btn btn-outline" style={{ minHeight: 36, padding: '5px 14px', fontSize: '0.8rem' }} onClick={() => startStandardQuiz(q.id)}>
                    Start
                  </button>
                </div>
              ))}
            </>
          )}

          {exams.length > 0 && (
            <>
              <h2 style={{ margin: '16px 0 10px', fontSize: '1rem', fontWeight: 800 }}>Scheduled SSC Examinations</h2>
              {exams.map((ex) => (
                <div key={ex.id} className="card" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <Award size={26} color="#1152d4" />
                  <div>
                    <div style={{ fontWeight: 800, fontSize: '0.92rem' }}>{ex.name}</div>
                    <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>
                      {new Date(ex.examDate).toLocaleString('en-IN')} &bull; {ex.durationMinutes} Mins &bull; {ex.totalMarks} Marks
                    </div>
                  </div>
                </div>
              ))}
            </>
          )}
        </>
      )}
    </AppLayout>
  );
}
