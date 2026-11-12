import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import type { Account, Category, Person } from '../../../types.ts';
import { extractJsonObject, validateParsedTransaction } from '../../../utils/aiShared.ts';
import { corsHeaders, jsonResponse } from '../_shared/cors.ts';

interface ParseTransactionRequest {
  input: string;
  categories: Category[];
  accounts: Account[];
  people: Person[];
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization') ?? '' },
        },
      },
    );

    const {
      data: { user },
    } = await supabaseClient.auth.getUser();

    if (!user) {
      return jsonResponse({ error: 'Unauthorized' }, 401);
    }

    const openAiKey = Deno.env.get('OPENAI_API_KEY');
    if (!openAiKey) {
      return jsonResponse({ error: 'OPENAI_API_KEY is not configured' }, 500);
    }

    const { input, categories, accounts, people }: ParseTransactionRequest = await req.json();

    const categoryList = categories.map((category) => `${category.name} (${category.type})`).join(', ');
    const accountList = accounts.map((account) => `${account.name} (${account.currency})`).join(', ');
    const debts = people
      .filter((person) => Object.values(person.balances).some((balance) => balance < 0))
      .map((person) => person.name)
      .join(', ');
    const loans = people
      .filter((person) => Object.values(person.balances).some((balance) => balance > 0))
      .map((person) => person.name)
      .join(', ');

    const systemPrompt = `Parse natural language transaction inputs into JSON.
Current Date: ${new Date().toISOString().split('T')[0]}.
If currency is missing, default to RSD.
If category is ambiguous, pick the best match from the provided list.
If an account is specified (Cash, Bank, etc.), include it in 'accountName'.

Entities Logic:
- "Debt": Money I owe to someone. If input implies paying OFF a debt (Expense), put person in 'debtName'.
- "Loan": Money someone owes ME. If input implies receiving money BACK (Income), put person in 'loanName'.

Return a JSON object with:
amount (number),
currency (string: USD, EUR, RSD),
categoryName (string),
subcategory (string, optional),
type (string: income, expense),
note (string),
date (YYYY-MM-DD),
accountName (string, optional),
debtName (string, optional),
loanName (string, optional),
fees (number, optional)

Available Categories: ${categoryList}
Accounts: ${accountList}
My Debts (I owe): ${debts || 'None'}
Active Loans (Owes me): ${loans || 'None'}

Return ONLY valid JSON, no markdown or extra text.`;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${openAiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: input },
        ],
        temperature: 0.3,
        max_tokens: 500,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return jsonResponse({ error: errorText || 'OpenAI request failed' }, response.status);
    }

    const payload = await response.json();
    const content = payload?.choices?.[0]?.message?.content;
    if (typeof content !== 'string') {
      return jsonResponse({ error: 'OpenAI response did not include content' }, 502);
    }

    const parsed = extractJsonObject(content);
    const validated = validateParsedTransaction(parsed);
    if (!validated) {
      return jsonResponse({ error: 'Could not validate parsed transaction' }, 422);
    }

    return jsonResponse({ data: validated });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return jsonResponse({ error: message }, 400);
  }
});
