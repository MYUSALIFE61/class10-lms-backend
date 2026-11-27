/**
 * LOCAL DEVELOPMENT PREVIEW SERVER ONLY (NOT FOR PRODUCTION)
 *
 * Allows testing 100% of the real Express routes, JWT auth, device limits,
 * subscription authorization gate, MCQ grading, progress sync, and official
 * YouTube IFrame Player in the browser before connecting live Supabase/Razorpay keys.
 *
 * Production deployments MUST use `npm start` (`src/server.js`) with real `.env` credentials.
 */
import crypto from 'node:crypto';
import os from 'node:os';
import express from 'express';
import { createApp } from '../src/app.js';
import { hmacSha256Hex, generateStudentCode } from '../src/utils/crypto.js';
import {
  InMemoryAuthProvider,
  InMemoryDataStore,
  makeTestConfig,
} from '../tests/helpers/testHarness.js';

if (process.env.NODE_ENV === 'production') {
  throw new Error('dev-preview-server.js must NEVER be executed in production!');
}

const PORT = Number(process.env.PORT || 4000);
const lanOrigins = Object.values(os.networkInterfaces())
  .flat()
  .filter((iface) => iface && iface.family === 'IPv4' && !iface.internal)
  .flatMap((iface) => [`http://${iface.address}:5173`, `http://${iface.address}:5174`]);

const allowedOrigins = [
  'https://localhost',
  'http://localhost',
  'https://app.class10lms.in',
  'http://app.class10lms.in',
  'capacitor://localhost',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://10.0.2.2:5173',
  'http://localhost:5174',
  'http://127.0.0.1:5174',
  ...lanOrigins,
];

const config = makeTestConfig({
  NODE_ENV: 'development',
  PORT,
  ALLOWED_ORIGINS: allowedOrigins.join(','),
  allowedOrigins,
  MAX_DEVICES_PER_STUDENT: 3,
  VIDEO_STORAGE_PROVIDER: process.env.VIDEO_STORAGE_PROVIDER || 'pikpak_local',
  PIKPAK_CLI_PATH: process.env.PIKPAK_CLI_PATH || '',
  STREAM_TOKEN_TTL_SECONDS: 900,
});

const store = new InMemoryDataStore();
const authProvider = new InMemoryAuthProvider();

function seedClass10PreviewCatalog() {
  const subjectsData = [
    {
      slug: 'mathematics',
      title: 'Mathematics',
      description: 'Real Numbers, Polynomials, Quadratic Equations, Trigonometry & Statistics (AP/TS SSC).',
      icon_key: 'calculator',
      accent_color: '#1D4ED8',
      display_order: 1,
    },
    {
      slug: 'physical-science',
      title: 'Physical Science',
      description: 'Reflection & Refraction of Light, Chemical Equations, Acids Bases & Electric Current.',
      icon_key: 'atom',
      accent_color: '#0F766E',
      display_order: 2,
    },
    {
      slug: 'biological-science',
      title: 'Biological Science',
      description: 'Nutrition, Respiration, Transportation, Excretion, Coordination & Heredity.',
      icon_key: 'leaf',
      accent_color: '#15803D',
      display_order: 3,
    },
    {
      slug: 'social-studies',
      title: 'Social Studies',
      description: 'India Relief Features, Climate, Rivers, World Wars & Independent India.',
      icon_key: 'globe',
      accent_color: '#B45309',
      display_order: 4,
    },
    {
      slug: 'english',
      title: 'English',
      description: 'Personality Development, Wit & Humour, Grammar, Comprehension & Creative Writing.',
      icon_key: 'book-open',
      accent_color: '#7C3AED',
      display_order: 5,
    },
    {
      slug: 'telugu',
      title: 'Telugu (First Language)',
      description: 'Padyabhagam, Gadyabhagam, Upavachakam & Vyakaranam for SSC Board Exams.',
      icon_key: 'languages',
      accent_color: '#BE123C',
      display_order: 6,
    },
  ];

  const subjectIds = {};
  for (const s of subjectsData) {
    const id = crypto.randomUUID();
    subjectIds[s.slug] = id;
    store.subjects.set(id, { id, board: 'BOTH', is_active: true, ...s });
  }

  // ---- Mathematics Chapters & Lessons ----
  const mathId = subjectIds.mathematics;
  const chReal = crypto.randomUUID();
  const chPoly = crypto.randomUUID();
  const chLinear = crypto.randomUUID();
  const chQuad = crypto.randomUUID();
  const chAp = crypto.randomUUID();
  const chTrig = crypto.randomUUID();

  store.chapters.set(chReal, {
    id: chReal,
    subject_id: mathId,
    chapter_number: 1,
    title: 'Real Numbers',
    summary: "Euclid's Division Lemma, Fundamental Theorem of Arithmetic, HCF/LCM & Logarithms.",
    display_order: 1,
    is_active: true,
  });
  store.chapters.set(chPoly, {
    id: chPoly,
    subject_id: mathId,
    chapter_number: 2,
    title: 'Polynomials',
    summary: 'Zeroes of a polynomial, geometrical meaning, relationship with coefficients & division algorithm.',
    display_order: 2,
    is_active: true,
  });
  store.chapters.set(chLinear, {
    id: chLinear,
    subject_id: mathId,
    chapter_number: 3,
    title: 'Pair of Linear Equations',
    summary: 'Graphical method, substitution, elimination & consistency conditions in two variables.',
    display_order: 3,
    is_active: true,
  });
  store.chapters.set(chQuad, {
    id: chQuad,
    subject_id: mathId,
    chapter_number: 4,
    title: 'Quadratic Equations',
    summary: 'Factorisation, completing the square, quadratic formula & nature of roots.',
    display_order: 4,
    is_active: true,
  });
  store.chapters.set(chAp, {
    id: chAp,
    subject_id: mathId,
    chapter_number: 5,
    title: 'Arithmetic Progressions',
    summary: 'nth term of an AP, sum of first n terms & Class 10 SSC word problems.',
    display_order: 5,
    is_active: true,
  });
  store.chapters.set(chTrig, {
    id: chTrig,
    subject_id: mathId,
    chapter_number: 11,
    title: 'Trigonometry',
    summary: 'Trigonometric ratios, standard angles, complementary angles & identities.',
    display_order: 6,
    is_active: true,
  });

  // Official embeddable YouTube videos for verifying official IFrame Player API behavior
  const l1 = crypto.randomUUID();
  const l2 = crypto.randomUUID();
  const l3 = crypto.randomUUID();
  store.lessons.set(l1, {
    id: l1,
    subject_id: mathId,
    chapter_id: chReal,
    title: '1.1 Euclid Division Lemma (Free Preview)',
    description: 'Concept explanation & step-by-step AP/TS Class 10 board examples.',
    thumbnail_url: null,
    duration_seconds: 612,
    display_order: 1,
    is_premium: false,
    is_active: true,
  });
  store.videoSources.set(l1, {
    lesson_id: l1,
    provider: 'youtube_unlisted',
    youtube_video_id: 'M7lc1UVf-VE', // Official YouTube Developers IFrame API sample video
  });

  store.lessons.set(l2, {
    id: l2,
    subject_id: mathId,
    chapter_id: chReal,
    title: '1.2 Fundamental Theorem of Arithmetic & Irrational Proofs',
    description: 'Premium Class 10 board lecture (YouTube Unlisted via Official IFrame Player API).',
    thumbnail_url: null,
    duration_seconds: 940,
    display_order: 2,
    is_premium: true,
    is_active: true,
  });
  store.videoSources.set(l2, {
    lesson_id: l2,
    provider: 'youtube_unlisted',
    youtube_video_id: 'aqz-KE-bpKQ',
  });

  store.lessons.set(l3, {
    id: l3,
    subject_id: mathId,
    chapter_id: chTrig,
    title: '11.1 Trigonometric Ratios & Standard Identities',
    description: 'Complete AP & TS SSC 4-mark and 8-mark Trigonometry derivation session.',
    thumbnail_url: null,
    duration_seconds: 1080,
    display_order: 1,
    is_premium: true,
    is_active: true,
  });
  store.videoSources.set(l3, {
    lesson_id: l3,
    provider: 'youtube_unlisted',
    youtube_video_id: 'M7lc1UVf-VE',
  });

  // MCQs below both free preview & premium lessons
  const addMcq = (lessonId, question_text, options_json, correct_option_index, explanation, display_order) => {
    const id = crypto.randomUUID();
    store.mcqs.set(id, {
      id,
      lesson_id: lessonId,
      question_text,
      options_json,
      correct_option_index,
      explanation,
      difficulty: 'medium',
      display_order,
      is_active: true,
    });
  };

  addMcq(
    l1,
    "According to Euclid's Division Lemma, for positive integers a and b, a = bq + r where r satisfies:",
    ['0 < r < b', '0 <= r < b', '0 <= r <= b', 'r > b'],
    1,
    'The remainder r must always be non-negative and strictly less than the divisor b (0 <= r < b).',
    1
  );
  addMcq(
    l1,
    'For any two positive integers a and b, HCF(a, b) × LCM(a, b) equals:',
    ['a + b', 'a - b', 'a × b', 'a / b'],
    2,
    'Fundamental property: Product of HCF and LCM of two positive integers equals their product a × b.',
    2
  );
  addMcq(
    l2,
    'Which of the following is an irrational number?',
    ['0.25', 'sqrt(16)', 'sqrt(2)', '22/7'],
    2,
    'sqrt(2) cannot be written as p/q where p, q are integers with q != 0.',
    1
  );
  addMcq(
    l3,
    'What is the value of sin²(45°) + cos²(45°)?',
    ['0', '1/2', '1', '2'],
    2,
    'By the Pythagorean identity, sin²(θ) + cos²(θ) = 1 for every angle θ.',
    1
  );

  // Notes, PYQs & Formulas
  const n1 = crypto.randomUUID();
  store.notes.set(n1, {
    id: n1,
    subject_id: mathId,
    chapter_id: chReal,
    lesson_id: l1,
    title: 'Real Numbers — Quick Revision Notes (Free Sample)',
    content_markdown:
      "1. Euclid's Division Lemma: For any two positive integers a and b, there exist unique integers q and r such that a = bq + r, 0 <= r < b.\n2. Fundamental Theorem of Arithmetic: Every composite number can be expressed uniquely as a product of primes.\n3. Logarithms: If a^x = N (a > 0, a != 1), then log_a(N) = x.",
    is_premium: false,
    display_order: 1,
    is_active: true,
  });
  const n2 = crypto.randomUUID();
  store.notes.set(n2, {
    id: n2,
    subject_id: mathId,
    chapter_id: chTrig,
    lesson_id: l3,
    title: 'Trigonometry Board Exam Master Notes (Premium)',
    content_markdown:
      'Key Identities:\n• sin²θ + cos²θ = 1\n• 1 + tan²θ = sec²θ\n• 1 + cot²θ = cosec²θ\nComplementary Angles:\n• sin(90° - θ) = cos θ\n• tan(90° - θ) = cot θ',
    is_premium: true,
    display_order: 2,
    is_active: true,
  });

  const pyq1 = crypto.randomUUID();
  store.pyqs.set(pyq1, {
    id: pyq1,
    subject_id: mathId,
    chapter_id: chReal,
    board: 'AP',
    exam_year: 2025,
    marks: 4,
    question_text: 'Prove that 3 + 2√5 is an irrational number.',
    model_answer:
      'Assume 3 + 2√5 = p/q (rational). Then √5 = (p - 3q) / (2q), which is rational — contradicting that √5 is irrational. Hence 3 + 2√5 is irrational.',
    is_premium: true,
    display_order: 1,
    is_active: true,
  });
  const pyq2 = crypto.randomUUID();
  store.pyqs.set(pyq2, {
    id: pyq2,
    subject_id: mathId,
    chapter_id: chReal,
    board: 'TS',
    exam_year: 2024,
    marks: 2,
    question_text: "Find HCF of 900 and 270 using Euclid's Division Algorithm.",
    model_answer: '900 = 270×3 + 90; 270 = 90×3 + 0. Therefore HCF(900, 270) = 90.',
    is_premium: false,
    display_order: 2,
    is_active: true,
  });

  const f1 = crypto.randomUUID();
  store.formulas.set(f1, {
    id: f1,
    subject_id: mathId,
    chapter_id: chReal,
    title: "Euclid's Division Lemma",
    formula_expression: 'a = bq + r,   0 <= r < b',
    explanation: 'Used to find HCF of two positive integers step-by-step.',
    is_premium: false,
    display_order: 1,
    is_active: true,
  });
  const f2 = crypto.randomUUID();
  store.formulas.set(f2, {
    id: f2,
    subject_id: mathId,
    chapter_id: chTrig,
    title: 'Pythagorean Trigonometric Identities',
    formula_expression: 'sin²θ + cos²θ = 1  |  sec²θ - tan²θ = 1  |  cosec²θ - cot²θ = 1',
    explanation: 'Core identities required for Class 10 SSC Trigonometry proofs.',
    is_premium: true,
    display_order: 2,
    is_active: true,
  });

  // ---- Physical Science Sample Chapters ----
  const phyId = subjectIds['physical-science'];
  const chLight = crypto.randomUUID();
  const chChem = crypto.randomUUID();
  store.chapters.set(chLight, {
    id: chLight,
    subject_id: phyId,
    chapter_number: 1,
    title: 'Reflection of Light at Curved Surfaces',
    summary: 'Concave & convex mirror ray diagrams, mirror formula and sign convention.',
    display_order: 1,
    is_active: true,
  });
  store.chapters.set(chChem, {
    id: chChem,
    subject_id: phyId,
    chapter_number: 2,
    title: 'Chemical Equations & Reactions',
    summary: 'Balancing chemical equations, types of chemical reactions & real-life examples.',
    display_order: 2,
    is_active: true,
  });

  // ---- Biological Science, Social Studies & English Chapters ----
  const bioId = subjectIds['biological-science'];
  const chBio = crypto.randomUUID();
  store.chapters.set(chBio, {
    id: chBio,
    subject_id: bioId,
    chapter_number: 1,
    title: 'Nutrition — Food Supplying System',
    summary: 'Autotrophic photosynthesis, heterotrophic nutrition & human digestive system.',
    display_order: 1,
    is_active: true,
  });
  const socId = subjectIds['social-studies'];
  const chSoc = crypto.randomUUID();
  store.chapters.set(chSoc, {
    id: chSoc,
    subject_id: socId,
    chapter_number: 1,
    title: 'India: Relief Features',
    summary: 'Himalayas, Indo-Gangetic Plains, Peninsular Plateau, Coastal Plains & Islands.',
    display_order: 1,
    is_active: true,
  });
  const engId = subjectIds.english;
  const chEng = crypto.randomUUID();
  store.chapters.set(chEng, {
    id: chEng,
    subject_id: engId,
    chapter_number: 1,
    title: 'Personality Development',
    summary: 'Attitude is Altitude, Reading comprehension, vocabulary & creative writing.',
    display_order: 1,
    is_active: true,
  });
  const lPhy = crypto.randomUUID();
  store.lessons.set(lPhy, {
    id: lPhy,
    subject_id: phyId,
    chapter_id: chLight,
    title: '1.1 Mirror Formula & Sign Convention (Free Preview)',
    description: 'Master concave & convex numericals for AP/TS SSC Physical Science.',
    thumbnail_url: null,
    duration_seconds: 720,
    display_order: 1,
    is_premium: false,
    is_active: true,
  });
  store.videoSources.set(lPhy, {
    lesson_id: lPhy,
    provider: 'youtube_unlisted',
    youtube_video_id: 'M7lc1UVf-VE',
  });
  const fPhy = crypto.randomUUID();
  store.formulas.set(fPhy, {
    id: fPhy,
    subject_id: phyId,
    chapter_id: chLight,
    title: 'Mirror Formula & Magnification',
    formula_expression: '1/f = 1/v + 1/u   |   m = -v/u = h_i / h_o',
    explanation: 'Apply Cartesian sign convention carefully for concave (f < 0) and convex (f > 0) mirrors.',
    is_premium: false,
    display_order: 1,
    is_active: true,
  });
}

async function seedPreviewAccounts() {
  const plan =
    (await store.getPlanByCode('CLASS10_ANNUAL_799')) ||
    (await store.getPlanByCode('CLASS10_ANNUAL_499'));

  // 1. Paid Active Subscriber (AP Board)
  const paidUser = await authProvider.signUp({
    email: 'paid@ap10.in',
    password: 'Password1234',
    fullName: 'Ravi Kumar (Subscribed)',
  });
  await store.createProfile({
    id: paidUser.id,
    full_name: 'Ravi Kumar (Subscribed)',
    email: 'paid@ap10.in',
    phone: '9848011223',
    board: 'AP',
    student_code: generateStudentCode('AP'),
    role: 'student',
    is_active: true,
  });
  const paidTx = await store.createPaymentTransaction({
    user_id: paidUser.id,
    plan_id: plan.id,
    razorpay_order_id: 'order_preview_paid_001',
    razorpay_payment_id: 'pay_preview_paid_001',
    amount_paise: 49900,
    currency: 'INR',
    status: 'captured',
    verified_at: new Date().toISOString(),
  });
  await store.createSubscription({
    user_id: paidUser.id,
    plan_id: plan.id,
    status: 'active',
    starts_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 365 * 86400 * 1000).toISOString(),
    latest_payment_id: paidTx.id,
  });

  // 2. Expired Subscriber (TS Board)
  const expUser = await authProvider.signUp({
    email: 'expired@ts10.in',
    password: 'Password1234',
    fullName: 'Anitha Reddy (Expired)',
  });
  await store.createProfile({
    id: expUser.id,
    full_name: 'Anitha Reddy (Expired)',
    email: 'expired@ts10.in',
    phone: '9876500112',
    board: 'TS',
    student_code: generateStudentCode('TS'),
    role: 'student',
    is_active: true,
  });
  const expTx = await store.createPaymentTransaction({
    user_id: expUser.id,
    plan_id: plan.id,
    razorpay_order_id: 'order_preview_exp_001',
    razorpay_payment_id: 'pay_preview_exp_001',
    amount_paise: 49900,
    currency: 'INR',
    status: 'captured',
    verified_at: new Date(Date.now() - 370 * 86400 * 1000).toISOString(),
  });
  await store.createSubscription({
    user_id: expUser.id,
    plan_id: plan.id,
    status: 'active',
    starts_at: new Date(Date.now() - 370 * 86400 * 1000).toISOString(),
    expires_at: new Date(Date.now() - 5 * 86400 * 1000).toISOString(),
    latest_payment_id: expTx.id,
  });
}

seedClass10PreviewCatalog();
await seedPreviewAccounts();

const devGatewayPayments = new Map();
const paymentGateway = {
  async createOrder({ amountPaise, currency }) {
    return {
      id: `order_dev_${crypto.randomBytes(6).toString('hex')}`,
      amount: amountPaise,
      currency,
    };
  },
  async fetchPayment(paymentId) {
    return devGatewayPayments.get(paymentId) || null;
  },
  async fetchOrderPayments(orderId) {
    const items = [...devGatewayPayments.values()].filter((p) => p.order_id === orderId);
    return { items };
  },
};

const integrityProvider = {
  async decodeToken() {
    return {
      configured: false,
      appRecognitionVerdict: 'UNCONFIGURED',
      deviceRecognitionVerdict: [],
      nonce: null,
    };
  },
};

const { app, services } = createApp({
  config,
  store,
  authProvider,
  paymentGateway,
  integrityProvider,
  disableRateLimit: false,
});

// Strict local-dev-only Razorpay Test Mode simulator wrapper BEFORE Express 404 handler
// (NEVER exists in production src/app.js; uses server-side test secret to mint signed test outcomes)
const previewApp = express();
previewApp.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }
  next();
});
previewApp.post('/api/v1/dev-razorpay/simulate', express.json(), async (req, res, next) => {
  try {
    const { orderId, outcome = 'captured', method = 'upi' } = req.body || {};
    const tx = await store.getPaymentByOrderId(orderId);
    if (!tx) {
      return res.status(404).json({ success: false, error: { message: 'Order not found' } });
    }
    const paymentId = `pay_dev_${crypto.randomBytes(6).toString('hex')}`;
    if (outcome === 'failed') {
      devGatewayPayments.set(paymentId, {
        id: paymentId,
        order_id: orderId,
        amount: tx.amount_paise,
        currency: tx.currency,
        method,
        status: 'failed',
        error_code: 'BAD_REQUEST_ERROR',
        error_description: 'Simulated Razorpay Test Mode payment failure (Card/UPI declined).',
        error_reason: 'payment_failed',
      });
      return res.json({
        success: true,
        data: {
          outcome: 'failed',
          razorpayOrderId: orderId,
          razorpayPaymentId: paymentId,
          method,
          errorCode: 'BAD_REQUEST_ERROR',
          errorDescription: 'Simulated Razorpay Test Mode payment failure (Card/UPI declined).',
        },
      });
    }

    const gatewayStatus = outcome === 'pending' ? 'authorized' : 'captured';
    devGatewayPayments.set(paymentId, {
      id: paymentId,
      order_id: orderId,
      amount: tx.amount_paise,
      currency: tx.currency,
      method,
      status: gatewayStatus,
    });
    const signature = hmacSha256Hex(config.RAZORPAY_KEY_SECRET, `${orderId}|${paymentId}`);
    return res.json({
      success: true,
      data: {
        outcome,
        razorpayOrderId: orderId,
        razorpayPaymentId: paymentId,
        razorpaySignature: signature,
        method,
      },
    });
  } catch (err) {
    next(err);
  }
});

// Seed initial DB-backed Topics, Study Resources, Question Bank, Practice Quiz & Upcoming Exam
// so the Student App has ZERO hardcoded educational content on first boot.
async function seedDynamicCmsData() {
  const subjects = await store.listSubjects({ includeAll: true });
  const math = subjects.find((s) => s.slug === 'mathematics') || subjects[0];
  const phy = subjects.find((s) => s.slug === 'physical-science') || subjects[0];
  const bio = subjects.find((s) => s.slug === 'biological-science') || subjects[0];
  if (!math) return;

  const mathChapters = await store.listAllChapters({ subjectId: math.id });
  const chReal = mathChapters.find((c) => c.chapter_number === 1) || mathChapters[0];
  if (!chReal) return;

  await store.createTopic({
    subject_id: math.id,
    chapter_id: chReal.id,
    title: "Euclid's Division Lemma & HCF",
    description: 'Applying a = bq + r step-by-step to compute HCF.',
    learning_objectives: 'Master Euclidean algorithm for AP/TS SSC 4-mark problems.',
    display_order: 1,
    status: 'published',
    is_active: true,
  });

  await store.createStudyResource({
    title: 'Real Numbers — Complete Revision Notes (English Medium)',
    description: 'Chapter 1 summary, Euclid lemma solved problems and key formulas.',
    subject_id: math.id,
    chapter_id: chReal.id,
    resource_type: 'chapter_notes',
    board_codes: ['AP', 'TS'],
    medium: 'EN',
    file_name: 'Class10_Maths_Ch01_RealNumbers_EN.md',
    mime_type: 'text/markdown',
    file_size_bytes: 512,
    content_markdown:
      "### Euclid's Division Lemma\nFor any two positive integers `a` and `b`, there exist unique integers `q` and `r` such that `a = bq + r`, `0 <= r < b`.\n\n### Fundamental Theorem of Arithmetic\nEvery composite number can be expressed uniquely as a product of primes.",
    is_downloadable: true,
    is_premium: false,
    status: 'published',
  });

  await store.createStudyResource({
    title: 'వాస్తవ సంఖ్యలు — చాప్టర్ నోట్స్ (Telugu Medium)',
    description: 'తెలుగు మీడియం 10వ తరగతి గణితం ముఖ్య సూత్రాలు & ఉదాహరణలు.',
    subject_id: math.id,
    chapter_id: chReal.id,
    resource_type: 'chapter_notes',
    board_codes: ['AP', 'TS'],
    medium: 'TE',
    file_name: 'Class10_Maths_Ch01_RealNumbers_TE.md',
    mime_type: 'text/markdown',
    file_size_bytes: 512,
    content_markdown:
      '### యూక్లిడ్ భాగహార శేష విధి\nఏవైనా రెండు ధన పూర్ణ సంఖ్యలు a, b లకు `a = bq + r, 0 <= r < b` అయ్యే విధంగా ఏకైక పూర్ణ సంఖ్యలు q, r లు ఉంటాయి.',
    is_downloadable: true,
    is_premium: false,
    status: 'published',
  });

  const seedQuestions = [
    {
      subject_id: phy.id,
      question_text: 'Which is a balanced chemical equation?',
      options_json: ['2H₂ + O₂ → 2H₂O', 'C + O₂ → CO', 'Na + Cl₂ → NaCl', 'H₂O → H₂ + O₂'],
      correct_option_index: 0,
      explanation: '2H₂ + O₂ → 2H₂O has 4 Hydrogen and 2 Oxygen atoms equally on both sides.',
      difficulty: 'easy',
    },
    {
      subject_id: math.id,
      chapter_id: chReal.id,
      question_text: "According to Euclid's Division Lemma, for positive integers a and b, a = bq + r where:",
      options_json: ['0 < r < b', '0 ≤ r < b', '0 ≤ r ≤ b', 'r > b'],
      correct_option_index: 1,
      explanation: 'The remainder r must always be non-negative and strictly less than the divisor b.',
      difficulty: 'easy',
    },
    {
      subject_id: math.id,
      question_text: 'What is the value of sin²(45°) + cos²(45°)?',
      options_json: ['0', '1/2', '1', '2'],
      correct_option_index: 2,
      explanation: 'By the fundamental Pythagorean identity, sin²θ + cos²θ = 1 for any angle θ.',
      difficulty: 'easy',
    },
    {
      subject_id: phy.id,
      question_text: 'Which mirror is used by dentists to see an enlarged image of teeth?',
      options_json: ['Plane mirror', 'Convex mirror', 'Concave mirror', 'Cylindrical mirror'],
      correct_option_index: 2,
      explanation: 'A concave mirror produces a virtual, erect, and magnified image when the object is between P and F.',
      difficulty: 'medium',
    },
    {
      subject_id: bio.id,
      question_text: 'The functional unit of the human kidney responsible for filtration is:',
      options_json: ['Neuron', 'Nephron', 'Alveolus', 'Villus'],
      correct_option_index: 1,
      explanation: 'Each kidney contains millions of nephrons that filter nitrogenous wastes from blood.',
      difficulty: 'easy',
    },
    {
      subject_id: math.id,
      question_text: 'If the discriminant (b² − 4ac) of a quadratic equation is zero, its roots are:',
      options_json: ['Real and distinct', 'Real and equal', 'Imaginary / Complex', 'Always negative'],
      correct_option_index: 1,
      explanation: 'When Δ = 0, both roots equal −b/(2a), so they are real and equal.',
      difficulty: 'medium',
    },
    {
      subject_id: phy.id,
      question_text: 'The SI unit of electric current is:',
      options_json: ['Volt', 'Ohm', 'Ampere', 'Watt'],
      correct_option_index: 2,
      explanation: 'Electric current is measured in Amperes (1 A = 1 Coulomb/second).',
      difficulty: 'easy',
    },
    {
      subject_id: bio.id,
      question_text: 'Photosynthesis occurs inside which plant cell organelle?',
      options_json: ['Mitochondria', 'Ribosome', 'Chloroplast', 'Golgi body'],
      correct_option_index: 2,
      explanation: 'Chloroplasts contain chlorophyll pigment which traps sunlight to synthesize glucose.',
      difficulty: 'easy',
    },
  ];

  const qIds = [];
  for (const q of seedQuestions) {
    const saved = await store.createQuestion({
      ...q,
      question_type: 'mcq',
      marks: 1,
      negative_marks: 0,
      board_codes: ['AP', 'TS'],
      language: 'EN',
      status: 'published',
    });
    qIds.push(saved.id);
  }

  await store.createQuiz({
    title: 'Class 10 SSC Foundation Practice Quiz',
    description: 'Server-timed AP & Telangana SSC multi-subject practice test managed from Admin Portal.',
    quiz_type: 'monthly_test',
    board_codes: ['AP', 'TS'],
    subject_id: math.id,
    chapter_id: chReal.id,
    question_ids: qIds,
    total_marks: qIds.length,
    passing_marks: Math.ceil(qIds.length * 0.4),
    duration_minutes: 15,
    attempts_allowed: 10,
    shuffle_questions: false,
    shuffle_options: false,
    show_results: true,
    show_explanations: true,
    negative_marking: false,
    is_premium: false,
    status: 'published',
  });

  await store.createExam({
    name: 'Monthly SSC Practice Exam',
    description: 'Official Class 10 AP & Telangana SSC timed board examination.',
    exam_type: 'monthly',
    board_codes: ['AP', 'TS'],
    subject_id: math.id,
    exam_date: new Date(Date.now() + 7 * 86400 * 1000).toISOString(),
    duration_minutes: 30,
    total_marks: qIds.length,
    passing_marks: Math.ceil(qIds.length * 0.4),
    question_ids: qIds,
    instructions: 'Complete all questions before the server timer expires.',
    attempts_allowed: 3,
    results_published: true,
    status: 'published',
  });

  const adminUsers = await store.listAdminUsers();
  const superAdmin = adminUsers[0];
  if (superAdmin) {
    // Seed a transcript-grounded 4-Round Gamified Video Quiz linked directly to Lesson 1.1 (Real Numbers)
    const chLessons = await store.listAllLessons({ chapterId: chReal.id });
    const firstLesson = chLessons[0];
    if (firstLesson) {
      await services.gamifiedQuizService.updateLessonTranscript({
        admin: superAdmin,
        lessonId: firstLesson.id,
        transcriptText:
          "Welcome to Class 10 Mathematics Chapter 1 Real Numbers. Today we learn Euclid's Division Lemma in simple Telugu-English explanation. Euclid's Division Lemma states that for any two positive integers a and b, there exist unique integers q and r such that a = bq + r where 0 <= r < b. Here a is the dividend, b is the divisor, q is the quotient, and r is the remainder. Euclid's Division Algorithm is used repeatedly to find the Highest Common Factor (HCF) of two positive integers until the remainder becomes zero. When remainder r equals 0, the divisor b at that step is the HCF.",
        keyConcepts: ["Euclid's Division Lemma", 'Remainder Condition', 'Finding HCF Algorithm'],
        ipAddress: '127.0.0.1',
      });

      const videoMcqs = [
        {
          roundType: 'quick_challenge',
          difficulty: 'easy',
          conceptTag: "Euclid's Division Lemma Formula",
          questionText: "In the video lesson, what is the exact equation of Euclid's Division Lemma?",
          options: ['a = bq + r', 'a = b + qr', 'a = q / b + r', 'a = bq - r'],
          correctOptionIndex: 0,
          explanation: "Euclid's Division Lemma states a = bq + r, where a is dividend, b is divisor, q is quotient and r is remainder.",
          referenceNote: 'AP/TS SSC Class 10 Maths Ch 1 — Section 1.1',
        },
        {
          roundType: 'quick_challenge',
          difficulty: 'easy',
          conceptTag: 'Remainder Condition',
          questionText: 'What condition must the remainder r satisfy in a = bq + r?',
          options: ['0 < r < b', '0 ≤ r < b', 'r ≥ b', 'r < 0'],
          correctOptionIndex: 1,
          explanation: 'The remainder r can be 0 or positive, and it must always be strictly smaller than the divisor b (0 ≤ r < b).',
          referenceNote: 'Remember: remainder can never be equal to or larger than divisor b.',
        },
        {
          roundType: 'brain_battle',
          difficulty: 'medium',
          conceptTag: 'Finding HCF Algorithm',
          questionText: "While finding HCF using Euclid's Division Algorithm, when do we stop dividing?",
          options: ['When quotient q = 1', 'When remainder r = 0', 'When dividend a = 0', 'After exactly 2 steps'],
          correctOptionIndex: 1,
          explanation: 'As taught in the video, we keep applying Euclid’s lemma until the remainder r becomes 0; the divisor at that final step is the HCF.',
          referenceNote: 'Last non-zero divisor = HCF(a, b)',
        },
        {
          roundType: 'master_challenge',
          difficulty: 'hard',
          conceptTag: 'HCF Application Problem',
          questionText: 'Applying Euclid’s Division Algorithm to 24 and 18 (24 = 18×1 + 6, then 18 = 6×3 + 0), what is HCF(24, 18)?',
          options: ['3', '6', '12', '18'],
          correctOptionIndex: 1,
          explanation: 'Since remainder becomes 0 when dividing 18 by 6, the divisor 6 at that step is HCF(24, 18).',
          referenceNote: 'Practice Step: Always identify the divisor in the step where r = 0.',
        },
        {
          roundType: 'victory_round',
          difficulty: 'hard',
          conceptTag: 'Number Properties Bonus',
          questionText: 'Bonus Challenge: If a positive integer is divided by 4, what are ALL possible remainders r according to Euclid’s Lemma?',
          options: ['1, 2, 3, 4', '0, 1, 2, 3', '0, 1, 2, 3, 4', '1, 2, 3'],
          correctOptionIndex: 1,
          explanation: 'Because 0 ≤ r < 4, the only possible whole-number remainders are 0, 1, 2, and 3!',
          referenceNote: 'Frequently asked 2-mark AP & Telangana SSC board concept!',
        },
      ];

      const createdIds = [];
      for (const q of videoMcqs) {
        const saved = await services.gamifiedQuizService.createManualVideoQuestion({
          admin: superAdmin,
          lessonId: firstLesson.id,
          data: q,
          ipAddress: '127.0.0.1',
        });
        createdIds.push(saved.id);
      }

      await services.gamifiedQuizService.createOrUpdateVideoQuiz({
        admin: superAdmin,
        data: {
          lessonId: firstLesson.id,
          title: "Euclid's Division Lemma — 4-Round Video Challenge",
          description: 'Master Quick Challenge, Brain Battle, Master Challenge & Victory Round straight from this video!',
          questionIds: createdIds,
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
        },
        ipAddress: '127.0.0.1',
      });
    }

    await services.adminOperationsService.sendNotification({
      admin: superAdmin,
      data: {
        title: 'Welcome to Class 10 Dynamic LMS!',
        message: 'New Mathematics notes, synced videos and your 4-Round Gamified Video Quiz are live!',
        notificationType: 'announcement',
        audienceType: 'all',
        deepLink: '/exams',
      },
      ipAddress: '127.0.0.1',
    });
  }
}

await seedDynamicCmsData();

// Seed Phase 4 local-preview-only lesson learning tabs (Concepts, Revision, Handwritten Notes, Teacher Info)
function seedPhase4PreviewLearningData() {
  const allLessons = [...store.lessons.values()];
  const firstLesson = allLessons[0];
  if (!firstLesson) return;

  firstLesson.lesson_number = 1;
  firstLesson.teacher_name = 'Prof. S. Venkata Rao (M.Sc., B.Ed.)';
  firstLesson.learning_objectives =
    'Understand Euclid’s Division Lemma (a = bq + r, 0 ≤ r < b) and apply Euclid’s Division Algorithm to compute HCF of any two positive integers.';

  const c1 = crypto.randomUUID();
  store.lessonConcepts.set(c1, {
    id: c1,
    subject_id: firstLesson.subject_id,
    chapter_id: firstLesson.chapter_id,
    lesson_id: firstLesson.id,
    title: "Euclid's Division Lemma",
    explanation_markdown:
      'For any two positive integers a and b, there exist unique whole numbers q (quotient) and r (remainder) satisfying the division relation below.',
    formula_expression: 'a = bq + r,   where 0 ≤ r < b',
    examples_json: [
      'Take a = 25, b = 4 → 25 = 4(6) + 1 (here q = 6, r = 1 and 0 ≤ 1 < 4).',
      'Find HCF(135, 225): 225 = 135(1) + 90 → 135 = 90(1) + 45 → 90 = 45(2) + 0 ⇒ HCF = 45.',
    ],
    definitions_json: [
      'Lemma: A proven statement used as a stepping stone for proving another theorem.',
      'Algorithm: A well-defined series of steps that gives a procedure for solving a type of problem.',
    ],
    display_order: 1,
    is_premium: false,
    is_active: true,
  });

  const c2 = crypto.randomUUID();
  store.lessonConcepts.set(c2, {
    id: c2,
    subject_id: firstLesson.subject_id,
    chapter_id: firstLesson.chapter_id,
    lesson_id: firstLesson.id,
    title: 'Step-by-Step HCF Computation',
    explanation_markdown:
      'Apply Euclid’s lemma repeatedly by replacing (a, b) with (b, r) until remainder r equals 0. The divisor at that final step is the Highest Common Factor.',
    formula_expression: 'HCF(a, b) = HCF(b, r)   until r = 0',
    examples_json: ['HCF(867, 255): 867 = 255(3) + 102 → 255 = 102(2) + 51 → 102 = 51(2) + 0 ⇒ HCF = 51.'],
    definitions_json: ['Co-prime integers: Two integers whose HCF equals 1.'],
    display_order: 2,
    is_premium: false,
    is_active: true,
  });

  const revSeed = [
    {
      point_type: 'formula',
      title: 'Core Division Identity',
      content_markdown: 'Always verify that remainder r is non-negative and strictly less than divisor b.',
      formula_expression: 'a = bq + r  (0 ≤ r < b)',
    },
    {
      point_type: 'key_point',
      title: 'Stopping Condition for HCF',
      content_markdown: 'Stop dividing the moment remainder r = 0; the divisor b in that final step is the HCF.',
      formula_expression: '',
    },
    {
      point_type: 'definition',
      title: 'Euclid Division Algorithm',
      content_markdown: 'A systematic technique to compute the Highest Common Factor (HCF) of two given positive integers.',
      formula_expression: '',
    },
    {
      point_type: 'checklist',
      title: 'Can I write a = bq + r cleanly for any two positive integers?',
      content_markdown: 'Practice at least 3 textbook exercise problems without looking at solutions.',
      formula_expression: '',
    },
    {
      point_type: 'checklist',
      title: 'Can I find HCF(900, 270) in 3 clean steps?',
      content_markdown: 'Check that your final divisor gives remainder 0.',
      formula_expression: '',
    },
  ];
  revSeed.forEach((item, idx) => {
    const id = crypto.randomUUID();
    store.lessonRevisionPoints.set(id, {
      id,
      subject_id: firstLesson.subject_id,
      chapter_id: firstLesson.chapter_id,
      lesson_id: firstLesson.id,
      ...item,
      display_order: idx + 1,
      is_premium: false,
      is_active: true,
    });
  });

  // Attach an existing chapter note & sample practice question strictly to firstLesson for preview UI
  const noteId = crypto.randomUUID();
  store.notes.set(noteId, {
    id: noteId,
    subject_id: firstLesson.subject_id,
    chapter_id: firstLesson.chapter_id,
    lesson_id: firstLesson.id,
    title: "Handwritten Classroom Notes — Euclid's Division Lemma",
    content_markdown:
      "## 1.1 Euclid's Division Lemma\n\nTheorem: Given positive integers a and b, there exist unique integers q and r satisfying:\n  a = bq + r,  0 ≤ r < b\n\n### Solved Board Example\nFind HCF of 900 and 270 using Euclid's Division Algorithm:\nStep 1: 900 = 270 × 3 + 90  (r = 90 ≠ 0)\nStep 2: 270 = 90 × 3 + 0    (r = 0)\nTherefore, HCF(900, 270) = 90.\n\n### Exam Tip\nAlways write the condition 0 ≤ r < b clearly for full marks.",
    is_premium: false,
    display_order: 1,
    is_active: true,
  });

  // Link existing Real Numbers PYQ to firstLesson for preview tab verification
  for (const pyq of store.pyqs.values()) {
    if (pyq.chapter_id === firstLesson.chapter_id && !pyq.lesson_id) {
      pyq.lesson_id = firstLesson.id;
      pyq.question_type = 'numerical';
      pyq.explanation = 'Apply a = bq + r repeatedly until remainder becomes 0.';
    }
  }
}

seedPhase4PreviewLearningData();

// Automatically sync videos uploaded in your locally authenticated PikPak account on boot
try {
  const syncResult = await services.videoSyncService.syncVideos({ defaultPremium: false });
  console.log(
    `[VIDEO SYNC] Synced ${syncResult.syncedCount} video(s) from ${syncResult.provider} -> Student Dashboard (Own Branded Player)`
  );
  for (const v of syncResult.videos) {
    console.log(`  - ${v.title} (${v.fileName}, ${v.sizeLabel || 'video'}, folder: ${v.folderName})`);
  }
} catch (err) {
  console.warn(`[VIDEO SYNC] Initial auto-sync skipped (${err.message}). Tap "Sync Videos" in Dashboard once logged in.`);
}

previewApp.use(app);
previewApp.listen(PORT, () => {
  console.log(`[LOCAL DEV PREVIEW SERVER] Running at http://localhost:${PORT}/api/v1`);
  console.log('  Admin Portal Login:     admin@class10lms.in / Admin@1234');
  console.log('  Sample Paid Student:    paid@ap10.in     / Password1234');
  console.log('  Sample Expired Student: expired@ts10.in  / Password1234');
  console.log('  Video Provider Mode:   ', config.VIDEO_STORAGE_PROVIDER, '(local server storage + Android private vault only)');
});
