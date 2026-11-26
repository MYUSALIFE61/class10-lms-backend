import React, { useEffect, useState, useRef } from 'react';
import {
  Zap,
  Brain,
  Target,
  Trophy,
  Flame,
  Volume2,
  VolumeX,
  Clock,
  CheckCircle2,
  XCircle,
  SkipForward,
  BookOpen,
  Sparkles,
  RotateCcw,
  ListChecks,
} from 'lucide-react';
import { lmsApi } from '../../services/lmsApi.js';

const ROUND_META = {
  quick_challenge: {
    label: 'Quick Challenge',
    badgeBg: 'linear-gradient(90deg, #0284c7, #38bdf8)',
    icon: Zap,
  },
  brain_battle: {
    label: 'Brain Battle',
    badgeBg: 'linear-gradient(90deg, #4f46e5, #6366f1)',
    icon: Brain,
  },
  master_challenge: {
    label: 'Master Challenge',
    badgeBg: 'linear-gradient(90deg, #7c3aed, #a855f7)',
    icon: Target,
  },
  victory_round: {
    label: 'Victory Round',
    badgeBg: 'linear-gradient(90deg, #d97706, #f59e0b)',
    icon: Trophy,
  },
};

function playFeedbackTone(kind, muted) {
  if (muted || typeof window === 'undefined') return;
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;
    const playNote = (freq, start, dur, type = 'sine', gainVal = 0.08) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, start);
      gain.gain.setValueAtTime(gainVal, start);
      gain.gain.exponentialRampToValueAtTime(0.001, start + dur);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + dur);
    };

    if (kind === 'correct') {
      playNote(523.25, now, 0.12);
      playNote(659.25, now + 0.09, 0.18);
    } else if (kind === 'wrong') {
      playNote(240, now, 0.18, 'triangle', 0.07);
    } else if (kind === 'victory') {
      playNote(523.25, now, 0.14);
      playNote(659.25, now + 0.1, 0.14);
      playNote(783.99, now + 0.2, 0.18);
      playNote(1046.5, now + 0.32, 0.3);
    }
    setTimeout(() => ctx.close().catch(() => {}), 900);
  } catch {
    // Ignore audio context restriction
  }
}

function formatSec(sec) {
  const s = Math.max(0, Number(sec || 0));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
}

export function GamifiedVideoQuizPlayer({ quizId, onExit, onCompleted }) {
  const [session, setSession] = useState(null);
  const [index, setIndex] = useState(0);
  const [feedbackMap, setFeedbackMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState('');
  const [muted, setMuted] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(null);
  const [xpPop, setXpPop] = useState(null);
  const [showReviewDrawer, setShowReviewDrawer] = useState(false);
  const [sessionXp, setSessionXp] = useState(0);
  const [streak, setStreak] = useState(0);
  const timerRef = useRef(null);

  const startSession = async () => {
    setLoading(true);
    setError('');
    setSummary(null);
    setFeedbackMap({});
    setIndex(0);
    setSessionXp(0);
    setStreak(0);
    try {
      const started = await lmsApi.startGamifiedVideoQuiz(quizId);
      setSession(started);
      setSecondsLeft(started.quiz.timerEnabled ? started.remainingSeconds : null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (quizId) startSession();
  }, [quizId]);

  useEffect(() => {
    if (!session || !session.quiz.timerEnabled || summary) return undefined;
    timerRef.current = setInterval(() => {
      const rem = Math.max(0, Math.floor((new Date(session.expiresAt).getTime() - Date.now()) / 1000));
      setSecondsLeft(rem);
      if (rem <= 0) {
        clearInterval(timerRef.current);
        handleFinish();
      }
    }, 1000);
    return () => clearInterval(timerRef.current);
  }, [session, summary]);

  const handleAnswer = async (optIdx) => {
    if (!session || checking) return;
    const q = session.questions[index];
    if (feedbackMap[q.id] && !feedbackMap[q.id].skipped) return;

    setChecking(true);
    setError('');
    try {
      const fb = await lmsApi.answerGamifiedQuestion(session.attemptId, {
        questionId: q.id,
        selectedOptionIndex: optIdx,
        skipped: false,
      });
      setFeedbackMap((prev) => ({ ...prev, [q.id]: fb }));
      setStreak(fb.currentStreak || 0);
      const gained = Number(fb.xpAwarded || 0) + Number(fb.streakBonusXp || 0);
      if (gained > 0) {
        setSessionXp((prev) => prev + gained);
        setXpPop(fb.streakBonusXp > 0 ? `+${gained} XP (🔥 ${fb.currentStreak}x Streak!)` : `+${gained} XP`);
        setTimeout(() => setXpPop(null), 1600);
      }
      playFeedbackTone(fb.isCorrect ? 'correct' : 'wrong', muted);
    } catch (err) {
      setError(err.message);
    } finally {
      setChecking(false);
    }
  };

  const handleSkip = async () => {
    if (!session || checking) return;
    const q = session.questions[index];
    setChecking(true);
    try {
      const fb = await lmsApi.answerGamifiedQuestion(session.attemptId, {
        questionId: q.id,
        skipped: true,
      });
      setFeedbackMap((prev) => ({ ...prev, [q.id]: fb }));
      setStreak(0);
      if (index < session.questions.length - 1) {
        setIndex((i) => i + 1);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setChecking(false);
    }
  };

  const handleFinish = async () => {
    if (!session || completing) return;
    setCompleting(true);
    setError('');
    try {
      const res = await lmsApi.completeGamifiedQuiz(session.attemptId);
      setSummary(res);
      playFeedbackTone('victory', muted);
      onCompleted?.(res);
    } catch (err) {
      setError(err.message);
    } finally {
      setCompleting(false);
    }
  };

  if (loading) {
    return (
      <div className="card" style={{ textAlign: 'center', padding: 28 }}>
        <Sparkles size={28} color="#155EEF" />
        <div style={{ marginTop: 8, fontWeight: 700 }}>Preparing 4-Round Video Challenge...</div>
      </div>
    );
  }

  if (error && !session) {
    return (
      <div className="card" style={{ textAlign: 'center', padding: 20 }}>
        <div style={{ color: '#dc2626', fontWeight: 700, marginBottom: 10 }}>{error}</div>
        <button type="button" className="btn btn-primary" onClick={startSession}>Retry</button>
      </div>
    );
  }

  // Victory Summary Screen
  if (summary) {
    return (
      <div className="card" style={{ padding: 20 }}>
        <div style={{ textAlign: 'center', marginBottom: 16 }}>
          <div style={{ width: 72, height: 72, borderRadius: '50%', background: 'linear-gradient(135deg, #fde68a, #f59e0b)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 8px 22px rgba(245, 158, 11, 0.32)' }}>
            <Trophy size={36} color="#ffffff" />
          </div>
          <h2 style={{ margin: '10px 0 4px', fontSize: '1.3rem', fontWeight: 800 }}>
            {summary.passed ? 'Challenge Conquered!' : 'Great Effort — Keep Practicing!'}
          </h2>
          {summary.isNewPersonalBest && (
            <span className="badge badge-amber" style={{ marginBottom: 8 }}>⭐ New Personal Best!</span>
          )}
          <div style={{ fontSize: '0.92rem', color: 'var(--text-muted)' }}>
            Score: <strong>{summary.score}/{summary.totalMarks}</strong> ({summary.percentage}%) &bull; Max Streak: <strong>{summary.maxStreak}🔥</strong>
          </div>
        </div>

        {/* XP, Level & Daily Streak Box */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 14 }}>
          <div style={{ background: '#eff6ff', borderRadius: 14, padding: '10px 6px', textAlign: 'center' }}>
            <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#155EEF' }}>+{summary.totalSessionXp}</div>
            <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)' }}>XP Earned</div>
          </div>
          <div style={{ background: '#ecfdf5', borderRadius: 14, padding: '10px 6px', textAlign: 'center' }}>
            <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#059669' }}>Lvl {summary.profile.level}</div>
            <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)' }}>{summary.profile.totalXp} Total XP</div>
          </div>
          <div style={{ background: '#fff7ed', borderRadius: 14, padding: '10px 6px', textAlign: 'center' }}>
            <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#ea580c' }}>{summary.profile.currentDailyStreak}🔥</div>
            <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)' }}>Day Streak</div>
          </div>
        </div>

        {/* Understanding & Consistency Bonus Breakdown */}
        {(summary.bonusBreakdown || []).length > 0 && (
          <div style={{ background: '#f5f3ff', border: '1px solid #ddd6fe', borderRadius: 14, padding: '10px 12px', marginBottom: 14 }}>
            <div style={{ fontSize: '0.76rem', fontWeight: 800, color: '#6d28d9', marginBottom: 4 }}>
              Understanding &amp; Consistency Bonuses
            </div>
            {summary.bonusBreakdown.map((b, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', fontWeight: 600 }}>
                <span>{b.label}</span>
                <span style={{ color: '#6d28d9' }}>+{b.xp} XP</span>
              </div>
            ))}
          </div>
        )}

        {/* Newly Unlocked Badges & Chapter/Subject Achievements */}
        {(summary.newlyUnlockedAchievements || []).length > 0 && (
          <div style={{ background: '#fefce8', border: '1px solid #fde047', borderRadius: 14, padding: '10px 12px', marginBottom: 14 }}>
            <div style={{ fontSize: '0.78rem', fontWeight: 800, color: '#854d0e', marginBottom: 6 }}>
              🏅 New Achievements Unlocked!
            </div>
            {summary.newlyUnlockedAchievements.map((a) => (
              <div key={a.id} style={{ fontSize: '0.8rem', fontWeight: 700, color: '#713f12', marginBottom: 3 }}>
                • {a.badge_title} (+{a.xp_reward} XP)
              </div>
            ))}
          </div>
        )}

        {/* Detailed Explanation Review */}
        <div style={{ maxHeight: 280, overflowY: 'auto', marginBottom: 14 }}>
          {(summary.results || []).map((r, idx) => (
            <div
              key={r.questionId}
              style={{
                padding: '9px 11px',
                borderRadius: 12,
                background: r.isCorrect ? '#ecfdf5' : '#fef2f2',
                border: `1px solid ${r.isCorrect ? '#a7f3d0' : '#fecaca'}`,
                marginBottom: 8,
                fontSize: '0.8rem',
              }}
            >
              <div style={{ fontWeight: 700 }}>{idx + 1}. {r.questionText}</div>
              <div style={{ fontWeight: 700, color: r.isCorrect ? '#047857' : '#b91c1c', marginTop: 2 }}>
                Correct: {r.options[r.correctOptionIndex]}
              </div>
              {r.explanation && <div style={{ color: 'var(--text-muted)', marginTop: 2 }}>{r.explanation}</div>}
            </div>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <button type="button" className="btn btn-outline" onClick={startSession}>
            <RotateCcw size={15} /> Play Again
          </button>
          <button type="button" className="btn btn-primary" onClick={onExit}>
            Done
          </button>
        </div>
      </div>
    );
  }

  const currentQ = session.questions[index];
  const fb = feedbackMap[currentQ.id];
  const locked = Boolean(fb && !fb.skipped);
  const roundInfo = ROUND_META[currentQ.roundType] || ROUND_META.quick_challenge;
  const RoundIcon = roundInfo.icon;
  const answeredCount = Object.values(feedbackMap).filter((x) => !x.skipped).length;
  const progressPct = Math.round(((index + 1) / session.questions.length) * 100);

  return (
    <div className="game-quiz-shell" role="region" aria-label="Gamified Video Quiz">
      {/* Top HUD: Round Badge, XP, Streak, Optional Timer & Accessible Sound Toggle */}
      <div className="game-hud-bar">
        <span className="game-round-pill" style={{ background: roundInfo.badgeBg }}>
          <RoundIcon size={14} /> {roundInfo.label}
        </span>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="game-hud-chip" style={{ background: '#eff6ff', color: '#155EEF' }}>
            ⚡ {sessionXp} XP
          </span>
          {streak > 0 && (
            <span className="game-hud-chip" style={{ background: '#fff7ed', color: '#ea580c' }}>
              <Flame size={13} /> {streak}
            </span>
          )}
          {session.quiz.timerEnabled && secondsLeft !== null && (
            <span className="game-hud-chip" style={{ background: secondsLeft < 60 ? '#fee2e2' : '#f1f5f9', color: secondsLeft < 60 ? '#dc2626' : '#0f214d' }}>
              <Clock size={13} /> {formatSec(secondsLeft)}
            </span>
          )}
          <button
            type="button"
            aria-label={muted ? 'Unmute quiz sounds' : 'Mute quiz sounds'}
            aria-pressed={muted}
            onClick={() => setMuted((m) => !m)}
            style={{ border: '1px solid #dbe7fb', background: '#fff', borderRadius: 9, width: 32, height: 32, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#0f214d' }}
          >
            {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
          </button>
        </div>
      </div>

      {/* Animated XP Float Banner */}
      {xpPop && (
        <div className="game-xp-float" role="status" aria-live="polite">
          {xpPop}
        </div>
      )}

      {/* Question Progress Bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: 6 }}>
        <span>Question {index + 1} of {session.questions.length}</span>
        {currentQ.conceptTag && <span style={{ color: '#155EEF' }}>{currentQ.conceptTag}</span>}
      </div>
      <div className="progress-bar-track" style={{ height: 8, marginBottom: 14 }}>
        <div className="progress-bar-fill" style={{ width: `${progressPct}%` }} />
      </div>

      {error && (
        <div style={{ background: '#fef2f2', color: '#b91c1c', padding: '8px 12px', borderRadius: 10, fontSize: '0.8rem', fontWeight: 700, marginBottom: 10 }}>
          {error}
        </div>
      )}

      {/* Question Card */}
      <div className="game-question-card">
        {currentQ.questionText}
      </div>

      {/* 4 Animated MCQ Options */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 14 }}>
        {currentQ.options.map((opt, oi) => {
          let stateClass = '';
          if (locked) {
            if (oi === fb.correctOptionIndex) stateClass = 'correct';
            else if (oi === fb.selectedOptionIndex && !fb.isCorrect) stateClass = 'wrong';
          }
          return (
            <button
              key={`${currentQ.id}-${oi}`}
              type="button"
              disabled={locked || checking}
              onClick={() => handleAnswer(oi)}
              className={`game-option-btn ${stateClass}`}
            >
              <span className="game-opt-letter">{String.fromCharCode(65 + oi)}</span>
              <span style={{ flex: 1 }}>{opt}</span>
              {locked && oi === fb.correctOptionIndex && <CheckCircle2 size={20} color="#059669" />}
              {locked && oi === fb.selectedOptionIndex && !fb.isCorrect && <XCircle size={20} color="#dc2626" />}
            </button>
          );
        })}
      </div>

      {/* Immediate Server Explanation & Reference Material Card */}
      {locked && (
        <div
          className={`game-explanation-card ${fb.isCorrect ? 'is-correct' : 'is-wrong'}`}
          role="status"
          aria-live="polite"
        >
          <div style={{ fontWeight: 800, marginBottom: 4 }}>
            {fb.isCorrect ? 'Spot on! Concept Understood ✓' : 'Good try — learn the concept below:'}
          </div>
          <div style={{ fontSize: '0.84rem', lineHeight: 1.45 }}>{fb.explanation}</div>
          {fb.referenceNote && (
            <div style={{ marginTop: 6, fontSize: '0.75rem', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 5, opacity: 0.9 }}>
              <BookOpen size={13} /> {fb.referenceNote}
            </div>
          )}
        </div>
      )}

      {/* Action Footer: Skip, Review Drawer, Next / Complete */}
      <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
        {session.quiz.allowReview && (
          <button
            type="button"
            className="btn btn-outline"
            style={{ minHeight: 44, padding: '0 12px', fontSize: '0.8rem' }}
            onClick={() => setShowReviewDrawer((s) => !s)}
          >
            <ListChecks size={16} /> Review ({answeredCount}/{session.questions.length})
          </button>
        )}

        {session.quiz.allowSkip && !locked && (
          <button
            type="button"
            className="btn btn-outline"
            style={{ minHeight: 44, padding: '0 14px', fontSize: '0.82rem' }}
            onClick={handleSkip}
            disabled={checking}
          >
            <SkipForward size={15} /> Skip
          </button>
        )}

        {index < session.questions.length - 1 ? (
          <button
            type="button"
            className="btn btn-primary"
            style={{ flex: 1, minHeight: 44 }}
            disabled={!locked && !session.quiz.allowSkip}
            onClick={() => setIndex((i) => i + 1)}
          >
            Next Question →
          </button>
        ) : (
          <button
            type="button"
            className="btn btn-emerald"
            style={{ flex: 1, minHeight: 44 }}
            disabled={completing}
            onClick={handleFinish}
          >
            <Trophy size={16} /> {completing ? 'Calculating Rewards...' : 'Finish & Claim XP'}
          </button>
        )}
      </div>

      {/* Optional Review Jump Bar */}
      {showReviewDrawer && session.quiz.allowReview && (
        <div className="card" style={{ marginTop: 12, padding: 12 }}>
          <div style={{ fontSize: '0.76rem', fontWeight: 800, marginBottom: 8 }}>Jump to Question:</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {session.questions.map((q, qIdx) => {
              const st = feedbackMap[q.id];
              const bg = !st ? '#f1f5f9' : st.skipped ? '#fef3c7' : st.isCorrect ? '#dcfce7' : '#fee2e2';
              return (
                <button
                  key={q.id}
                  type="button"
                  onClick={() => {
                    setIndex(qIdx);
                    setShowReviewDrawer(false);
                  }}
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: 10,
                    border: qIdx === index ? '2px solid #155EEF' : '1px solid #cbd5e1',
                    background: bg,
                    fontWeight: 800,
                    fontSize: '0.78rem',
                    cursor: 'pointer',
                  }}
                >
                  {qIdx + 1}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
