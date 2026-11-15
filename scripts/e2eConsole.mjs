/**
 * Console tracking shared by the browser regressions.
 *
 * Edge functions are not served by the local Supabase stack, so calls to
 * `/functions/v1/*` (AI, NBS rates and similar) come back 503 or fail to load,
 * and Chromium logs a "Failed to load resource" error for each. Those, and only
 * those, are expected. Every other console error or warning and every uncaught
 * page error is collected as an issue.
 */

const EDGE_FUNCTION_PATH = '/functions/v1/';
const EXPECTED_EDGE_FAILURE =
  /^Failed to load resource: (?:the server responded with a status of 503\b|net::ERR_[A-Z_]+)/;

const isEdgeFunctionUrl = (url) => {
  try {
    return new URL(url).pathname.startsWith(EDGE_FUNCTION_PATH);
  } catch {
    return false;
  }
};

/** True for the browser's own log line about an edge function request that failed. */
export const isExpectedEdgeFunctionFailure = (message) =>
  message.type() === 'error' &&
  EXPECTED_EDGE_FAILURE.test(message.text()) &&
  isEdgeFunctionUrl(message.location()?.url ?? '');

/**
 * Starts collecting console errors/warnings and page errors on `page`.
 * Returns the live array of issue strings.
 */
export function trackConsoleIssues(page) {
  const issues = [];

  page.on('console', (message) => {
    const type = message.type();
    if (type !== 'error' && type !== 'warning') return;
    if (isExpectedEdgeFunctionFailure(message)) return;
    const source = message.location()?.url;
    issues.push(`${type}: ${message.text()}${source ? ` (${source})` : ''}`);
  });

  page.on('pageerror', (error) => {
    issues.push(`pageerror: ${error.message}`);
  });

  return issues;
}

/** Throws when any unexpected console or page error was collected. */
export function assertNoConsoleIssues(issues) {
  if (issues.length > 0) {
    throw new Error(`Console issues detected: ${issues.join(' | ')}`);
  }
}

/** True for HTTP responses from edge functions, which are expected to fail locally. */
export const isEdgeFunctionResponse = (response) => isEdgeFunctionUrl(response.url());
