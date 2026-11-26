/**
 * Class 10 LMS — Video Organisation Parser
 *
 * Automatically maps uploaded videos (from PikPak local adapter or Cloudflare R2)
 * into the exact Subject, Chapter, Order, and Video Type using BOTH:
 * 1) Folder hierarchy:
 *    Class_10/01_Mathematics/Ch01_Real_Numbers/01_Introduction.mp4
 *    Class_10/06_Model_Papers/AP_SSC_Maths_Model_Paper_1.mp4
 * 2) Standard naming convention:
 *    Class10_Maths_Ch01_01_Introduction.mp4
 *    Class10_PhysicalScience_Ch02_03_Examples.mp4
 */

const SUBJECT_ALIASES = [
  { slug: 'mathematics', title: 'Mathematics', patterns: ['01_math', 'math', 'maths', 'mathematics'] },
  { slug: 'physical-science', title: 'Physical Science', patterns: ['02_physical', 'physical_science', 'physical-science', 'physics', 'chemistry', 'science'] },
  { slug: 'biological-science', title: 'Biological Science', patterns: ['03_biological', 'biological_science', 'biological-science', 'biology', 'bio'] },
  { slug: 'social-studies', title: 'Social Studies', patterns: ['04_social', '04-social', 'social_studies', 'social-studies', 'social'] },
  { slug: 'english', title: 'English', patterns: ['05_english', 'english', 'eng'] },
  { slug: 'telugu', title: 'Telugu (First Language)', patterns: ['telugu', 'tel'] },
];

const SPECIAL_ZONES = [
  { zone: 'model_papers', label: 'Model Papers', patterns: ['06_model', 'model_paper', 'model-paper', 'model'] },
  { zone: 'previous_papers', label: 'Previous Papers', patterns: ['07_previous', 'previous_paper', 'previous-paper', 'pyq'] },
  { zone: 'revision_series', label: 'Revision Series', patterns: ['08_revision', 'revision_series', 'one_shot', 'oneshot', 'revision'] },
  { zone: 'important_questions', label: 'Important Questions', patterns: ['09_important', 'important_question', 'imp_q'] },
];

export function detectVideoType(fileName = '', folderPath = '') {
  const hay = `${folderPath} ${fileName}`.toLowerCase();
  if (/(06_model|model[_\s-]?paper)/.test(hay)) return { type: 'model_paper', label: 'Model Paper' };
  if (/(07_previous|previous[_\s-]?paper|pyq)/.test(hay)) return { type: 'previous_paper', label: 'Previous Paper' };
  if (/(revision|recap|one[_\s-]?shot|summary)/.test(hay)) return { type: 'revision', label: 'Revision Video' };
  if (/(important|imp[_\s-]?q|exam[_\s-]?focus)/.test(hay)) return { type: 'important', label: 'Important Questions' };
  if (/(exercise|solution|problem|practice)/.test(hay)) return { type: 'exercise', label: 'Exercise Solutions' };
  if (/(example|solved)/.test(hay)) return { type: 'examples', label: 'Examples Video' };
  if (/(intro|introduction|concept|theory|lemma|theorem)/.test(hay)) return { type: 'concept', label: 'Concept Video' };
  return { type: 'concept', label: 'Video Lesson' };
}

function humanizeSegment(raw) {
  return String(raw || '')
    .replace(/\.[^.]+$/, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function matchSubjectSlug(segments, fileName) {
  const combined = [...segments, fileName].map((s) => String(s || '').toLowerCase());
  for (const item of SUBJECT_ALIASES) {
    for (const seg of combined) {
      if (item.patterns.some((p) => seg === p || seg.includes(p))) {
        return item.slug;
      }
    }
  }
  return null;
}

function matchSpecialZone(segments, fileName) {
  const combined = [...segments, fileName].map((s) => String(s || '').toLowerCase());
  for (const z of SPECIAL_ZONES) {
    for (const seg of combined) {
      if (z.patterns.some((p) => seg.includes(p))) {
        return z;
      }
    }
  }
  return null;
}

/**
 * Parses folder path segments (e.g. ["Class_10", "01_Mathematics", "Ch01_Real_Numbers"])
 * and filename (e.g. "Class10_Maths_Ch01_01_Introduction.mp4" or "01_Introduction.mp4")
 * into structured LMS metadata.
 */
export function parseVideoOrganisation({ fileName = '', folderSegments = [] }) {
  const cleanSegments = (folderSegments || []).filter(Boolean);
  const fullPath = cleanSegments.join('/');
  const baseNoExt = String(fileName || 'Untitled Lesson').replace(/\.[^.]+$/, '');

  let subjectSlug = matchSubjectSlug(cleanSegments, fileName);
  const specialZone = matchSpecialZone(cleanSegments, fileName);
  let chapterNumber = null;
  let chapterTitle = null;
  let displayOrder = null;
  let displayTitle = humanizeSegment(baseNoExt);

  // 1. Inspect folder segments for Ch01_Real_Numbers / Chapter_1_Real_Numbers
  for (const seg of cleanSegments) {
    const chMatch = /^(?:ch|chapter)[_\s-]*0*(\d+)(?:[_\s-]+(.+))?$/i.exec(seg.trim());
    if (chMatch) {
      chapterNumber = Number(chMatch[1]);
      if (chMatch[2]) {
        chapterTitle = humanizeSegment(chMatch[2]);
      }
      break;
    }
  }

  // 2. Inspect filename for Class10_Subject_Ch01_01_Introduction.mp4
  const namingMatch =
    /^Class10[_\s-]+([A-Za-z-]+)[_\s-]+Ch0*(\d+)[_\s-]+0*(\d+)[_\s-]+(.+)$/i.exec(baseNoExt);
  if (namingMatch) {
    const [, rawSub, rawCh, rawOrd, rawTitle] = namingMatch;
    subjectSlug = subjectSlug || matchSubjectSlug([rawSub], rawSub);
    chapterNumber = chapterNumber || Number(rawCh);
    displayOrder = Number(rawOrd);
    displayTitle = `${displayOrder}. ${humanizeSegment(rawTitle)}`;
  } else {
    // Leading numeric prefix like 01_Introduction.mp4
    const orderMatch = /^0*(\d+)[_\s-]+(.+)$/.exec(baseNoExt);
    if (orderMatch) {
      displayOrder = Number(orderMatch[1]);
      displayTitle = `${displayOrder}. ${humanizeSegment(orderMatch[2])}`;
    }
  }

  const videoType = detectVideoType(fileName, fullPath);

  return {
    subjectSlug,
    specialZone: specialZone?.zone || null,
    specialZoneLabel: specialZone?.label || null,
    chapterNumber,
    chapterTitle,
    displayOrder,
    displayTitle,
    videoType: videoType.type,
    videoTypeLabel: videoType.label,
    folderPath: fullPath || 'PikPak Drive',
  };
}
