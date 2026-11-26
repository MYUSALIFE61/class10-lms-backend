-- ============================================================================
-- Migration 003: AP & Telangana Class 10 (SSC) Plan & Curriculum Catalog Setup
-- Idempotent seed for subscription plan and SCERT AP/TS Class 10 subject catalog.
-- Administrators insert real Unlisted YouTube Video IDs into
-- public.lesson_video_sources via Supabase Studio or an admin tool.
-- ============================================================================

-- 1. Seed ₹499 Annual Class 10 Plan
INSERT INTO public.subscription_plans (code, name, description, price_paise, currency, duration_days, is_active)
VALUES (
    'CLASS10_ANNUAL_499',
    'Class 10 Complete AP & TS SSC Pass',
    'Full access to all Class 10 video lessons, chapter MCQs, class notes, AP & TS previous exam questions, and formula sheets for 1 academic year.',
    49900,
    'INR',
    365,
    TRUE
)
ON CONFLICT (code) DO NOTHING;

-- 2. Seed Official AP & Telangana Class 10 SSC Core Subjects
INSERT INTO public.subjects (board, slug, title, description, icon_key, accent_color, display_order, is_active)
VALUES
    ('BOTH', 'mathematics', 'Mathematics', 'Real Numbers, Sets, Polynomials, Linear Equations, Quadratic Equations, Trigonometry, Statistics & Geometry (SCERT AP/TS).', 'calculator', '#1D4ED8', 1, TRUE),
    ('BOTH', 'physical-science', 'Physical Science', 'Reflection & Refraction of Light, Chemical Equations, Acids Bases & Salts, Atomic Structure, Electric Current & Electromagnetism.', 'atom', '#0F766E', 2, TRUE),
    ('BOTH', 'biological-science', 'Biological Science', 'Nutrition, Respiration, Transportation, Excretion, Coordination, Reproduction, Heredity & Our Environment.', 'leaf', '#15803D', 3, TRUE),
    ('BOTH', 'social-studies', 'Social Studies', 'India Relief Features, Ideas of Development, Climate, Indian Rivers, World Wars, National Movement & Independent India.', 'globe', '#B45309', 4, TRUE),
    ('BOTH', 'english', 'English', 'Personality Development, Wit & Humour, Human Relations, Films & Theatre, Grammar, Comprehension & Creative Writing.', 'book-open', '#7C3AED', 5, TRUE),
    ('BOTH', 'telugu', 'Telugu (First Language)', 'Padyabhagam, Gadyabhagam, Upavachakam (Ramayanam), Vyakaranam & Creative Composition for SSC Board Exams.', 'languages', '#BE123C', 6, TRUE)
ON CONFLICT (slug) DO NOTHING;

-- 3. Seed Official SCERT Class 10 Mathematics Chapters (Example Taxonomy)
WITH math_sub AS (
    SELECT id FROM public.subjects WHERE slug = 'mathematics' LIMIT 1
)
INSERT INTO public.chapters (subject_id, chapter_number, title, summary, display_order, is_active)
SELECT math_sub.id, c.chapter_number, c.title, c.summary, c.chapter_number, TRUE
FROM math_sub
CROSS JOIN (
    VALUES
        (1, 'Real Numbers', 'Euclid division lemma, Fundamental Theorem of Arithmetic, irrational numbers and logarithms.'),
        (2, 'Sets', 'Roster and set-builder forms, subsets, Venn diagrams, union, intersection and difference of sets.'),
        (3, 'Polynomials', 'Zeroes of a polynomial, geometrical meaning, relationship between zeroes and coefficients.'),
        (4, 'Pair of Linear Equations in Two Variables', 'Graphical, substitution, elimination methods and consistency conditions.'),
        (5, 'Quadratic Equations', 'Factorisation, completing the square, quadratic formula and nature of roots.'),
        (6, 'Progressions', 'Arithmetic Progressions (AP), nth term, sum of first n terms and Geometric Progressions (GP).'),
        (7, 'Coordinate Geometry', 'Distance formula, section formula, midpoint, centroid and area of triangle.'),
        (8, 'Similar Triangles', 'Basic Proportionality Theorem (Thales), criteria for similarity and Pythagoras theorem.'),
        (9, 'Tangents and Secants to a Circle', 'Tangent properties, number of tangents from an external point and segment areas.'),
        (10, 'Mensuration', 'Surface areas and volumes of combinations of solids and conversion of solids.'),
        (11, 'Trigonometry', 'Trigonometric ratios, specific angles, complementary angles and trigonometric identities.'),
        (12, 'Applications of Trigonometry', 'Angle of elevation, angle of depression and heights and distances problems.'),
        (13, 'Probability', 'Classical definition of probability, complementary events, cards, dice and coins.'),
        (14, 'Statistics', 'Mean (direct, assumed, step-deviation), median, mode of grouped data and ogive curves.')
) AS c(chapter_number, title, summary)
ON CONFLICT (subject_id, chapter_number) DO NOTHING;

-- 4. Seed Official SCERT Class 10 Physical Science Chapters
WITH phy_sub AS (
    SELECT id FROM public.subjects WHERE slug = 'physical-science' LIMIT 1
)
INSERT INTO public.chapters (subject_id, chapter_number, title, summary, display_order, is_active)
SELECT phy_sub.id, c.chapter_number, c.title, c.summary, c.chapter_number, TRUE
FROM phy_sub
CROSS JOIN (
    VALUES
        (1, 'Reflection of Light at Curved Surfaces', 'Concave and convex mirrors, ray diagrams, mirror formula and magnification.'),
        (2, 'Chemical Equations', 'Writing and balancing chemical equations and interpreting stoichiometric information.'),
        (3, 'Acids, Bases and Salts', 'pH scale, indicators, neutralization, bleaching powder, baking soda and Plaster of Paris.'),
        (4, 'Refraction of Light at Curved Surfaces', 'Lenses, ray diagrams, lens formula, lens maker formula and focal length.'),
        (5, 'Human Eye and Colourful World', 'Myopia, hypermetropia, presbyopia, dispersion, rainbow formation and scattering of light.'),
        (6, 'Structure of Atom', 'Bohr model, quantum numbers, electronic configuration, Pauli exclusion and Hund rule.'),
        (7, 'Classification of Elements - The Periodic Table', 'Dobereiner, Newlands, Mendeleev and Modern Periodic Law and periodic trends.'),
        (8, 'Chemical Bonding', 'Lewis dot structures, ionic and covalent bonds, VSEPR theory and hybridization.'),
        (9, 'Electric Current', 'Ohm law, resistance, resistivity, series and parallel circuits, Kirchhoff laws and electric power.'),
        (10, 'Electromagnetism', 'Oersted experiment, magnetic field lines, Faraday law, Lenz law, electric motor and generator.')
) AS c(chapter_number, title, summary)
ON CONFLICT (subject_id, chapter_number) DO NOTHING;

-- ---------------------------------------------------------------------------
-- ADMIN GUIDE: Adding a real Unlisted YouTube Lesson in Supabase SQL Editor:
--
--   WITH new_lesson AS (
--     INSERT INTO public.lessons (subject_id, chapter_id, title, description, duration_seconds, display_order, is_premium, is_active)
--     VALUES ('<subject-uuid>', '<chapter-uuid>', 'Euclid Division Lemma Explained', 'Step-by-step SSC board examples.', 840, 1, TRUE, TRUE)
--     RETURNING id
--   )
--   INSERT INTO public.lesson_video_sources (lesson_id, provider, youtube_video_id)
--   SELECT id, 'youtube_unlisted', '<11-CHAR-UNLISTED-YT-ID>' FROM new_lesson;
-- ---------------------------------------------------------------------------
