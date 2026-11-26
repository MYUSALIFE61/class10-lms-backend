import crypto from 'node:crypto';
import { NotFoundError, ValidationError } from '../utils/errors.js';

function withinDateRange(iso, fromDate, toDate) {
  if (!iso) return true;
  const ts = new Date(iso).getTime();
  if (fromDate && ts < new Date(fromDate).getTime()) return false;
  if (toDate && ts > new Date(`${toDate}T23:59:59.999Z`).getTime()) return false;
  return true;
}

export class AdminOperationsService {
  constructor({ store, authProvider, adminAuthService, curriculumService }) {
    this.store = store;
    this.authProvider = authProvider;
    this.adminAuthService = adminAuthService;
    this.curriculumService = curriculumService;
  }

  // ---- 1. Enterprise Dashboard Analytics (16 Live KPIs + 10 Real Charts) ----
  async getDashboardAnalytics({ board = null, subjectId = null, fromDate = null, toDate = null } = {}) {
    const [
      allProfiles,
      subjects,
      chapters,
      lessons,
      videoSources,
      resources,
      questions,
      quizzes,
      exams,
      progressRows,
      quizAttempts,
      examAttempts,
      playbackLogs,
      subscriptions,
    ] = await Promise.all([
      this.store.listAllProfiles(),
      this.store.listSubjects({ board, includeAll: true }),
      this.store.listAllChapters({ subjectId }),
      this.store.listAllLessons({ subjectId }),
      this.store.listAllVideoSources(),
      this.store.listStudyResources({ subjectId, includeAll: true }),
      this.store.listQuestions({ subjectId, includeAll: true }),
      this.store.listQuizzes({ subjectId, includeAll: true }),
      this.store.listExams({ subjectId, includeAll: true }),
      this.store.listAllProgress(),
      this.store.listQuizAttempts(),
      this.store.listExamAttempts(),
      this.store.listAllPlaybackLogs(),
      this.store.listAllSubscriptions(),
    ]);

    const students = allProfiles.filter((p) => {
      if (p.role && p.role !== 'student') return false;
      if (board && p.board !== board) return false;
      return withinDateRange(p.created_at, fromDate, toDate);
    });
    const studentIds = new Set(students.map((s) => s.id));
    const filteredProgress = progressRows.filter((p) => studentIds.has(p.user_id));

    const activeStudents = students.filter(
      (s) => s.is_active !== false && (s.account_status || 'active') === 'active'
    ).length;
    const inactiveStudents = students.length - activeStudents;
    const apStudents = students.filter((s) => s.board === 'AP').length;
    const tsStudents = students.filter((s) => s.board === 'TS').length;

    const completedLessons = filteredProgress.filter((p) => p.is_completed).length;
    const pendingLessons = Math.max(0, filteredProgress.filter((p) => !p.is_completed).length);
    const totalWatchTimeSeconds = filteredProgress.reduce(
      (sum, p) => sum + Number(p.watch_time_seconds || p.last_position_seconds || 0),
      0
    );

    const kpis = {
      totalStudents: students.length,
      activeStudents,
      inactiveStudents,
      apSscStudents: apStudents,
      telanganaSscStudents: tsStudents,
      totalSubjects: subjects.filter((s) => s.is_active !== false).length,
      totalChapters: chapters.filter((c) => c.is_active !== false).length,
      totalLessons: lessons.filter((l) => l.is_active !== false).length,
      totalUploadedVideos: videoSources.length,
      totalStudyMaterials: resources.length,
      totalMcqQuestions: questions.length,
      totalPublishedTests: quizzes.filter((q) => q.status === 'published').length,
      totalExams: exams.length,
      completedLessons,
      pendingLessons,
      totalVideoWatchTimeMinutes: Math.round(totalWatchTimeSeconds / 60),
    };

    // Chart 1: Daily student registrations (last 14 days from real DB timestamps)
    const regByDay = new Map();
    for (const s of students) {
      const day = String(s.created_at || new Date().toISOString()).slice(0, 10);
      regByDay.set(day, (regByDay.get(day) || 0) + 1);
    }
    const dailyRegistrations = [...regByDay.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, count]) => ({ date, count }));

    // Chart 2: Weekly & Monthly active students
    const now = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;
    const weeklyActive = students.filter((s) => {
      const t = new Date(s.last_active_at || s.updated_at || s.created_at || 0).getTime();
      return now - t <= 7 * dayMs;
    }).length;
    const monthlyActive = students.filter((s) => {
      const t = new Date(s.last_active_at || s.updated_at || s.created_at || 0).getTime();
      return now - t <= 30 * dayMs;
    }).length;

    // Chart 3: Board-wise student distribution
    const boardDistribution = [
      { board: 'AP SSC', code: 'AP', count: apStudents },
      { board: 'Telangana SSC', code: 'TS', count: tsStudents },
    ];

    // Chart 4 & 6: Subject-wise completion & popularity
    const lessonSubjectMap = new Map(lessons.map((l) => [l.id, l.subject_id]));
    const subjectCompletion = subjects
      .filter((s) => s.is_active !== false)
      .map((sub) => {
        const subLessons = lessons.filter((l) => l.subject_id === sub.id && l.is_active !== false);
        const subProg = filteredProgress.filter((p) => lessonSubjectMap.get(p.lesson_id) === sub.id);
        const comp = subProg.filter((p) => p.is_completed).length;
        const avgPct =
          subProg.length > 0
            ? Math.round(subProg.reduce((a, b) => a + Number(b.completion_percent || 0), 0) / subProg.length)
            : 0;
        const watchViews = playbackLogs.filter(
          (log) => log.granted && lessonSubjectMap.get(log.lesson_id) === sub.id
        ).length;
        return {
          subjectId: sub.id,
          subject: sub.title,
          totalLessons: subLessons.length,
          completedCount: comp,
          averageCompletionPct: avgPct,
          engagementCount: watchViews + subProg.length,
        };
      });

    // Chart 5: Most-watched lessons
    const lessonById = new Map(lessons.map((l) => [l.id, l]));
    const watchByLesson = new Map();
    for (const p of filteredProgress) {
      const curr = watchByLesson.get(p.lesson_id) || { views: 0, watchMinutes: 0, completions: 0 };
      curr.views += 1;
      curr.watchMinutes += Math.round(Number(p.watch_time_seconds || p.last_position_seconds || 0) / 60);
      if (p.is_completed) curr.completions += 1;
      watchByLesson.set(p.lesson_id, curr);
    }
    const mostWatchedLessons = [...watchByLesson.entries()]
      .map(([lessonId, stats]) => ({
        lessonId,
        title: lessonById.get(lessonId)?.title || 'Lesson',
        ...stats,
      }))
      .sort((a, b) => b.views - a.views || b.watchMinutes - a.watchMinutes)
      .slice(0, 8);

    // Chart 7: Quiz performance
    const quizMap = new Map(quizzes.map((q) => [q.id, q.title]));
    const quizGroups = new Map();
    for (const a of quizAttempts) {
      if (!studentIds.has(a.user_id) || a.status === 'in_progress') continue;
      const g = quizGroups.get(a.quiz_id) || { attempts: 0, sumPct: 0, passed: 0 };
      g.attempts += 1;
      g.sumPct += Number(a.percentage || 0);
      if (a.passed) g.passed += 1;
      quizGroups.set(a.quiz_id, g);
    }
    const quizPerformance = [...quizGroups.entries()].map(([quizId, g]) => ({
      quizId,
      title: quizMap.get(quizId) || 'Quiz',
      attempts: g.attempts,
      averagePct: Math.round(g.sumPct / g.attempts),
      passRatePct: Math.round((g.passed / g.attempts) * 100),
    }));

    // Chart 8: Exam performance
    const examMap = new Map(exams.map((e) => [e.id, e.name]));
    const examGroups = new Map();
    for (const a of examAttempts) {
      if (!studentIds.has(a.user_id) || a.status === 'in_progress') continue;
      const g = examGroups.get(a.exam_id) || { attempts: 0, sumScore: 0, totalMarks: Number(a.total_marks || 1) };
      g.attempts += 1;
      g.sumScore += Number(a.total_score || 0);
      examGroups.set(a.exam_id, g);
    }
    const examPerformance = [...examGroups.entries()].map(([examId, g]) => ({
      examId,
      name: examMap.get(examId) || 'Exam',
      attempts: g.attempts,
      averageScore: Number((g.sumScore / g.attempts).toFixed(1)),
      totalMarks: g.totalMarks,
    }));

    // Chart 9: Student engagement breakdown
    const activeSubUsers = new Set(
      subscriptions.filter((s) => s.status === 'active' && new Date(s.expires_at).getTime() > now).map((s) => s.user_id)
    );
    const studentEngagement = {
      weeklyActive,
      monthlyActive,
      paidSubscribers: students.filter((s) => activeSubUsers.has(s.id)).length,
      videoWatchers: new Set(filteredProgress.map((p) => p.user_id)).size,
      quizTakers: new Set(quizAttempts.filter((a) => studentIds.has(a.user_id)).map((a) => a.user_id)).size,
    };

    // Chart 10: Content publication statistics
    const statusBuckets = ['draft', 'under_review', 'approved', 'scheduled', 'published', 'archived'];
    const contentPublication = statusBuckets.map((status) => ({
      status,
      lessons: lessons.filter((l) => (l.status || 'published') === status).length,
      resources: resources.filter((r) => (r.status || 'published') === status).length,
      quizzes: quizzes.filter((q) => (q.status || 'draft') === status).length,
    }));

    return {
      kpis,
      charts: {
        dailyRegistrations,
        activeTrend: [
          { period: 'Weekly Active (7d)', count: weeklyActive },
          { period: 'Monthly Active (30d)', count: monthlyActive },
          { period: 'Total Registered', count: students.length },
        ],
        boardDistribution,
        subjectCompletion,
        mostWatchedLessons,
        popularSubjects: [...subjectCompletion].sort((a, b) => b.engagementCount - a.engagementCount),
        quizPerformance,
        examPerformance,
        studentEngagement,
        contentPublication,
      },
    };
  }

  // ---- 2. Student Management & 13-Section Profile ----
  async listStudents({ search = '', board = null, status = null, subscriptionStatus = null } = {}) {
    const [profiles, subscriptions, progressRows] = await Promise.all([
      this.store.listAllProfiles(),
      this.store.listAllSubscriptions(),
      this.store.listAllProgress(),
    ]);
    const now = Date.now();
    const latestSubByUser = new Map();
    for (const s of subscriptions) {
      const prev = latestSubByUser.get(s.user_id);
      if (!prev || new Date(s.created_at) > new Date(prev.created_at)) {
        latestSubByUser.set(s.user_id, s);
      }
    }

    const q = search.trim().toLowerCase();
    return profiles
      .filter((p) => !p.role || p.role === 'student')
      .map((p) => {
        const sub = latestSubByUser.get(p.id);
        const subActive = Boolean(sub && sub.status === 'active' && new Date(sub.expires_at).getTime() > now);
        const subState = subActive ? 'active' : sub?.status || 'unpaid';
        const accStatus = p.is_active === false ? 'inactive' : p.account_status || 'active';
        const userProg = progressRows.filter((r) => r.user_id === p.id);
        return {
          id: p.id,
          registrationNumber: p.student_code,
          fullName: p.full_name,
          email: p.email,
          phone: p.phone || '',
          avatarUrl: p.avatar_url || null,
          board: p.board || 'AP',
          medium: p.medium || 'EN',
          className: p.class_name || 'Class 10',
          school: p.school || '',
          district: p.district || '',
          academicYearId: p.academic_year_id || null,
          accountStatus: accStatus,
          subscriptionStatus: subState,
          subscriptionExpiresAt: sub?.expires_at || null,
          completedLessons: userProg.filter((r) => r.is_completed).length,
          registrationDate: p.created_at || null,
          lastActiveDate: p.last_active_at || p.updated_at || p.created_at || null,
        };
      })
      .filter((s) => {
        if (board && s.board !== board) return false;
        if (status && s.accountStatus !== status) return false;
        if (subscriptionStatus && s.subscriptionStatus !== subscriptionStatus) return false;
        if (
          q &&
          !s.fullName.toLowerCase().includes(q) &&
          !s.email.toLowerCase().includes(q) &&
          !s.registrationNumber.toLowerCase().includes(q) &&
          !s.phone.toLowerCase().includes(q)
        ) {
          return false;
        }
        return true;
      });
  }

  async getStudentDetail(studentId) {
    const profile = await this.store.getProfileById(studentId);
    if (!profile) throw new NotFoundError('Student not found', 'STUDENT_NOT_FOUND');

    const [
      subjects,
      chapters,
      lessons,
      progressRows,
      quizAttempts,
      examAttempts,
      mcqAttempts,
      playbackLogs,
      devices,
      latestSub,
      quizzes,
      exams,
    ] = await Promise.all([
      this.store.listSubjects({ board: profile.board }),
      this.store.listAllChapters(),
      this.store.listAllLessons(),
      this.store.listUserProgress(studentId),
      this.store.listQuizAttempts({ userId: studentId }),
      this.store.listExamAttempts({ userId: studentId }),
      this.store.listUserMcqAttempts(studentId),
      this.store.listUserPlaybackLogs(studentId),
      this.store.listUserDevices(studentId),
      this.store.getLatestSubscription(studentId),
      this.store.listQuizzes({ includeAll: true }),
      this.store.listExams({ includeAll: true }),
    ]);

    const lessonMap = new Map(lessons.map((l) => [l.id, l]));
    const quizMap = new Map(quizzes.map((q) => [q.id, q.title]));
    const examMap = new Map(exams.map((e) => [e.id, e.name]));

    const enrolledSubjects = subjects.map((sub) => {
      const subLessons = lessons.filter((l) => l.subject_id === sub.id && l.is_active !== false);
      const completed = progressRows.filter(
        (p) => p.is_completed && lessonMap.get(p.lesson_id)?.subject_id === sub.id
      ).length;
      return {
        subjectId: sub.id,
        title: sub.title,
        totalLessons: subLessons.length,
        completedLessons: completed,
        progressPct: subLessons.length > 0 ? Math.round((completed / subLessons.length) * 100) : 0,
      };
    });

    const chapterProgress = chapters
      .filter((c) => subjects.some((s) => s.id === c.subject_id))
      .map((ch) => {
        const chLessons = lessons.filter((l) => l.chapter_id === ch.id && l.is_active !== false);
        const completed = progressRows.filter(
          (p) => p.is_completed && lessonMap.get(p.lesson_id)?.chapter_id === ch.id
        ).length;
        return {
          chapterId: ch.id,
          subjectId: ch.subject_id,
          title: ch.title,
          totalLessons: chLessons.length,
          completedLessons: completed,
          progressPct: chLessons.length > 0 ? Math.round((completed / chLessons.length) * 100) : 0,
        };
      });

    return {
      personal: {
        id: profile.id,
        registrationNumber: profile.student_code,
        fullName: profile.full_name,
        email: profile.email,
        phone: profile.phone || '',
        avatarUrl: profile.avatar_url || null,
        accountStatus: profile.is_active === false ? 'inactive' : profile.account_status || 'active',
        createdAt: profile.created_at,
        lastActiveAt: profile.last_active_at || profile.updated_at || profile.created_at,
      },
      academic: {
        board: profile.board,
        medium: profile.medium || 'EN',
        className: profile.class_name || 'Class 10',
        school: profile.school || '',
        district: profile.district || '',
        academicYearId: profile.academic_year_id || null,
      },
      enrolledSubjects,
      chapterProgress,
      lessonCompletion: progressRows.map((p) => ({
        lessonId: p.lesson_id,
        lessonTitle: lessonMap.get(p.lesson_id)?.title || 'Lesson',
        lastPositionSeconds: p.last_position_seconds,
        durationSeconds: p.duration_seconds,
        watchTimeSeconds: p.watch_time_seconds || p.last_position_seconds || 0,
        completionPercent: p.completion_percent,
        isCompleted: p.is_completed,
        updatedAt: p.updated_at,
      })),
      videoWatchHistory: playbackLogs.slice(0, 30).map((log) => ({
        id: log.id,
        lessonId: log.lesson_id,
        lessonTitle: lessonMap.get(log.lesson_id)?.title || 'Lesson',
        granted: log.granted,
        denialReason: log.denial_reason || null,
        createdAt: log.created_at,
      })),
      quizAttempts: [
        ...quizAttempts.map((a) => ({
          id: a.id,
          quizTitle: quizMap.get(a.quiz_id) || 'Quiz',
          score: a.score,
          totalMarks: a.total_marks,
          percentage: a.percentage,
          passed: a.passed,
          status: a.status,
          submittedAt: a.submitted_at || a.created_at,
        })),
        ...mcqAttempts.map((a) => ({
          id: a.id,
          quizTitle: `Lesson Practice: ${lessonMap.get(a.lesson_id)?.title || 'Lesson'}`,
          score: a.score,
          totalMarks: a.total_questions,
          percentage: Math.round((a.score / Math.max(1, a.total_questions)) * 100),
          passed: a.score / Math.max(1, a.total_questions) >= 0.4,
          status: 'submitted',
          submittedAt: a.attempted_at,
        })),
      ],
      examResults: examAttempts.map((a) => ({
        id: a.id,
        examName: examMap.get(a.exam_id) || 'Exam',
        objectiveScore: a.objective_score,
        descriptiveScore: a.descriptive_score,
        totalScore: a.total_score,
        totalMarks: a.total_marks,
        status: a.status,
        submittedAt: a.submitted_at || a.created_at,
      })),
      certificates: enrolledSubjects
        .filter((s) => s.totalLessons > 0 && s.progressPct === 100)
        .map((s) => ({
          id: `cert-${profile.id.slice(0, 6)}-${s.subjectId.slice(0, 6)}`,
          title: `Class 10 ${profile.board} SSC — ${s.title} Mastery`,
          issuedAt: new Date().toISOString(),
        })),
      subscription: latestSub || { status: 'unpaid', isActive: false },
      devices,
    };
  }

  async updateStudent({ admin, studentId, patch, ipAddress }) {
    const existing = await this.store.getProfileById(studentId);
    if (!existing) throw new NotFoundError('Student not found');

    const dbPatch = {};
    if (patch.fullName !== undefined) dbPatch.full_name = patch.fullName.trim();
    if (patch.phone !== undefined) dbPatch.phone = patch.phone;
    if (patch.board !== undefined) dbPatch.board = patch.board;
    if (patch.medium !== undefined) dbPatch.medium = patch.medium;
    if (patch.school !== undefined) dbPatch.school = patch.school;
    if (patch.district !== undefined) dbPatch.district = patch.district;
    if (patch.academicYearId !== undefined) dbPatch.academic_year_id = patch.academicYearId;
    if (patch.accountStatus !== undefined) {
      dbPatch.account_status = patch.accountStatus;
      dbPatch.is_active = patch.accountStatus === 'active';
      if (patch.accountStatus !== 'active') {
        await this.store.revokeAllSessionsForUser(studentId, `admin_${patch.accountStatus}`);
      }
    }

    const updated = await this.store.updateProfile(studentId, dbPatch);
    await this.adminAuthService.recordAudit({
      admin,
      action: 'student.update',
      entityType: 'student',
      entityId: studentId,
      summary: `Updated student ${updated.full_name} (${Object.keys(dbPatch).join(', ')})`,
      ipAddress,
    });
    return updated;
  }

  async resetStudentPassword({ admin, studentId, newPassword, ipAddress }) {
    const profile = await this.store.getProfileById(studentId);
    if (!profile) throw new NotFoundError('Student not found');
    if (!newPassword || newPassword.length < 8) {
      throw new ValidationError('New password must be at least 8 characters');
    }

    if (this.authProvider?.users instanceof Map) {
      const rec = this.authProvider.users.get(profile.email.toLowerCase());
      if (rec) rec.password = newPassword;
    } else if (this.store.db?.auth?.admin?.updateUserById) {
      const { error } = await this.store.db.auth.admin.updateUserById(studentId, { password: newPassword });
      if (error) throw new ValidationError(error.message);
    }

    await this.store.revokeAllSessionsForUser(studentId, 'admin_password_reset');
    await this.adminAuthService.recordAudit({
      admin,
      action: 'student.password_reset',
      entityType: 'student',
      entityId: studentId,
      summary: `Reset password and revoked sessions for ${profile.email}`,
      ipAddress,
    });
    return { reset: true };
  }

  // ---- 3. Detailed Progress Reports ----
  async getProgressReports({ board = null, subjectId = null } = {}) {
    const [students, progressRows, quizAttempts, lessons, subjects] = await Promise.all([
      this.listStudents({ board }),
      this.store.listAllProgress(),
      this.store.listQuizAttempts(),
      this.store.listAllLessons({ subjectId }),
      this.store.listSubjects({ board, includeAll: true }),
    ]);

    const publishedLessons = lessons.filter((l) => l.is_active !== false && (l.status || 'published') === 'published');
    const totalLessons = Math.max(1, publishedLessons.length);
    const now = Date.now();
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;

    const studentReports = students.map((st) => {
      const sp = progressRows.filter((p) => p.user_id === st.id);
      const completed = sp.filter((p) => p.is_completed).length;
      const watchMin = Math.round(
        sp.reduce((acc, p) => acc + Number(p.watch_time_seconds || p.last_position_seconds || 0), 0) / 60
      );
      const qa = quizAttempts.filter((a) => a.user_id === st.id && a.status !== 'in_progress');
      const avgQuizPct = qa.length
        ? Math.round(qa.reduce((acc, a) => acc + Number(a.percentage || 0), 0) / qa.length)
        : null;
      const inactive = now - new Date(st.lastActiveDate || 0).getTime() > sevenDaysMs;
      return {
        studentId: st.id,
        registrationNumber: st.registrationNumber,
        fullName: st.fullName,
        board: st.board,
        completedLessons: completed,
        progressPct: Math.min(100, Math.round((completed / totalLessons) * 100)),
        watchMinutes: watchMin,
        quizAttempts: qa.length,
        avgQuizPct,
        isInactive: inactive,
        isLowPerforming: (avgQuizPct !== null && avgQuizPct < 50) || (completed === 0 && sp.length > 0),
      };
    });

    return {
      studentReports,
      inactiveStudents: studentReports.filter((s) => s.isInactive),
      lowPerformingStudents: studentReports.filter((s) => s.isLowPerforming),
      subjectSummary: subjects.map((sub) => {
        const subLessonIds = new Set(lessons.filter((l) => l.subject_id === sub.id).map((l) => l.id));
        const subProg = progressRows.filter((p) => subLessonIds.has(p.lesson_id));
        return {
          subjectId: sub.id,
          title: sub.title,
          totalLessons: subLessonIds.size,
          completions: subProg.filter((p) => p.is_completed).length,
          activeLearners: new Set(subProg.map((p) => p.user_id)).size,
        };
      }),
    };
  }

  // ---- 4. Targeted Notifications ----
  async sendNotification({ admin, data, ipAddress }) {
    const allStudents = await this.listStudents();
    let targets = allStudents;
    if (data.audienceType === 'board_ap') {
      targets = allStudents.filter((s) => s.board === 'AP');
    } else if (data.audienceType === 'board_ts') {
      targets = allStudents.filter((s) => s.board === 'TS');
    } else if (data.audienceType === 'selected_students' && Array.isArray(data.studentIds)) {
      const set = new Set(data.studentIds);
      targets = allStudents.filter((s) => set.has(s.id));
    }

    const notif = await this.store.createNotification({
      title: data.title.trim(),
      message: data.message.trim(),
      notification_type: data.notificationType || 'general',
      audience_type: data.audienceType || 'all',
      audience_filter_json: {
        subjectId: data.subjectId || null,
        chapterId: data.chapterId || null,
        studentIds: data.studentIds || [],
      },
      deep_link: data.deepLink || '/dashboard',
      sent_by: admin.id,
    });

    await this.store.addNotificationRecipients(
      targets.map((st) => ({
        notification_id: notif.id,
        user_id: st.id,
        delivery_status: 'delivered',
        is_read: false,
      }))
    );

    await this.adminAuthService.recordAudit({
      admin,
      action: 'notification.send',
      entityType: 'notification',
      entityId: notif.id,
      summary: `Sent "${notif.title}" to ${targets.length} student(s) (${notif.audience_type})`,
      ipAddress,
    });

    return {
      ...notif,
      recipientCount: targets.length,
      deliveredCount: targets.length,
      readCount: 0,
    };
  }

  async listNotifications() {
    const [notifs, recipients] = await Promise.all([
      this.store.listNotifications(),
      this.store.listNotificationRecipients(),
    ]);
    return notifs.map((n) => {
      const recs = recipients.filter((r) => r.notification_id === n.id);
      return {
        ...n,
        recipientCount: recs.length,
        deliveredCount: recs.filter((r) => r.delivery_status === 'delivered').length,
        readCount: recs.filter((r) => r.is_read).length,
      };
    });
  }

  // ---- 5. Subscription Plans & Student Subscriptions ----
  async listSubscriptionOverview() {
    const [plans, subscriptions, payments, profiles] = await Promise.all([
      this.store.listAllPlans(),
      this.store.listAllSubscriptions(),
      this.store.listAllPayments(),
      this.store.listAllProfiles(),
    ]);
    const profMap = new Map(profiles.map((p) => [p.id, p]));
    const planMap = new Map(plans.map((p) => [p.id, p]));

    return {
      plans: plans.map((p) => ({
        ...p,
        priceRupees: Math.round(Number(p.price_paise || 0) / 100),
      })),
      subscriptions: subscriptions.map((s) => ({
        ...s,
        studentName: profMap.get(s.user_id)?.full_name || 'Student',
        studentEmail: profMap.get(s.user_id)?.email || '',
        board: profMap.get(s.user_id)?.board || 'AP',
        planName: planMap.get(s.plan_id)?.name || 'Class 10 Plan',
      })),
      payments: payments.map((p) => ({
        ...p,
        studentName: profMap.get(p.user_id)?.full_name || 'Student',
        amountRupees: Math.round(Number(p.amount_paise || 0) / 100),
      })),
    };
  }

  async createPlan({ admin, data, ipAddress }) {
    const rec = await this.store.createPlan({
      code: data.code.trim().toUpperCase(),
      name: data.name.trim(),
      description: data.description || '',
      price_paise: Math.round(Number(data.priceRupees) * 100),
      currency: 'INR',
      duration_days: Number(data.durationDays || 365),
      is_active: data.isActive !== false,
    });
    await this.adminAuthService.recordAudit({
      admin,
      action: 'plan.create',
      entityType: 'subscription_plan',
      entityId: rec.id,
      summary: `Created plan "${rec.name}" (₹${Math.round(rec.price_paise / 100)} / ${rec.duration_days}d)`,
      ipAddress,
    });
    return rec;
  }

  async updatePlan({ admin, id, patch, ipAddress }) {
    const dbPatch = {};
    if (patch.name !== undefined) dbPatch.name = patch.name.trim();
    if (patch.description !== undefined) dbPatch.description = patch.description;
    if (patch.priceRupees !== undefined) dbPatch.price_paise = Math.round(Number(patch.priceRupees) * 100);
    if (patch.durationDays !== undefined) dbPatch.duration_days = Number(patch.durationDays);
    if (patch.isActive !== undefined) dbPatch.is_active = Boolean(patch.isActive);

    const updated = await this.store.updatePlan(id, dbPatch);
    if (!updated) throw new NotFoundError('Subscription plan not found');
    await this.adminAuthService.recordAudit({
      admin,
      action: 'plan.update',
      entityType: 'subscription_plan',
      entityId: id,
      summary: `Updated plan "${updated.name}"`,
      ipAddress,
    });
    return updated;
  }

  async assignOrExtendSubscription({ admin, studentId, planId, extendDays = null, status = 'active', ipAddress }) {
    const profile = await this.store.getProfileById(studentId);
    if (!profile) throw new NotFoundError('Student not found');
    const plans = await this.store.listAllPlans();
    const plan = plans.find((p) => p.id === planId) || plans[0];
    if (!plan) throw new NotFoundError('Subscription plan not found');

    const days = Number(extendDays || plan.duration_days || 365);
    const now = new Date();
    const latest = await this.store.getLatestSubscription(studentId);
    const baseTime =
      latest && latest.expires_at && new Date(latest.expires_at).getTime() > now.getTime()
        ? new Date(latest.expires_at).getTime()
        : now.getTime();
    const expiresAt = new Date(baseTime + days * 24 * 60 * 60 * 1000).toISOString();

    let sub;
    if (latest) {
      // Preserve verified payment linkage or create admin-grant audit payment record for entitlement checks
      let paymentId = latest.latest_payment_id;
      if (!paymentId && status === 'active') {
        const grantTx = await this.store.createPaymentTransaction({
          user_id: studentId,
          subscription_id: latest.id,
          plan_id: plan.id,
          razorpay_order_id: `admin_grant_${crypto.randomBytes(6).toString('hex')}`,
          razorpay_payment_id: `admin_grant_pay_${crypto.randomBytes(6).toString('hex')}`,
          amount_paise: plan.price_paise,
          currency: 'INR',
          status: 'captured',
          verified_at: now.toISOString(),
        });
        paymentId = grantTx.id;
      }
      sub = await this.store.updateSubscription(latest.id, {
        plan_id: plan.id,
        status,
        starts_at: latest.starts_at || now.toISOString(),
        expires_at: status === 'active' ? expiresAt : latest.expires_at,
        latest_payment_id: paymentId,
      });
    } else {
      sub = await this.store.createSubscription({
        user_id: studentId,
        plan_id: plan.id,
        status,
        starts_at: now.toISOString(),
        expires_at: expiresAt,
      });
      if (status === 'active') {
        const grantTx = await this.store.createPaymentTransaction({
          user_id: studentId,
          subscription_id: sub.id,
          plan_id: plan.id,
          razorpay_order_id: `admin_grant_${crypto.randomBytes(6).toString('hex')}`,
          razorpay_payment_id: `admin_grant_pay_${crypto.randomBytes(6).toString('hex')}`,
          amount_paise: plan.price_paise,
          currency: 'INR',
          status: 'captured',
          verified_at: now.toISOString(),
        });
        sub = await this.store.updateSubscription(sub.id, { latest_payment_id: grantTx.id });
      }
    }

    await this.adminAuthService.recordAudit({
      admin,
      action: 'subscription.manage',
      entityType: 'subscription',
      entityId: sub.id,
      summary: `Set subscription for ${profile.email} to ${status} (+${days}d)`,
      ipAddress,
    });
    return sub;
  }

  // ---- 6. Dynamic App Configuration & Audit Logs ----
  async getAppConfig() {
    return this.store.getAppConfig();
  }

  async updateAppConfig({ admin, patch, ipAddress }) {
    const updated = await this.store.updateAppConfig(patch);
    await this.adminAuthService.recordAudit({
      admin,
      action: 'app_config.update',
      entityType: 'app_configuration',
      entityId: 'mobile_app',
      summary: `Updated mobile app configuration (${Object.keys(patch).join(', ')})`,
      ipAddress,
    });
    return updated;
  }

  async listAuditLogs({ limit = 100, action = null, entityType = null } = {}) {
    return this.store.listAdminAuditLogs({ limit, action, entityType });
  }

  async listSecurityEvents({ limit = 100, eventType = null, userId = null } = {}) {
    const [events, profiles, lessons] = await Promise.all([
      this.store.listSecurityEvents({ limit, eventType, userId }),
      this.store.listAllProfiles(),
      this.store.listAllLessons(),
    ]);
    const profMap = new Map(profiles.map((p) => [p.id, p]));
    const lessonMap = new Map(lessons.map((l) => [l.id, l]));

    return events.map((ev) => {
      const details = ev.details_json || {};
      const student = profMap.get(ev.user_id);
      const lesson = details.lessonId ? lessonMap.get(details.lessonId) : null;
      return {
        id: ev.id,
        studentId: ev.user_id,
        studentName: student?.full_name || 'Student',
        studentEmail: student?.email || '',
        deviceId: details.clientDeviceId || ev.device_id || null,
        lessonId: details.lessonId || null,
        lessonTitle: lesson?.title || null,
        eventType: ev.event_type,
        severity: ev.severity || 'info',
        androidApiLevel: details.androidApiLevel ?? null,
        protectionAction: details.protectionAction || null,
        eventTimestamp: details.eventTimestamp || ev.created_at,
        createdAt: ev.created_at,
      };
    });
  }
}
