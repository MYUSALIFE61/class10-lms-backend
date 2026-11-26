import { assertSubjectScope } from './adminRbac.js';
import { ForbiddenError, NotFoundError, ValidationError } from '../utils/errors.js';

export const QUESTION_TYPES = [
  'mcq',
  'true_false',
  'fill_blank',
  'match',
  'short_answer',
  'long_answer',
  'numerical',
  'diagram',
  'assertion_reason',
  'previous_board',
];

const OBJECTIVE_TYPES = new Set(['mcq', 'true_false', 'assertion_reason']);

function normalizeBoardCodes(codes) {
  if (Array.isArray(codes) && codes.length > 0) {
    return [...new Set(codes.map((b) => String(b).toUpperCase()))];
  }
  return ['AP', 'TS'];
}

function validateQuestionPayload(data) {
  const type = data.questionType || 'mcq';
  if (!QUESTION_TYPES.includes(type)) {
    throw new ValidationError(`Unsupported question type: ${type}`);
  }
  const text = String(data.questionText || '').trim();
  if (text.length < 3) {
    throw new ValidationError('Question text must be at least 3 characters.');
  }

  const options = Array.isArray(data.options)
    ? data.options.map((o) => String(o || '').trim()).filter(Boolean)
    : [];

  if (OBJECTIVE_TYPES.has(type)) {
    if (options.length < 2) {
      throw new ValidationError(`Question type '${type}' requires at least 2 non-empty options.`);
    }
    const idx = Number(data.correctOptionIndex);
    if (!Number.isInteger(idx) || idx < 0 || idx >= options.length) {
      throw new ValidationError(
        `Correct option index (${data.correctOptionIndex}) is out of range for ${options.length} options.`
      );
    }
  }

  return { type, text, options };
}

export class AssessmentService {
  constructor({ store, adminAuthService, subscriptionService }) {
    this.store = store;
    this.adminAuthService = adminAuthService;
    this.subscriptionService = subscriptionService;
  }

  // ---- Question Bank ----
  async listQuestions(filters = {}) {
    return this.store.listQuestions({ ...filters, includeAll: true });
  }

  async createQuestion({ admin, data, ipAddress }) {
    assertSubjectScope(admin, data.subjectId);
    const { type, text, options } = validateQuestionPayload(data);

    // Duplicate prevention within same subject + chapter
    const existing = await this.store.listQuestions({
      subjectId: data.subjectId,
      chapterId: data.chapterId || null,
      includeAll: true,
    });
    if (existing.some((q) => q.question_text.trim().toLowerCase() === text.toLowerCase())) {
      throw new ValidationError('Duplicate question already exists in this chapter.');
    }

    const rec = await this.store.createQuestion({
      question_text: text,
      question_image_url: data.questionImageUrl || null,
      question_type: type,
      subject_id: data.subjectId,
      chapter_id: data.chapterId || null,
      topic_id: data.topicId || null,
      lesson_id: data.lessonId || null,
      difficulty: data.difficulty || 'medium',
      options_json: options,
      correct_option_index: OBJECTIVE_TYPES.has(type) ? Number(data.correctOptionIndex) : null,
      correct_answer_text: data.correctAnswerText || '',
      explanation: data.explanation || '',
      marks: Number(data.marks ?? 1),
      negative_marks: Number(data.negativeMarks ?? 0),
      board_codes: normalizeBoardCodes(data.boardCodes),
      academic_year_id: data.academicYearId || null,
      language: data.language || 'EN',
      status: data.status || 'published',
    });

    await this.adminAuthService.recordAudit({
      admin,
      action: 'question.create',
      entityType: 'question',
      entityId: rec.id,
      summary: `Created ${type} question in subject ${data.subjectId}`,
      ipAddress,
    });
    return rec;
  }

  async updateQuestion({ admin, id, patch, ipAddress }) {
    const existing = await this.store.getQuestionById(id);
    if (!existing) throw new NotFoundError('Question not found');
    assertSubjectScope(admin, existing.subject_id);

    const merged = {
      questionText: patch.questionText ?? existing.question_text,
      questionType: patch.questionType ?? existing.question_type,
      options: patch.options ?? existing.options_json,
      correctOptionIndex:
        patch.correctOptionIndex !== undefined
          ? patch.correctOptionIndex
          : existing.correct_option_index,
    };
    const { type, text, options } = validateQuestionPayload(merged);

    const updated = await this.store.updateQuestion(id, {
      question_text: text,
      question_type: type,
      options_json: options,
      correct_option_index: OBJECTIVE_TYPES.has(type) ? Number(merged.correctOptionIndex) : null,
      ...(patch.questionImageUrl !== undefined ? { question_image_url: patch.questionImageUrl } : {}),
      ...(patch.chapterId !== undefined ? { chapter_id: patch.chapterId } : {}),
      ...(patch.topicId !== undefined ? { topic_id: patch.topicId } : {}),
      ...(patch.difficulty !== undefined ? { difficulty: patch.difficulty } : {}),
      ...(patch.correctAnswerText !== undefined ? { correct_answer_text: patch.correctAnswerText } : {}),
      ...(patch.explanation !== undefined ? { explanation: patch.explanation } : {}),
      ...(patch.marks !== undefined ? { marks: Number(patch.marks) } : {}),
      ...(patch.negativeMarks !== undefined ? { negative_marks: Number(patch.negativeMarks) } : {}),
      ...(patch.boardCodes !== undefined ? { board_codes: normalizeBoardCodes(patch.boardCodes) } : {}),
      ...(patch.language !== undefined ? { language: patch.language } : {}),
      ...(patch.status !== undefined ? { status: patch.status } : {}),
    });

    await this.adminAuthService.recordAudit({
      admin,
      action: 'question.update',
      entityType: 'question',
      entityId: id,
      summary: `Updated question ${id}`,
      ipAddress,
    });
    return updated;
  }

  async bulkImportQuestions({ admin, subjectId, chapterId = null, rows = [], ipAddress }) {
    assertSubjectScope(admin, subjectId);
    const created = [];
    const errors = [];
    const existing = await this.store.listQuestions({ subjectId, chapterId, includeAll: true });
    const seen = new Set(existing.map((q) => q.question_text.trim().toLowerCase()));

    for (let i = 0; i < rows.length; i += 1) {
      const row = rows[i];
      try {
        const { type, text, options } = validateQuestionPayload(row);
        const key = text.toLowerCase();
        if (seen.has(key)) {
          errors.push({ row: i + 1, error: 'Duplicate question text skipped' });
          continue;
        }
        seen.add(key);

        const rec = await this.store.createQuestion({
          question_text: text,
          question_type: type,
          subject_id: row.subjectId || subjectId,
          chapter_id: row.chapterId || chapterId,
          topic_id: row.topicId || null,
          difficulty: row.difficulty || 'medium',
          options_json: options,
          correct_option_index: OBJECTIVE_TYPES.has(type) ? Number(row.correctOptionIndex) : null,
          correct_answer_text: row.correctAnswerText || '',
          explanation: row.explanation || '',
          marks: Number(row.marks ?? 1),
          negative_marks: Number(row.negativeMarks ?? 0),
          board_codes: normalizeBoardCodes(row.boardCodes),
          language: row.language || 'EN',
          status: row.status || 'published',
        });
        created.push(rec);
      } catch (err) {
        errors.push({ row: i + 1, error: err.message });
      }
    }

    await this.adminAuthService.recordAudit({
      admin,
      action: 'question.bulk_import',
      entityType: 'question',
      summary: `Bulk imported ${created.length} questions (${errors.length} skipped/invalid)`,
      ipAddress,
    });
    return { importedCount: created.length, skippedCount: errors.length, errors, items: created };
  }

  async exportQuestionsCsv(filters = {}) {
    const items = await this.store.listQuestions({ ...filters, includeAll: true });
    const header = [
      'id',
      'question_type',
      'difficulty',
      'question_text',
      'option_a',
      'option_b',
      'option_c',
      'option_d',
      'correct_option_index',
      'marks',
      'negative_marks',
      'explanation',
      'boards',
      'status',
    ];
    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines = [header.join(',')];
    for (const q of items) {
      const opts = Array.isArray(q.options_json) ? q.options_json : [];
      lines.push(
        [
          q.id,
          q.question_type,
          q.difficulty,
          q.question_text,
          opts[0] || '',
          opts[1] || '',
          opts[2] || '',
          opts[3] || '',
          q.correct_option_index ?? '',
          q.marks,
          q.negative_marks,
          q.explanation,
          (q.board_codes || ['AP', 'TS']).join('|'),
          q.status || 'published',
        ]
          .map(esc)
          .join(',')
      );
    }
    return lines.join('\n');
  }

  // ---- Quizzes (Admin Builder + Server-Timed Student Attempts) ----
  async listQuizzes({ includeAll = true, subjectId = null, chapterId = null, board = null } = {}) {
    return this.store.listQuizzes({ subjectId, chapterId, board, includeAll });
  }

  async createQuiz({ admin, data, ipAddress }) {
    if (data.subjectId) assertSubjectScope(admin, data.subjectId);

    let questionIds = Array.isArray(data.questionIds) ? data.questionIds : [];
    if (questionIds.length === 0 && data.randomCount > 0) {
      const pool = await this.store.listQuestions({
        subjectId: data.subjectId || null,
        chapterId: data.chapterId || null,
        difficulty: data.difficulty || null,
        includeAll: false,
      });
      const shuffled = [...pool].sort(() => Math.random() - 0.5);
      questionIds = shuffled.slice(0, Number(data.randomCount)).map((q) => q.id);
    }

    const rec = await this.store.createQuiz({
      title: data.title.trim(),
      description: data.description || '',
      quiz_type: data.quizType || 'chapter_test',
      board_codes: normalizeBoardCodes(data.boardCodes),
      academic_year_id: data.academicYearId || null,
      subject_id: data.subjectId || null,
      chapter_id: data.chapterId || null,
      topic_id: data.topicId || null,
      question_ids: questionIds,
      total_marks: Number(data.totalMarks || questionIds.length || 15),
      passing_marks: Number(data.passingMarks || Math.ceil((questionIds.length || 15) * 0.4)),
      duration_minutes: Number(data.durationMinutes || 15),
      attempts_allowed: Number(data.attemptsAllowed || 3),
      start_at: data.startAt || null,
      end_at: data.endAt || null,
      shuffle_questions: Boolean(data.shuffleQuestions),
      shuffle_options: Boolean(data.shuffleOptions),
      show_results: data.showResults !== false,
      show_explanations: data.showExplanations !== false,
      negative_marking: Boolean(data.negativeMarking),
      is_premium: Boolean(data.isPremium),
      status: data.status || 'draft',
    });

    await this.adminAuthService.recordAudit({
      admin,
      action: 'quiz.create',
      entityType: 'quiz',
      entityId: rec.id,
      summary: `Created quiz "${rec.title}" (${questionIds.length} questions, ${rec.duration_minutes}m) [${rec.status}]`,
      ipAddress,
    });
    return rec;
  }

  async updateQuiz({ admin, id, patch, ipAddress }) {
    const existing = await this.store.getQuizById(id);
    if (!existing) throw new NotFoundError('Quiz not found');
    if (existing.subject_id) assertSubjectScope(admin, existing.subject_id);

    const dbPatch = {};
    if (patch.title !== undefined) dbPatch.title = patch.title.trim();
    if (patch.description !== undefined) dbPatch.description = patch.description;
    if (patch.quizType !== undefined) dbPatch.quiz_type = patch.quizType;
    if (patch.boardCodes !== undefined) dbPatch.board_codes = normalizeBoardCodes(patch.boardCodes);
    if (patch.questionIds !== undefined) dbPatch.question_ids = patch.questionIds;
    if (patch.totalMarks !== undefined) dbPatch.total_marks = Number(patch.totalMarks);
    if (patch.passingMarks !== undefined) dbPatch.passing_marks = Number(patch.passingMarks);
    if (patch.durationMinutes !== undefined) dbPatch.duration_minutes = Number(patch.durationMinutes);
    if (patch.attemptsAllowed !== undefined) dbPatch.attempts_allowed = Number(patch.attemptsAllowed);
    if (patch.shuffleQuestions !== undefined) dbPatch.shuffle_questions = Boolean(patch.shuffleQuestions);
    if (patch.shuffleOptions !== undefined) dbPatch.shuffle_options = Boolean(patch.shuffleOptions);
    if (patch.showResults !== undefined) dbPatch.show_results = Boolean(patch.showResults);
    if (patch.showExplanations !== undefined) dbPatch.show_explanations = Boolean(patch.showExplanations);
    if (patch.negativeMarking !== undefined) dbPatch.negative_marking = Boolean(patch.negativeMarking);
    if (patch.isPremium !== undefined) dbPatch.is_premium = Boolean(patch.isPremium);
    if (patch.status !== undefined) dbPatch.status = patch.status;

    const updated = await this.store.updateQuiz(id, dbPatch);
    await this.adminAuthService.recordAudit({
      admin,
      action: 'quiz.update',
      entityType: 'quiz',
      entityId: id,
      summary: `Updated quiz "${updated.title}" [${updated.status}]`,
      ipAddress,
    });
    return updated;
  }

  async startStudentQuiz({ user, quizId }) {
    const quiz = await this.store.getQuizById(quizId);
    if (!quiz || quiz.status !== 'published') {
      throw new NotFoundError('Quiz not found or not published', 'QUIZ_NOT_FOUND');
    }
    const boards = normalizeBoardCodes(quiz.board_codes);
    if (!boards.includes(user.board) && !boards.includes('BOTH')) {
      throw new ForbiddenError('Quiz is not assigned to your SSC board', 'BOARD_FORBIDDEN');
    }
    if (quiz.is_premium) {
      await this.subscriptionService.assertActiveSubscription(user.id);
    }

    const prevAttempts = await this.store.listQuizAttempts({ userId: user.id, quizId: quiz.id });
    const submittedCount = prevAttempts.filter((a) => a.status !== 'in_progress').length;
    if (submittedCount >= (quiz.attempts_allowed || 3)) {
      throw new ForbiddenError('Maximum quiz attempts reached.', 'MAX_ATTEMPTS_REACHED');
    }

    const rawQuestions = [];
    for (const qId of quiz.question_ids || []) {
      const q = await this.store.getQuestionById(qId);
      if (q) rawQuestions.push(q);
    }
    const ordered = quiz.shuffle_questions
      ? [...rawQuestions].sort(() => Math.random() - 0.5)
      : rawQuestions;

    const startedAt = new Date();
    const expiresAt = new Date(startedAt.getTime() + (quiz.duration_minutes || 15) * 60 * 1000);

    const attempt = await this.store.createQuizAttempt({
      quiz_id: quiz.id,
      user_id: user.id,
      started_at: startedAt.toISOString(),
      expires_at: expiresAt.toISOString(),
      status: 'in_progress',
      score: 0,
      total_marks: quiz.total_marks || ordered.reduce((s, q) => s + Number(q.marks || 1), 0),
      percentage: 0,
      passed: false,
      answers_json: [],
    });

    // Never expose correct answers to the student!
    return {
      attemptId: attempt.id,
      quiz: {
        id: quiz.id,
        title: quiz.title,
        description: quiz.description,
        durationMinutes: quiz.duration_minutes,
        totalMarks: attempt.total_marks,
        passingMarks: quiz.passing_marks,
        negativeMarking: quiz.negative_marking,
      },
      startedAt: attempt.started_at,
      expiresAt: attempt.expires_at,
      remainingSeconds: Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000)),
      questions: ordered.map((q) => ({
        id: q.id,
        questionText: q.question_text,
        questionImageUrl: q.question_image_url || null,
        questionType: q.question_type,
        options: q.options_json || [],
        marks: Number(q.marks || 1),
        negativeMarks: quiz.negative_marking ? Number(q.negative_marks || 0) : 0,
        difficulty: q.difficulty,
      })),
    };
  }

  async submitStudentQuiz({ user, quizId, attemptId, answers = [] }) {
    const quiz = await this.store.getQuizById(quizId);
    const attempt = await this.store.getQuizAttemptById(attemptId);
    if (!quiz || !attempt || attempt.quiz_id !== quizId || attempt.user_id !== user.id) {
      throw new NotFoundError('Quiz attempt not found', 'ATTEMPT_NOT_FOUND');
    }
    if (attempt.status !== 'in_progress') {
      throw new ValidationError('This quiz attempt was already submitted.');
    }

    // Backend-enforced timer check (with 15-second network grace buffer)
    const deadlineMs = new Date(attempt.expires_at).getTime() + 15000;
    const isExpired = Date.now() > deadlineMs;

    const answerMap = new Map(answers.map((a) => [a.questionId, a]));
    let score = 0;
    let totalMarks = 0;
    const graded = [];

    for (const qId of quiz.question_ids || []) {
      const q = await this.store.getQuestionById(qId);
      if (!q) continue;
      const marks = Number(q.marks || 1);
      totalMarks += marks;
      const submitted = answerMap.get(q.id);
      const selectedIdx = submitted?.selectedOptionIndex ?? null;
      let isCorrect = false;
      if (OBJECTIVE_TYPES.has(q.question_type)) {
        isCorrect = selectedIdx !== null && Number(selectedIdx) === Number(q.correct_option_index);
      } else if (submitted?.answerText && q.correct_answer_text) {
        isCorrect =
          String(submitted.answerText).trim().toLowerCase() ===
          String(q.correct_answer_text).trim().toLowerCase();
      }

      if (isCorrect) {
        score += marks;
      } else if (selectedIdx !== null && quiz.negative_marking) {
        score -= Number(q.negative_marks || 0);
      }

      graded.push({
        questionId: q.id,
        questionText: q.question_text,
        options: q.options_json || [],
        selectedOptionIndex: selectedIdx,
        correctOptionIndex: q.correct_option_index,
        isCorrect,
        marksAwarded: isCorrect ? marks : 0,
        explanation: quiz.show_explanations ? q.explanation : '',
      });
    }

    score = Math.max(0, Number(score.toFixed(2)));
    const pct = totalMarks > 0 ? Math.round((score / totalMarks) * 100) : 0;
    const passed = score >= Number(quiz.passing_marks || 0);

    const saved = await this.store.updateQuizAttempt(attempt.id, {
      status: isExpired ? 'expired' : 'submitted',
      submitted_at: new Date().toISOString(),
      score,
      total_marks: totalMarks,
      percentage: pct,
      passed,
      answers_json: graded,
    });

    if (isExpired) {
      throw new ForbiddenError(
        'Server quiz timer expired. Your submission was recorded as expired.',
        'QUIZ_TIMER_EXPIRED'
      );
    }

    return {
      attemptId: saved.id,
      score,
      totalMarks,
      percentage: pct,
      passed,
      results: quiz.show_results ? graded : [],
    };
  }

  // ---- Exams (Schedule, Reschedule, Cancel, Auto + Manual Evaluation) ----
  async listExams({ includeAll = true, subjectId = null, board = null } = {}) {
    return this.store.listExams({ subjectId, board, includeAll });
  }

  async createExam({ admin, data, ipAddress }) {
    const rec = await this.store.createExam({
      name: data.name.trim(),
      description: data.description || '',
      exam_type: data.examType || 'monthly',
      board_codes: normalizeBoardCodes(data.boardCodes),
      academic_year_id: data.academicYearId || null,
      subject_id: data.subjectId || null,
      exam_date: data.examDate || new Date().toISOString(),
      start_time: data.startTime || data.examDate || new Date().toISOString(),
      end_time: data.endTime || null,
      duration_minutes: Number(data.durationMinutes || 60),
      total_marks: Number(data.totalMarks || 50),
      passing_marks: Number(data.passingMarks || 18),
      sections_json: Array.isArray(data.sections) ? data.sections : [],
      question_ids: Array.isArray(data.questionIds) ? data.questionIds : [],
      instructions: data.instructions || 'Answer all questions within the allotted exam duration.',
      attempts_allowed: Number(data.attemptsAllowed || 1),
      results_published: Boolean(data.resultsPublished),
      result_publish_at: data.resultPublishAt || null,
      status: data.status || 'scheduled',
    });

    await this.adminAuthService.recordAudit({
      admin,
      action: 'exam.create',
      entityType: 'exam',
      entityId: rec.id,
      summary: `Scheduled exam "${rec.name}" [${rec.status}]`,
      ipAddress,
    });
    return rec;
  }

  async updateExam({ admin, id, patch, ipAddress }) {
    const existing = await this.store.getExamById(id);
    if (!existing) throw new NotFoundError('Exam not found');

    const dbPatch = {};
    if (patch.name !== undefined) dbPatch.name = patch.name.trim();
    if (patch.description !== undefined) dbPatch.description = patch.description;
    if (patch.examType !== undefined) dbPatch.exam_type = patch.examType;
    if (patch.boardCodes !== undefined) dbPatch.board_codes = normalizeBoardCodes(patch.boardCodes);
    if (patch.examDate !== undefined) dbPatch.exam_date = patch.examDate;
    if (patch.startTime !== undefined) dbPatch.start_time = patch.startTime;
    if (patch.endTime !== undefined) dbPatch.end_time = patch.endTime;
    if (patch.durationMinutes !== undefined) dbPatch.duration_minutes = Number(patch.durationMinutes);
    if (patch.totalMarks !== undefined) dbPatch.total_marks = Number(patch.totalMarks);
    if (patch.passingMarks !== undefined) dbPatch.passing_marks = Number(patch.passingMarks);
    if (patch.questionIds !== undefined) dbPatch.question_ids = patch.questionIds;
    if (patch.instructions !== undefined) dbPatch.instructions = patch.instructions;
    if (patch.resultsPublished !== undefined) dbPatch.results_published = Boolean(patch.resultsPublished);
    if (patch.status !== undefined) dbPatch.status = patch.status;

    const updated = await this.store.updateExam(id, dbPatch);
    await this.adminAuthService.recordAudit({
      admin,
      action: 'exam.update',
      entityType: 'exam',
      entityId: id,
      summary: `Updated exam "${updated.name}" [${updated.status}]`,
      metadata: { fields: Object.keys(dbPatch) },
      ipAddress,
    });
    return updated;
  }

  async listExamAttempts({ examId = null, userId = null } = {}) {
    const [attempts, profiles] = await Promise.all([
      this.store.listExamAttempts({ examId, userId }),
      this.store.listAllProfiles(),
    ]);
    const profMap = new Map(profiles.map((p) => [p.id, p]));
    return attempts.map((a) => ({
      ...a,
      studentName: profMap.get(a.user_id)?.full_name || 'Student',
      studentCode: profMap.get(a.user_id)?.student_code || '',
      board: profMap.get(a.user_id)?.board || 'AP',
    }));
  }

  async evaluateExamAttempt({ admin, attemptId, descriptiveScore, evaluatorNotes = '', ipAddress }) {
    const attempt = await this.store.getExamAttemptById(attemptId);
    if (!attempt) throw new NotFoundError('Exam attempt not found');
    const desc = Number(descriptiveScore || 0);
    const total = Number(attempt.objective_score || 0) + desc;
    const updated = await this.store.updateExamAttempt(attemptId, {
      descriptive_score: desc,
      total_score: total,
      evaluator_notes: evaluatorNotes,
      evaluated_by: admin.id,
      evaluated_at: new Date().toISOString(),
      status: 'evaluated',
    });
    await this.adminAuthService.recordAudit({
      admin,
      action: 'exam.evaluate',
      entityType: 'exam_attempt',
      entityId: attemptId,
      summary: `Evaluated exam attempt ${attemptId}: total ${total}/${attempt.total_marks}`,
      ipAddress,
    });
    return updated;
  }

  async startStudentExam({ user, examId }) {
    const exam = await this.store.getExamById(examId);
    if (!exam || exam.status !== 'published') {
      throw new NotFoundError('Exam not available', 'EXAM_NOT_FOUND');
    }
    const startedAt = new Date();
    const expiresAt = new Date(startedAt.getTime() + (exam.duration_minutes || 60) * 60 * 1000);
    const questions = [];
    for (const qId of exam.question_ids || []) {
      const q = await this.store.getQuestionById(qId);
      if (q) questions.push(q);
    }
    const attempt = await this.store.createExamAttempt({
      exam_id: exam.id,
      user_id: user.id,
      started_at: startedAt.toISOString(),
      expires_at: expiresAt.toISOString(),
      status: 'in_progress',
      objective_score: 0,
      descriptive_score: 0,
      total_score: 0,
      total_marks: exam.total_marks || questions.reduce((s, q) => s + Number(q.marks || 1), 0),
      answers_json: [],
    });

    return {
      attemptId: attempt.id,
      exam: {
        id: exam.id,
        name: exam.name,
        durationMinutes: exam.duration_minutes,
        totalMarks: attempt.total_marks,
        instructions: exam.instructions,
      },
      expiresAt: attempt.expires_at,
      questions: questions.map((q) => ({
        id: q.id,
        questionText: q.question_text,
        questionType: q.question_type,
        options: q.options_json || [],
        marks: Number(q.marks || 1),
      })),
    };
  }

  async submitStudentExam({ user, examId, attemptId, answers = [] }) {
    const exam = await this.store.getExamById(examId);
    const attempt = await this.store.getExamAttemptById(attemptId);
    if (!exam || !attempt || attempt.exam_id !== examId || attempt.user_id !== user.id) {
      throw new NotFoundError('Exam attempt not found');
    }
    const answerMap = new Map(answers.map((a) => [a.questionId, a]));
    let objectiveScore = 0;
    let hasDescriptive = false;

    const evaluatedAnswers = [];
    for (const qId of exam.question_ids || []) {
      const q = await this.store.getQuestionById(qId);
      if (!q) continue;
      const ans = answerMap.get(q.id);
      if (OBJECTIVE_TYPES.has(q.question_type)) {
        const ok = ans?.selectedOptionIndex !== undefined && Number(ans.selectedOptionIndex) === Number(q.correct_option_index);
        if (ok) objectiveScore += Number(q.marks || 1);
        evaluatedAnswers.push({ questionId: q.id, selectedOptionIndex: ans?.selectedOptionIndex ?? null, isCorrect: ok });
      } else {
        hasDescriptive = true;
        evaluatedAnswers.push({ questionId: q.id, answerText: ans?.answerText || '', pendingManualEvaluation: true });
      }
    }

    const updated = await this.store.updateExamAttempt(attempt.id, {
      status: hasDescriptive ? 'submitted' : 'evaluated',
      submitted_at: new Date().toISOString(),
      objective_score: objectiveScore,
      total_score: objectiveScore,
      answers_json: evaluatedAnswers,
    });
    return updated;
  }
}
