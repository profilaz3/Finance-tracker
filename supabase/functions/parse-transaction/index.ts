import { consumeQuota, requireUser } from '../_shared/auth.ts';
import { requireRecord } from '../_shared/input.ts';
import { HttpError, jsonResponse, readJsonBody, serveJson } from '../_shared/http.ts';
import { parseTransactionText, readParseContext } from '../_shared/parseTransaction.ts';

const MAX_BODY_BYTES = 256 * 1024;
const MAX_INPUT_CHARS = 500;

serveJson('parse-transaction', async (req) => {
  const ctx = await requireUser(req);
  const body = requireRecord(await readJsonBody(req, MAX_BODY_BYTES));

  const input = typeof body.input === 'string' ? body.input.trim() : '';
  if (!input) throw new HttpError(400, 'Missing input');
  if (input.length > MAX_INPUT_CHARS) throw new HttpError(413, 'Input too long');

  const context = readParseContext(body);
  await consumeQuota(ctx, 'parse-transaction');

  const validated = await parseTransactionText(input, context);
  if (!validated) throw new HttpError(422, 'Could not understand that transaction');
  return jsonResponse(req, { data: validated });
});
