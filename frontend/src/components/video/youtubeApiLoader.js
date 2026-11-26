export const YOUTUBE_ID_REGEX = /^[A-Za-z0-9_-]{11}$/;

export function isValidYouTubeId(id) {
  return typeof id === 'string' && YOUTUBE_ID_REGEX.test(id.trim());
}

let apiLoadPromise = null;

/**
 * Loads the official YouTube IFrame Player API script exactly once.
 * https://developers.google.com/youtube/iframe_api_reference
 */
export function loadYouTubeIframeAPI() {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('Window is not available'));
  }

  if (window.YT && typeof window.YT.Player === 'function') {
    return Promise.resolve(window.YT);
  }

  if (apiLoadPromise) return apiLoadPromise;

  apiLoadPromise = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      apiLoadPromise = null;
      reject(new Error('Timed out loading YouTube IFrame Player API. Check internet connection.'));
    }, 15000);

    const prevReady = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      clearTimeout(timeout);
      if (typeof prevReady === 'function') {
        try {
          prevReady();
        } catch {
          // ignore
        }
      }
      resolve(window.YT);
    };

    const existingScript = document.querySelector(
      'script[src="https://www.youtube.com/iframe_api"]'
    );
    if (!existingScript) {
      const tag = document.createElement('script');
      tag.src = 'https://www.youtube.com/iframe_api';
      tag.async = true;
      tag.onerror = () => {
        clearTimeout(timeout);
        apiLoadPromise = null;
        reject(new Error('Failed to load YouTube IFrame Player API script.'));
      };
      document.head.appendChild(tag);
    }
  });

  return apiLoadPromise;
}

export function mapYouTubeErrorCode(code) {
  switch (code) {
    case 2:
      return {
        title: 'Invalid Video Identifier',
        message: 'The lesson video ID is malformed or invalid. Please report this lesson to support.',
        retryable: false,
      };
    case 5:
      return {
        title: 'Playback Engine Error',
        message: 'The HTML5 video player encountered a temporary decoding issue. Tap Retry to reload.',
        retryable: true,
      };
    case 100:
      return {
        title: 'Video Unavailable or Private',
        message: 'This video was removed or marked private on YouTube. Please contact your instructor.',
        retryable: false,
      };
    case 101:
    case 150:
      return {
        title: 'Embedding Disabled or Age-Restricted',
        message:
          'YouTube embedding is disabled or restricted for this video. Ask the LMS admin to enable embedding on the Unlisted video.',
        retryable: false,
      };
    case 153:
      return {
        title: 'Embed Configuration Error',
        message: 'Video player origin verification failed. Ensure the app is updated and online.',
        retryable: true,
      };
    default:
      return {
        title: 'Playback Interrupted',
        message: `YouTube player reported error code ${code}. Check your connection and try again.`,
        retryable: true,
      };
  }
}

export function resetYouTubeLoaderForTests() {
  apiLoadPromise = null;
}
