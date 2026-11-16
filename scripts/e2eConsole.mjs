/**
 * Console tracking shared by the browser regressions.
 *
 * Edge functions are not served by the local Supabase stack, so calls to
 * `/functions/v1/*` (AI, NBS rates and similar) come back 503 or fail to load,
 * and Chromium logs a "Failed to load resource" error for each. Those, and only
 * those, are expected. A REST request refused with 401 that the app then retries
 * successfully (supabaseService.fetchAllRows, right after sign-in) is dropped once
 * the retry succeeds. Every other console error or warning and every uncaught
 * page error is collected as an issue.
 */

const REST_PATH = '/rest/v1/';
const isRestUrl = (url) => {
  try {
    return new URL(url).pathname.startsWith(REST_PATH);
  } catch {
    return false;
  }
};

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
  // REST URLs refused with 401, and the issue each one logged, until a retry of the same URL succeeds.
  const refused = new Map();

  page.on('console', (message) => {
    const type = message.type();
    if (type !== 'error' && type !== 'warning') return;
    if (isExpectedEdgeFunctionFailure(message)) return;
    const source = message.location()?.url;
    const issue = `${type}: ${message.text()}${source ? ` (${source})` : ''}`;
    if (type === 'error' && source && isRestUrl(source) && /status of 401\b/.test(message.text())) refused.set(source, issue);
    issues.push(issue);
  });

  page.on('response', (response) => {
    const issue = refused.get(response.url());
    if (!issue || response.status() >= 400) return;
    refused.delete(response.url());
    const index = issues.indexOf(issue);
    if (index >= 0) issues.splice(index, 1);
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
