import { assertSubjectScope } from './adminRbac.js';
import { ForbiddenError, NotFoundError, ValidationError } from '../utils/errors.js';

export const GAME_ROUNDS = [
  { key: 'quick_challenge', label: 'Quick Challenge', difficulty: 'easy', subtitle: 'Warm-up & key definitions from this video' },
  { key: 'brain_battle', label: 'Brain Battle', difficulty: 'medium', subtitle: 'Conceptual understanding taught in the lesson' },
  { key: 'master_challenge', label: 'Master Challenge', difficulty: 'hard', subtitle: 'Application & problem solving from this topic' },
  { key: 'victory_round', label: 'Victory Round', difficulty: 'hard', subtitle: 'Bonus high-XP mastery challenge' },
];

const ROUND_ORDER = new Map(GAME_ROUNDS.map((r, i) => [r.key, i]));

export function computeLevelFromXp(totalXp = 0) {
  // Progressive leveling: Level 1 (0 XP), Level 2 (150 XP), Level 3 (350 XP), etc.
  const xp = Math.max(0, Number(totalXp || 0));
  let level = 1;
  let threshold = 0;
  let step = 150;
  while (xp >= threshold + step) {
    threshold += step;
    level += 1;
    step += 50;
  }
  return {
    level,
    currentLevelFloorXp: threshold,
    nextLevelXp: threshold + step,
    progressInLevelPct: Math.min(100, Math.round(((xp - threshold) / step) * 100)),
  };
}

function normalizeBoardCodes(codes) {
  if (Array.isArray(codes) && codes.length > 0) {
    return [...new Set(codes.map((b) => String(b).toUpperCase()))];
  }
  return ['AP', 'TS'];
}

function todayDateKey(d = new Date()) {
  return d.toISOString().slice(0, 10);
}

function daysBetweenDateKeys(prevKey, currKey) {
  if (!prevKey || !currKey) return 999;
  const a = new Date(`${prevKey}T00:00:00Z`).getTime();
  const b = new Date(`${currKey}T00:00:00Z`).getTime();
  return Math.round((b - a) / (24 * 60 * 60 * 1000));
}

/**
 * Extracts grounded concept MCQs directly from the actual video lesson transcript.
 * Uses Gemini API if GEMINI_API_KEY is configured in environment; otherwise runs a
 * deterministic transcript sentence & concept extractor so every generated question
 * is 100% grounded in the uploaded video transcript (never generic/unrelated filler).
 */
async function generateMcqsFromTranscript({ lesson, transcriptText, count = 6, roundType = null }) {
  const cleanTranscript = String(transcriptText || '').trim();
  if (cleanTranscript.length < 40) {
    throw new ValidationError(
      'Please provide a video transcript (at least 40 characters) so AI questions stay strictly grounded in the lesson.'
    );
  }

  // Optional live Gemini generation if admin configured GEMINI_API_KEY
  if (process.env.GEMINI_API_KEY) {
    try {
      const prompt = [
        `You are a Class 10 AP & Telangana SSC teacher whose video explanation uses Telugu-English mixed terminology (TE_EN_MIX).`,
        `Generate EXACTLY ${count} 4-option multiple-choice questions strictly based on the following video lesson transcript.`,
        `Lesson Title: ${lesson.title}`,
        `Transcript:\n${cleanTranscript}`,
        `Rules:`,
        `- Every question MUST come strictly from facts, formulas, definitions, or examples in this transcript.`,
        `- Use clear, simple, student-friendly English keeping lesson terminology consistent.`,
        `- Return ONLY valid JSON array of objects with keys: questionText, options (array of 4 strings), correctOptionIndex (0-3), explanation, conceptTag, roundType (one of quick_challenge, brain_battle, master_challenge, victory_round), difficulty (easy|medium|hard), transcriptExcerpt.`,
      ].join('\n');

      const resp = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${encodeURIComponent(process.env.GEMINI_API_KEY)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.3, responseMimeType: 'application/json' },
          }),
        }
      );
      if (resp.ok) {
        const json = await resp.json();
        const rawText = json?.candidates?.[0]?.content?.parts?.[0]?.text || '';
        const parsed = JSON.parse(rawText);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed.slice(0, count).map((item, idx) => ({
            questionText: String(item.questionText || '').trim(),
            options: Array.isArray(item.options) ? item.options.slice(0, 4).map(String) : [],
            correctOptionIndex: Number(item.correctOptionIndex ?? 0),
            explanation: String(item.explanation || '').trim(),
            conceptTag: String(item.conceptTag || lesson.title).trim(),
            roundType: roundType || item.roundType || GAME_ROUNDS[idx % 4].key,
            difficulty: item.difficulty || 'medium',
            transcriptExcerpt: String(item.transcriptExcerpt || '').trim(),
          }));
        }
      }
    } catch {
      // Fall through cleanly to deterministic transcript extractor
    }
  }

  // Deterministic transcript-grounded extractor (zero external dependency, strictly from transcript sentences)
  const sentences = cleanTranscript
    .split(/(?<=[.!?।])\s+|\r?\n+/)
    .map((s) => s.replace(/^[\d.\-*•\s]+/, '').trim())
    .filter((s) => s.length >= 18);

  if (sentences.length === 0) {
    throw new ValidationError('Transcript must contain clear sentences or bullet concepts taught in the video.');
  }

  // Extract salient key terms / formulas from the transcript for plausible distractors
  const extractedFacts = sentences.map((sentence) => {
    const eqMatch = sentence.match(/([A-Za-z0-9²³√θπ+\-*/\s]+=\s*[A-Za-z0-9²³√θπ+\-*/(),\s≤≥<>]+)/);
    const defMatch = sentence.match(/^([A-Za-z0-9\s'’()-]{3,42})\s+(?:is defined as|is called|means|is|refers to|represents|equals|gives)\s+(.{8,140})/i);
    if (defMatch) {
      return {
        term: defMatch[1].trim(),
        answer: defMatch[2].replace(/[.!?]+$/, '').trim(),
        sentence,
        kind: 'definition',
      };
    }
    if (eqMatch) {
      const expr = eqMatch[1].trim().replace(/[.!?]+$/, '');
      return {
        term: sentence.replace(eqMatch[1], 'the formula').slice(0, 64).trim(),
        answer: expr,
        sentence,
        kind: 'formula',
      };
    }
    const words = sentence.split(/\s+/);
    const keyPhrase = words.slice(0, Math.min(4, words.length)).join(' ').replace(/[,:;-]+$/, '');
    return {
      term: keyPhrase,
      answer: sentence.replace(/[.!?]+$/, ''),
      sentence,
      kind: 'concept',
    };
  });

  const roundSequence = ['quick_challenge', 'brain_battle', 'master_challenge', 'victory_round'];
  const difficultyByRound = {
    quick_challenge: 'easy',
    brain_battle: 'medium',
    master_challenge: 'hard',
    victory_round: 'hard',
  };

  const generated = [];
  for (let i = 0; i < Math.min(count, Math.max(sentences.length, count)); i += 1) {
    const fact = extractedFacts[i % extractedFacts.length];
    const assignedRound = roundType || roundSequence[i % roundSequence.length];
    const otherAnswers = extractedFacts
      .filter((f) => f.answer !== fact.answer)
      .map((f) => f.answer)
      .slice(0, 3);

    const fallbackDistractors = [
      `None of the concepts taught in "${lesson.title}"`,
      `The opposite relationship of ${fact.term}`,
      `Only applicable when all values are zero`,
      `Unrelated to ${lesson.title}`,
    ];
    while (otherAnswers.length < 3) {
      otherAnswers.push(fallbackDistractors[otherAnswers.length]);
    }

    const correctIdx = i % 4;
    const options = [...otherAnswers.slice(0, 3)];
    options.splice(correctIdx, 0, fact.answer);

    let questionText;
    if (fact.kind === 'formula') {
      questionText = `In "${lesson.title}", which formula/relation is taught in this video lesson?`;
    } else if (fact.kind === 'definition') {
      questionText =
        assignedRound === 'quick_challenge'
          ? `According to the video lesson "${lesson.title}", what is ${fact.term}?`
          : assignedRound === 'brain_battle'
            ? `Concept Check (${lesson.title}): Which statement accurately explains ${fact.term}?`
            : `Application (${lesson.title}): When applying ${fact.term}, which rule holds true as explained in the video?`;
    } else {
      questionText =
        assignedRound === 'victory_round'
          ? `Bonus Challenge (${lesson.title}): Which key takeaway from the video lesson is completely accurate?`
          : `Based on the video "${lesson.title}", which statement matches the concept about "${fact.term}"?`;
    }

    // Disambiguate if repeating same sentence on short transcripts
    if (i >= extractedFacts.length) {
      questionText = `[Review #${i + 1}] ${questionText}`;
    }

    generated.push({
      questionText,
      options: options.slice(0, 4),
      correctOptionIndex: correctIdx,
      explanation: `From video transcript: "${fact.sentence}"`,
      conceptTag: fact.term.slice(0, 48) || lesson.title,
      roundType: assignedRound,
      difficulty: difficultyByRound[assignedRound] || 'medium',
      transcriptExcerpt: fact.sentence,
    });
  }

  return generated;
}

export class GamifiedQuizService {
  constructor({ store, adminAuthService, subscriptionService }) {
    this.store = store;
    this.adminAuthService = adminAuthService;
    this.subscriptionService = subscriptionService;
  }

  // ---- 1. Admin: Save Video Transcript & Generate AI MCQs (Pending Approval) ----
  async updateLessonTranscript({ admin, lessonId, transcriptText, keyConcepts = [], ipAddress }) {
    const lesson = await this.store.getLessonById(lessonId);
    if (!lesson) throw new NotFoundError('Video lesson not found');
    assertSubjectScope(admin, lesson.subject_id);

    const updated = await this.store.updateLesson(lessonId, {
      transcript_text: String(transcriptText || ''),
      key_concepts_json: Array.isArray(keyConcepts) ? keyConcepts : [],
    });

    await this.adminAuthService.recordAudit({
      admin,
      action: 'lesson.transcript_update',
      entityType: 'lesson',
      entityId: lessonId,
      summary: `Updated video transcript for "${lesson.title}" (${String(transcriptText || '').length} chars)`,
      ipAddress,
    });
    return updated;
  }

  async generateAiQuestionsForLesson({ admin, lessonId, transcriptText = null, count = 6, roundType = null, ipAddress }) {
    const lesson = await this.store.getLessonById(lessonId);
    if (!lesson) throw new NotFoundError('Video lesson not found');
    assertSubjectScope(admin, lesson.subject_id);

    const activeTranscript = transcriptText !== null ? transcriptText : lesson.transcript_text || lesson.description;
    if (transcriptText !== null) {
      await this.store.updateLesson(lessonId, { transcript_text: String(transcriptText) });
    }

    const drafts = await generateMcqsFromTranscript({
      lesson,
      transcriptText: activeTranscript,
      count: Math.min(20, Math.max(1, Number(count || 6))),
      roundType,
    });

    const saved = [];
    for (const q of drafts) {
      if (!q.questionText || q.options.length !== 4) continue;
      const rec = await this.store.createQuestion({
        question_text: q.questionText,
        question_type: 'mcq',
        subject_id: lesson.subject_id,
        chapter_id: lesson.chapter_id,
        topic_id: lesson.topic_id || null,
        lesson_id: lesson.id,
        difficulty: q.difficulty || 'medium',
        round_type: q.roundType || 'quick_challenge',
        concept_tag: q.conceptTag || lesson.title,
        options_json: q.options,
        correct_option_index: q.correctOptionIndex,
        explanation: q.explanation,
        reference_note: `Video Lesson: ${lesson.title}`,
        transcript_excerpt: q.transcriptExcerpt || '',
        source_origin: 'ai_transcript',
        ai_approval_status: 'pending_review', // MUST be approved by Admin before publishing!
        marks: q.roundType === 'victory_round' ? 2 : 1,
        negative_marks: 0,
        board_codes: normalizeBoardCodes(lesson.board_codes),
        language: 'TE_EN_MIX',
        status: 'draft',
      });
      saved.push(rec);
    }

    await this.adminAuthService.recordAudit({
      admin,
      action: 'video_quiz.ai_generate',
      entityType: 'lesson',
      entityId: lessonId,
      summary: `Generated ${saved.length} AI draft MCQs from transcript of "${lesson.title}" (pending admin approval)`,
      ipAddress,
    });

    return { lessonId, generatedCount: saved.length, items: saved };
  }

  async reviewAiQuestion({ admin, questionId, decision, patch = {}, ipAddress }) {
    const q = await this.store.getQuestionById(questionId);
    if (!q) throw new NotFoundError('Question not found');
    assertSubjectScope(admin, q.subject_id);

    if (!['approved', 'rejected'].includes(decision)) {
      throw new ValidationError('Decision must be "approved" or "rejected"');
    }

    const dbPatch = {
      ai_approval_status: decision,
      status: decision === 'approved' ? 'published' : 'archived',
      ...(patch.questionText ? { question_text: patch.questionText.trim() } : {}),
      ...(Array.isArray(patch.options) && patch.options.length === 4 ? { options_json: patch.options } : {}),
      ...(patch.correctOptionIndex !== undefined ? { correct_option_index: Number(patch.correctOptionIndex) } : {}),
      ...(patch.explanation !== undefined ? { explanation: patch.explanation } : {}),
      ...(patch.referenceNote !== undefined ? { reference_note: patch.referenceNote } : {}),
      ...(patch.roundType ? { round_type: patch.roundType } : {}),
      ...(patch.conceptTag !== undefined ? { concept_tag: patch.conceptTag } : {}),
    };

    const updated = await this.store.updateQuestion(questionId, dbPatch);
    await this.adminAuthService.recordAudit({
      admin,
      action: `video_quiz.question_${decision}`,
      entityType: 'question',
      entityId: questionId,
      summary: `Admin ${decision} AI question for lesson ${q.lesson_id}`,
      ipAddress,
    });
    return updated;
  }

  async createManualVideoQuestion({ admin, lessonId, data, ipAddress }) {
    const lesson = await this.store.getLessonById(lessonId);
    if (!lesson) throw new NotFoundError('Video lesson not found');
    assertSubjectScope(admin, lesson.subject_id);

    const options = Array.isArray(data.options) ? data.options.map((o) => String(o || '').trim()).filter(Boolean) : [];
    if (options.length !== 4) {
      throw new ValidationError('Gamified video MCQs must have exactly 4 non-empty options.');
    }
    const idx = Number(data.correctOptionIndex);
    if (!Number.isInteger(idx) || idx < 0 || idx > 3) {
      throw new ValidationError('Correct option index must be between 0 and 3.');
    }

    const rec = await this.store.createQuestion({
      question_text: String(data.questionText || '').trim(),
      question_type: 'mcq',
      subject_id: lesson.subject_id,
      chapter_id: lesson.chapter_id,
      topic_id: lesson.topic_id || null,
      lesson_id: lesson.id,
      difficulty: data.difficulty || 'medium',
      round_type: data.roundType || 'quick_challenge',
      concept_tag: data.conceptTag || lesson.title,
      options_json: options,
      correct_option_index: idx,
      explanation: String(data.explanation || '').trim(),
      reference_note: String(data.referenceNote || '').trim(),
      transcript_excerpt: String(data.transcriptExcerpt || '').trim(),
      source_origin: 'manual',
      ai_approval_status: 'approved',
      marks: Number(data.marks || 1),
      negative_marks: Number(data.negativeMarks || 0),
      board_codes: normalizeBoardCodes(data.boardCodes || lesson.board_codes),
      language: 'TE_EN_MIX',
      status: data.status || 'published',
    });

    await this.adminAuthService.recordAudit({
      admin,
      action: 'video_quiz.question_create',
      entityType: 'question',
      entityId: rec.id,
      summary: `Added manual ${rec.round_type} MCQ to video "${lesson.title}"`,
      ipAddress,
    });
    return rec;
  }

  async listLessonQuestionsForAdmin(lessonId) {
    return this.store.listQuestions({ lessonId, includeAll: true });
  }

  // ---- 2. Admin: Create / Configure / Publish Video-Linked Gamified Quiz ----
  async createOrUpdateVideoQuiz({ admin, quizId = null, data, ipAddress }) {
    const lesson = await this.store.getLessonById(data.lessonId);
    if (!lesson) throw new NotFoundError('Target video lesson not found');
    assertSubjectScope(admin, lesson.subject_id);

    // Strictly enforce: ONLY approved & published questions belonging to THIS EXACT video lesson!
    const lessonQuestions = await this.store.listQuestions({ lessonId: lesson.id, includeAll: true });
    const approvedMap = new Map(
      lessonQuestions
        .filter((q) => (q.ai_approval_status || 'approved') === 'approved' && q.status !== 'archived')
        .map((q) => [q.id, q])
    );

    let chosenIds = [];
    if (Array.isArray(data.questionIds) && data.questionIds.length > 0) {
      for (const qId of data.questionIds) {
        if (!approvedMap.has(qId)) {
          throw new ValidationError(
            'All quiz questions must belong to the selected video lesson and be admin-approved before inclusion.'
          );
        }
        chosenIds.push(qId);
      }
    } else {
      // Auto-assemble from approved questions for this lesson sorted by the 4 gamified rounds
      const maxQ = Number(data.questionCount || 10);
      chosenIds = [...approvedMap.values()]
        .filter((q) => q.status === 'published')
        .sort((a, b) => (ROUND_ORDER.get(a.round_type) ?? 9) - (ROUND_ORDER.get(b.round_type) ?? 9))
        .slice(0, maxQ)
        .map((q) => q.id);
    }

    if (data.status === 'published' && chosenIds.length === 0) {
      throw new ValidationError(
        'Cannot publish a video quiz with 0 approved questions. Approve AI questions or add manual MCQs for this video first.'
      );
    }

    const quizRecord = {
      title: String(data.title || `${lesson.title} — Gamified Challenge`).trim(),
      description: String(data.description || `4-Round gamified MCQ challenge for "${lesson.title}"`).trim(),
      quiz_type: 'lesson_practice',
      lesson_id: lesson.id,
      subject_id: lesson.subject_id,
      chapter_id: lesson.chapter_id,
      topic_id: lesson.topic_id || null,
      board_codes: normalizeBoardCodes(data.boardCodes || lesson.board_codes),
      question_ids: chosenIds,
      total_marks: chosenIds.reduce((s, id) => s + Number(approvedMap.get(id)?.marks || 1), 0) || chosenIds.length,
      passing_marks: Number(data.passingMarks ?? Math.ceil(chosenIds.length * 0.5)),
      duration_minutes: Number(data.durationMinutes || 10),
      attempts_allowed: Number(data.attemptsAllowed || 10),
      is_gamified: true,
      timer_enabled: data.timerEnabled !== false,
      allow_skip: data.allowSkip !== false,
      allow_review: data.allowReview !== false,
      leaderboard_enabled: Boolean(data.leaderboardEnabled),
      xp_per_correct: Number(data.xpPerCorrect ?? 20),
      streak_bonus_xp: Number(data.streakBonusXp ?? 10),
      understanding_bonus_xp: Number(data.understandingBonusXp ?? 25),
      victory_bonus_xp: Number(data.victoryBonusXp ?? 50),
      rounds_config_json: data.roundsConfig || {
        quick_challenge: 3,
        brain_battle: 3,
        master_challenge: 2,
        victory_round: 2,
      },
      shuffle_questions: Boolean(data.shuffleQuestions),
      shuffle_options: Boolean(data.shuffleOptions),
      show_results: true,
      show_explanations: true,
      is_premium: Boolean(data.isPremium),
      scheduled_publish_at: data.scheduledPublishAt || null,
      status: data.status || 'draft',
    };

    const saved = quizId
      ? await this.store.updateQuiz(quizId, quizRecord)
      : await this.store.createQuiz(quizRecord);

    await this.adminAuthService.recordAudit({
      admin,
      action: quizId ? 'video_quiz.update' : 'video_quiz.create',
      entityType: 'quiz',
      entityId: saved.id,
      summary: `${quizId ? 'Updated' : 'Created'} gamified quiz "${saved.title}" (${chosenIds.length} questions, ${saved.status})`,
      ipAddress,
    });

    return saved;
  }

  async listAdminVideoQuizzes() {
    const [quizzes, lessons, subjects, chapters, attempts] = await Promise.all([
      this.store.listQuizzes({ includeAll: true }),
      this.store.listAllLessons(),
      this.store.listSubjects({ includeAll: true }),
      this.store.listAllChapters(),
      this.store.listQuizAttempts(),
    ]);
    const lessonMap = new Map(lessons.map((l) => [l.id, l]));
    const subMap = new Map(subjects.map((s) => [s.id, s.title]));
    const chMap = new Map(chapters.map((c) => [c.id, c.title]));

    return quizzes
      .filter((q) => Boolean(q.lesson_id))
      .map((q) => {
        const lesson = lessonMap.get(q.lesson_id);
        const qAttempts = attempts.filter((a) => a.quiz_id === q.id && a.status !== 'in_progress');
        const avgPct = qAttempts.length
          ? Math.round(qAttempts.reduce((s, a) => s + Number(a.percentage || 0), 0) / qAttempts.length)
          : 0;
        return {
          ...q,
          lessonTitle: lesson?.title || 'Video Lesson',
          subjectTitle: subMap.get(q.subject_id) || 'Subject',
          chapterTitle: chMap.get(q.chapter_id) || 'Chapter',
          questionCount: (q.question_ids || []).length,
          attemptCount: qAttempts.length,
          averageScorePct: avgPct,
        };
      });
  }

  // ---- 3. Admin Analytics: Question-Wise Accuracy & Difficult Concepts ----
  async getVideoQuizAnalytics({ lessonId = null, subjectId = null } = {}) {
    const [attempts, questions, lessons, profiles, quizzes] = await Promise.all([
      this.store.listQuizAttempts(),
      this.store.listQuestions({ lessonId, subjectId, includeAll: true }),
      this.store.listAllLessons(),
      this.store.listAllProfiles(),
      this.store.listQuizzes({ includeAll: true }),
    ]);

    const questionMap = new Map(questions.map((q) => [q.id, q]));
    const lessonMap = new Map(lessons.map((l) => [l.id, l]));
    const profMap = new Map(profiles.map((p) => [p.id, p]));
    const quizMap = new Map(quizzes.map((q) => [q.id, q]));

    const filteredAttempts = attempts.filter((a) => {
      if (a.status === 'in_progress') return false;
      const quiz = quizMap.get(a.quiz_id);
      if (lessonId && (a.lesson_id || quiz?.lesson_id) !== lessonId) return false;
      if (subjectId && quiz?.subject_id !== subjectId) return false;
      return true;
    });

    const qStats = new Map();
    const conceptStats = new Map();

    for (const att of filteredAttempts) {
      const answers = Array.isArray(att.answers_json) ? att.answers_json : [];
      for (const ans of answers) {
        const qObj = questionMap.get(ans.questionId);
        if (!qObj) continue;
        const currQ = qStats.get(qObj.id) || {
          questionId: qObj.id,
          questionText: qObj.question_text,
          conceptTag: qObj.concept_tag || 'General',
          roundType: qObj.round_type || 'quick_challenge',
          lessonTitle: lessonMap.get(qObj.lesson_id)?.title || '',
          attempts: 0,
          correct: 0,
        };
        currQ.attempts += 1;
        if (ans.isCorrect) currQ.correct += 1;
        qStats.set(qObj.id, currQ);

        const cKey = currQ.conceptTag;
        const currC = conceptStats.get(cKey) || { conceptTag: cKey, attempts: 0, correct: 0 };
        currC.attempts += 1;
        if (ans.isCorrect) currC.correct += 1;
        conceptStats.set(cKey, currC);
      }
    }

    const questionAccuracy = [...qStats.values()]
      .map((item) => ({
        ...item,
        accuracyPct: item.attempts > 0 ? Math.round((item.correct / item.attempts) * 100) : 0,
      }))
      .sort((a, b) => a.accuracyPct - b.accuracyPct);

    const difficultConcepts = [...conceptStats.values()]
      .map((c) => ({
        ...c,
        accuracyPct: c.attempts > 0 ? Math.round((c.correct / c.attempts) * 100) : 0,
      }))
      .sort((a, b) => a.accuracyPct - b.accuracyPct);

    const recentAttempts = filteredAttempts.slice(0, 30).map((a) => ({
      attemptId: a.id,
      studentName: profMap.get(a.user_id)?.full_name || 'Student',
      studentBoard: profMap.get(a.user_id)?.board || 'AP',
      quizTitle: quizMap.get(a.quiz_id)?.title || 'Video Quiz',
      score: a.score,
      totalMarks: a.total_marks,
      percentage: a.percentage,
      xpEarned: Number(a.xp_earned || 0) + Number(a.bonus_xp || 0),
      maxStreak: a.max_streak || 0,
      submittedAt: a.submitted_at || a.created_at,
    }));

    return {
      summary: {
        totalAttempts: filteredAttempts.length,
        averageAccuracyPct: filteredAttempts.length
          ? Math.round(filteredAttempts.reduce((s, a) => s + Number(a.percentage || 0), 0) / filteredAttempts.length)
          : 0,
        totalXpAwarded: filteredAttempts.reduce((s, a) => s + Number(a.xp_earned || 0) + Number(a.bonus_xp || 0), 0),
        trackedQuestions: questionAccuracy.length,
      },
      questionAccuracy,
      difficultConcepts,
      recentAttempts,
    };
  }

  // ---- 4. Student: Discover Video Quizzes, Play 4-Round Game, Instant Server Checks ----
  async listStudentVideoQuizzes({ user, lessonId = null, subjectId = null }) {
    const [quizzes, lessons, subjects, attempts] = await Promise.all([
      this.store.listQuizzes({ subjectId, board: user.board, includeAll: false }),
      this.store.listAllLessons(),
      this.store.listSubjects({ board: user.board }),
      this.store.listQuizAttempts({ userId: user.id }),
    ]);

    const lessonMap = new Map(lessons.map((l) => [l.id, l]));
    const subMap = new Map(subjects.map((s) => [s.id, s.title]));

    return quizzes
      .filter((q) => Boolean(q.lesson_id) && (!lessonId || q.lesson_id === lessonId))
      .map((q) => {
        const myAttempts = attempts.filter((a) => a.quiz_id === q.id && a.status !== 'in_progress');
        const bestPct = myAttempts.length ? Math.max(...myAttempts.map((a) => Number(a.percentage || 0))) : null;
        return {
          id: q.id,
          lessonId: q.lesson_id,
          lessonTitle: lessonMap.get(q.lesson_id)?.title || q.title,
          subjectId: q.subject_id,
          subjectTitle: subMap.get(q.subject_id) || 'Class 10',
          title: q.title,
          description: q.description,
          questionCount: (q.question_ids || []).length,
          durationMinutes: q.duration_minutes,
          timerEnabled: q.timer_enabled !== false,
          allowSkip: q.allow_skip !== false,
          allowReview: q.allow_review !== false,
          leaderboardEnabled: Boolean(q.leaderboard_enabled),
          xpPerCorrect: q.xp_per_correct ?? 20,
          victoryBonusXp: q.victory_bonus_xp ?? 50,
          attemptsTaken: myAttempts.length,
          bestScorePct: bestPct,
          isPremium: Boolean(q.is_premium),
        };
      });
  }

  async startGamifiedQuiz({ user, quizId }) {
    const quiz = await this.store.getQuizById(quizId);
    if (!quiz || quiz.status !== 'published' || !quiz.lesson_id) {
      throw new NotFoundError('Published video quiz not found', 'VIDEO_QUIZ_NOT_FOUND');
    }
    const boards = normalizeBoardCodes(quiz.board_codes);
    if (!boards.includes(user.board) && !boards.includes('BOTH')) {
      throw new ForbiddenError('This video quiz is not mapped to your board', 'BOARD_FORBIDDEN');
    }
    if (quiz.is_premium) {
      await this.subscriptionService.assertActiveSubscription(user.id);
    }

    const lesson = await this.store.getLessonById(quiz.lesson_id);
    const questions = [];
    for (const qId of quiz.question_ids || []) {
      const q = await this.store.getQuestionById(qId);
      if (q && (q.ai_approval_status || 'approved') === 'approved' && q.status === 'published') {
        questions.push(q);
      }
    }
    if (questions.length === 0) {
      throw new NotFoundError('No approved questions available for this video quiz');
    }

    // Order by 4 gamified rounds: Quick Challenge -> Brain Battle -> Master Challenge -> Victory Round
    const ordered = [...questions].sort(
      (a, b) => (ROUND_ORDER.get(a.round_type || 'quick_challenge') ?? 0) - (ROUND_ORDER.get(b.round_type || 'quick_challenge') ?? 0)
    );

    const startedAt = new Date();
    const durationMin = quiz.timer_enabled !== false ? Number(quiz.duration_minutes || 10) : 180;
    const expiresAt = new Date(startedAt.getTime() + durationMin * 60 * 1000);

    const attempt = await this.store.createQuizAttempt({
      quiz_id: quiz.id,
      lesson_id: quiz.lesson_id,
      user_id: user.id,
      started_at: startedAt.toISOString(),
      expires_at: expiresAt.toISOString(),
      status: 'in_progress',
      score: 0,
      total_marks: ordered.reduce((s, q) => s + Number(q.marks || 1), 0),
      percentage: 0,
      passed: false,
      xp_earned: 0,
      bonus_xp: 0,
      current_streak: 0,
      max_streak: 0,
      answered_map_json: {},
      answers_json: [],
    });

    // STRICT SECURITY: NEVER expose correctOptionIndex or explanation in initial payload!
    return {
      attemptId: attempt.id,
      quiz: {
        id: quiz.id,
        lessonId: quiz.lesson_id,
        lessonTitle: lesson?.title || quiz.title,
        title: quiz.title,
        description: quiz.description,
        timerEnabled: quiz.timer_enabled !== false,
        durationMinutes: quiz.duration_minutes || 10,
        allowSkip: quiz.allow_skip !== false,
        allowReview: quiz.allow_review !== false,
        leaderboardEnabled: Boolean(quiz.leaderboard_enabled),
        xpPerCorrect: quiz.xp_per_correct ?? 20,
        streakBonusXp: quiz.streak_bonus_xp ?? 10,
        understandingBonusXp: quiz.understanding_bonus_xp ?? 25,
        victoryBonusXp: quiz.victory_bonus_xp ?? 50,
      },
      rounds: GAME_ROUNDS,
      startedAt: attempt.started_at,
      expiresAt: attempt.expires_at,
      remainingSeconds: quiz.timer_enabled !== false ? Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000)) : null,
      questions: ordered.map((q) => ({
        id: q.id,
        questionText: q.question_text,
        options: q.options_json || [],
        roundType: q.round_type || 'quick_challenge',
        difficulty: q.difficulty || 'medium',
        conceptTag: q.concept_tag || '',
        marks: Number(q.marks || 1),
      })),
    };
  }

  /**
   * Validates ONE question server-side immediately on tap so students get instant
   * correct/incorrect animation, streak XP, and explanation WITHOUT ever exposing
   * answer keys upfront!
   */
  async answerGamifiedQuestion({ user, attemptId, questionId, selectedOptionIndex = null, skipped = false }) {
    const attempt = await this.store.getQuizAttemptById(attemptId);
    if (!attempt || attempt.user_id !== user.id) {
      throw new NotFoundError('Quiz attempt not found');
    }
    if (attempt.status !== 'in_progress') {
      throw new ValidationError('This quiz attempt is already completed.');
    }

    const quiz = await this.store.getQuizById(attempt.quiz_id);
    if (!quiz) throw new NotFoundError('Quiz not found');

    if (quiz.timer_enabled !== false && Date.now() > new Date(attempt.expires_at).getTime() + 15000) {
      throw new ForbiddenError('Quiz timer has expired.', 'QUIZ_TIMER_EXPIRED');
    }

    if (skipped && quiz.allow_skip === false) {
      throw new ForbiddenError('Skipping questions is disabled for this quiz.');
    }

    const question = await this.store.getQuestionById(questionId);
    if (!question || !(quiz.question_ids || []).includes(question.id)) {
      throw new NotFoundError('Question does not belong to this quiz');
    }

    const answeredMap = { ...(attempt.answered_map_json || {}) };
    if (answeredMap[questionId] && !answeredMap[questionId].skipped) {
      // Idempotent return if student already locked in an answer for this question
      return answeredMap[questionId];
    }

    let isCorrect = false;
    let xpAwarded = 0;
    let streakBonusXp = 0;
    let currentStreak = Number(attempt.current_streak || 0);
    let maxStreak = Number(attempt.max_streak || 0);
    let marksAwarded = 0;

    if (!skipped) {
      isCorrect = Number(selectedOptionIndex) === Number(question.correct_option_index);
      if (isCorrect) {
        currentStreak += 1;
        maxStreak = Math.max(maxStreak, currentStreak);
        marksAwarded = Number(question.marks || 1);
        const baseXp = Number(quiz.xp_per_correct ?? 20);
        const roundMultiplier = question.round_type === 'victory_round' ? 1.5 : question.round_type === 'master_challenge' ? 1.25 : 1;
        xpAwarded = Math.round(baseXp * roundMultiplier);
        if (currentStreak >= 2) {
          streakBonusXp = Number(quiz.streak_bonus_xp ?? 10);
        }
      } else {
        currentStreak = 0;
      }
    } else {
      currentStreak = 0;
    }

    const feedback = {
      questionId: question.id,
      questionText: question.question_text,
      options: question.options_json || [],
      roundType: question.round_type || 'quick_challenge',
      conceptTag: question.concept_tag || '',
      selectedOptionIndex: skipped ? null : Number(selectedOptionIndex),
      skipped: Boolean(skipped),
      correctOptionIndex: skipped ? null : question.correct_option_index,
      isCorrect,
      marksAwarded,
      xpAwarded,
      streakBonusXp,
      currentStreak,
      maxStreak,
      explanation: skipped ? '' : question.explanation || 'Review this concept in the video lesson.',
      referenceNote: skipped ? '' : question.reference_note || '',
    };

    answeredMap[questionId] = feedback;

    const totalXpSoFar = Object.values(answeredMap).reduce(
      (sum, item) => sum + Number(item.xpAwarded || 0) + Number(item.streakBonusXp || 0),
      0
    );
    const scoreSoFar = Object.values(answeredMap).reduce((sum, item) => sum + Number(item.marksAwarded || 0), 0);

    await this.store.updateQuizAttempt(attempt.id, {
      answered_map_json: answeredMap,
      score: scoreSoFar,
      xp_earned: totalXpSoFar,
      current_streak: currentStreak,
      max_streak: maxStreak,
    });

    return feedback;
  }

  /**
   * Finalizes the gamified quiz attempt, awards understanding/consistency/victory XP bonuses,
   * updates DB student_gamification_profiles (XP, level, daily streak, personal best),
   * and dynamically unlocks badges + chapter/subject achievements.
   */
  async completeGamifiedQuiz({ user, attemptId }) {
    const attempt = await this.store.getQuizAttemptById(attemptId);
    if (!attempt || attempt.user_id !== user.id) {
      throw new NotFoundError('Quiz attempt not found');
    }
    const quiz = await this.store.getQuizById(attempt.quiz_id);
    if (!quiz) throw new NotFoundError('Quiz not found');

    const answeredMap = attempt.answered_map_json || {};
    const orderedResults = [];
    let totalScore = 0;
    let totalMarks = 0;
    let correctCount = 0;
    let victoryCorrect = 0;
    let victoryTotal = 0;

    for (const qId of quiz.question_ids || []) {
      const q = await this.store.getQuestionById(qId);
      if (!q) continue;
      const marks = Number(q.marks || 1);
      totalMarks += marks;
      const entry = answeredMap[q.id];
      const isCorrect = Boolean(entry?.isCorrect);
      if (isCorrect) {
        totalScore += marks;
        correctCount += 1;
      }
      if (q.round_type === 'victory_round') {
        victoryTotal += 1;
        if (isCorrect) victoryCorrect += 1;
      }
      orderedResults.push({
        questionId: q.id,
        questionText: q.question_text,
        options: q.options_json || [],
        roundType: q.round_type || 'quick_challenge',
        conceptTag: q.concept_tag || '',
        selectedOptionIndex: entry?.selectedOptionIndex ?? null,
        correctOptionIndex: q.correct_option_index,
        isCorrect,
        explanation: q.explanation || '',
        referenceNote: q.reference_note || '',
      });
    }

    const percentage = totalMarks > 0 ? Math.round((totalScore / totalMarks) * 100) : 0;
    const passed = totalScore >= Number(quiz.passing_marks || 0);

    // Reward UNDERSTANDING & CONSISTENCY (not only speed!)
    let bonusXp = 0;
    const bonusBreakdown = [];
    if (percentage >= 80) {
      const ub = Number(quiz.understanding_bonus_xp ?? 25);
      bonusXp += ub;
      bonusBreakdown.push({ label: 'Deep Understanding Mastery (≥80%)', xp: ub });
    }
    if (victoryTotal > 0 && victoryCorrect === victoryTotal) {
      const vb = Number(quiz.victory_bonus_xp ?? 50);
      bonusXp += vb;
      bonusBreakdown.push({ label: 'Victory Round Champion', xp: vb });
    }

    // Update student gamification profile in PostgreSQL / store
    const prevProfile = (await this.store.getGamificationProfile(user.id)) || {
      user_id: user.id,
      total_xp: 0,
      level: 1,
      current_daily_streak: 0,
      longest_daily_streak: 0,
      last_activity_date: null,
      personal_best_score_pct: 0,
      total_quizzes_completed: 0,
      total_correct_answers: 0,
      total_answered: 0,
    };

    const today = todayDateKey();
    const diffDays = daysBetweenDateKeys(prevProfile.last_activity_date, today);
    let nextDailyStreak = prevProfile.current_daily_streak || 0;
    if (prevProfile.last_activity_date === null) {
      nextDailyStreak = 1;
    } else if (diffDays === 1) {
      nextDailyStreak += 1;
      bonusXp += 15;
      bonusBreakdown.push({ label: `Daily Consistency Streak (${nextDailyStreak} days)`, xp: 15 });
    } else if (diffDays > 1) {
      nextDailyStreak = 1;
    }

    const longestDailyStreak = Math.max(prevProfile.longest_daily_streak || 0, nextDailyStreak);
    const isNewPersonalBest = percentage > Number(prevProfile.personal_best_score_pct || 0);
    const baseEarnedXp = Number(attempt.xp_earned || 0);
    const totalSessionXp = baseEarnedXp + bonusXp;
    const newTotalXp = Number(prevProfile.total_xp || 0) + totalSessionXp;
    const levelInfo = computeLevelFromXp(newTotalXp);

    await this.store.updateQuizAttempt(attempt.id, {
      status: 'submitted',
      submitted_at: new Date().toISOString(),
      score: totalScore,
      total_marks: totalMarks,
      percentage,
      passed,
      xp_earned: baseEarnedXp,
      bonus_xp: bonusXp,
      answers_json: orderedResults,
    });

    await this.store.upsertGamificationProfile({
      user_id: user.id,
      total_xp: newTotalXp,
      level: levelInfo.level,
      current_daily_streak: nextDailyStreak,
      longest_daily_streak: longestDailyStreak,
      last_activity_date: today,
      personal_best_score_pct: Math.max(Number(prevProfile.personal_best_score_pct || 0), percentage),
      total_quizzes_completed: Number(prevProfile.total_quizzes_completed || 0) + 1,
      total_correct_answers: Number(prevProfile.total_correct_answers || 0) + correctCount,
      total_answered: Number(prevProfile.total_answered || 0) + orderedResults.length,
    });

    // Dynamically unlock DB Badges + Chapter & Subject Achievements
    const newlyUnlocked = [];
    const tryUnlock = async (badge) => {
      const granted = await this.store.grantAchievement({ user_id: user.id, ...badge });
      if (granted) newlyUnlocked.push(granted);
    };

    await tryUnlock({
      badge_code: 'FIRST_VIDEO_QUIZ',
      badge_title: 'First Video Challenger',
      badge_description: 'Completed your first video-linked Class 10 challenge.',
      badge_category: 'consistency',
      entity_id: 'global',
      xp_reward: 25,
    });

    if ((attempt.max_streak || 0) >= 3) {
      await tryUnlock({
        badge_code: 'STREAK_3',
        badge_title: '3x Concept Streak',
        badge_description: 'Answered 3 or more video concepts correctly in a row.',
        badge_category: 'streak',
        entity_id: 'global',
        xp_reward: 30,
      });
    }

    if (percentage === 100) {
      await tryUnlock({
        badge_code: 'PERFECT_MASTERY',
        badge_title: '100% Concept Master',
        badge_description: 'Achieved a perfect score with complete video comprehension.',
        badge_category: 'mastery',
        entity_id: quiz.lesson_id || 'global',
        xp_reward: 50,
      });
    }

    if (victoryTotal > 0 && victoryCorrect === victoryTotal) {
      await tryUnlock({
        badge_code: 'VICTORY_ROUND_HERO',
        badge_title: 'Victory Round Champion',
        badge_description: 'Conquered every bonus Victory Round challenge.',
        badge_category: 'victory',
        entity_id: quiz.id,
        xp_reward: 40,
      });
    }

    if (passed && quiz.chapter_id) {
      const ch = await this.store.getChapterById(quiz.chapter_id);
      await tryUnlock({
        badge_code: 'CHAPTER_ACHIEVER',
        badge_title: `Chapter Master: ${ch?.title || 'SSC Chapter'}`,
        badge_description: 'Demonstrated strong mastery of this Class 10 chapter.',
        badge_category: 'chapter',
        entity_id: quiz.chapter_id,
        xp_reward: 35,
      });
    }

    if (percentage >= 80 && quiz.subject_id) {
      const sub = await this.store.getSubjectByIdRaw(quiz.subject_id);
      await tryUnlock({
        badge_code: 'SUBJECT_STAR',
        badge_title: `${sub?.title || 'Subject'} Achiever`,
        badge_description: 'Scored 80%+ in a subject video mastery quiz.',
        badge_category: 'subject',
        entity_id: quiz.subject_id,
        xp_reward: 40,
      });
    }

    return {
      attemptId: attempt.id,
      score: totalScore,
      totalMarks,
      percentage,
      passed,
      isNewPersonalBest,
      maxStreak: attempt.max_streak || 0,
      xpEarned: baseEarnedXp,
      bonusXp,
      totalSessionXp,
      bonusBreakdown,
      profile: {
        totalXp: newTotalXp,
        ...levelInfo,
        currentDailyStreak: nextDailyStreak,
        longestDailyStreak,
        personalBestScorePct: Math.max(Number(prevProfile.personal_best_score_pct || 0), percentage),
      },
      newlyUnlockedAchievements: newlyUnlocked,
      results: orderedResults,
    };
  }

  // ---- 5. Student Gamification Profile & Optional Admin-Controlled Leaderboard ----
  async getStudentGamificationProfile(user) {
    const [profile, achievements, appConfig] = await Promise.all([
      this.store.getGamificationProfile(user.id),
      this.store.listStudentAchievements(user.id),
      this.store.getAppConfig(),
    ]);

    const xp = Number(profile?.total_xp || 0);
    const levelInfo = computeLevelFromXp(xp);
    const totalAns = Number(profile?.total_answered || 0);
    const totalCorr = Number(profile?.total_correct_answers || 0);

    return {
      totalXp: xp,
      ...levelInfo,
      currentDailyStreak: Number(profile?.current_daily_streak || 0),
      longestDailyStreak: Number(profile?.longest_daily_streak || 0),
      personalBestScorePct: Number(profile?.personal_best_score_pct || 0),
      totalQuizzesCompleted: Number(profile?.total_quizzes_completed || 0),
      accuracyPct: totalAns > 0 ? Math.round((totalCorr / totalAns) * 100) : 0,
      leaderboardEnabled: Boolean(appConfig.leaderboardEnabled),
      achievements: achievements.map((a) => ({
        id: a.id,
        code: a.badge_code,
        title: a.badge_title,
        description: a.badge_description,
        category: a.badge_category,
        xpReward: a.xp_reward,
        awardedAt: a.awarded_at,
      })),
    };
  }

  async getOptionalLeaderboard(user) {
    const appConfig = await this.store.getAppConfig();
    const allQuizzes = await this.store.listQuizzes({ includeAll: false });
    const anyQuizEnables = allQuizzes.some((q) => Boolean(q.leaderboard_enabled));
    if (!appConfig.leaderboardEnabled && !anyQuizEnables) {
      return { enabled: false, entries: [] };
    }

    const [profiles, users] = await Promise.all([
      this.store.listAllGamificationProfiles(),
      this.store.listAllProfiles(),
    ]);
    const userMap = new Map(users.map((u) => [u.id, u]));

    const entries = profiles
      .filter((p) => userMap.get(p.user_id)?.board === user.board)
      .slice(0, 20)
      .map((p, idx) => {
        const u = userMap.get(p.user_id);
        const firstName = (u?.full_name || 'Student').split(' ')[0];
        return {
          rank: idx + 1,
          studentName: firstName,
          studentCode: u?.student_code || '',
          level: computeLevelFromXp(p.total_xp).level,
          totalXp: p.total_xp,
          dailyStreak: p.current_daily_streak || 0,
          personalBestPct: p.personal_best_score_pct || 0,
          isCurrentUser: p.user_id === user.id,
        };
      });

    return { enabled: true, board: user.board, entries };
  }
}
