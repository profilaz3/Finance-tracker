import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import type { Category, Currency, Transaction } from '../../../types.ts';
import { corsHeaders, jsonResponse } from '../_shared/cors.ts';

interface GenerateInsightsRequest {
  transactions: Transaction[];
  categories: Category[];
  period: 'weekly' | 'monthly';
  baseCurrency: Currency;
  language: 'en' | 'sr';
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

    const { transactions, categories, period, baseCurrency, language }: GenerateInsightsRequest = await req.json();

    const now = new Date();
    const cutoffDate = new Date();
    if (period === 'weekly') {
      cutoffDate.setDate(now.getDate() - 7);
    } else {
      cutoffDate.setDate(now.getDate() - 30);
    }

    const filteredTransactions = transactions.filter((transaction) => new Date(transaction.date) >= cutoffDate);
    const transactionData = filteredTransactions.map((transaction) => {
      const category = categories.find((entry) => entry.id === transaction.categoryId);

      return {
        date: transaction.date.split('T')[0],
        amount: transaction.amount,
        currency: transaction.currency,
        type: transaction.type,
        category: category?.name || 'Unknown',
        note: transaction.note || '',
      };
    });

    const periodLabel = period === 'weekly' ? 'weekly' : 'monthly';
    const languageLabel = language === 'sr' ? 'Serbian (Srpski)' : 'English';

    const systemPrompt = `You are a financial analyst. Generate a ${periodLabel} financial report based on the following transaction data.
Base Currency: ${baseCurrency}.
Language: ${languageLabel}.

The report should be in Markdown format and include:
1. **Summary**: Total income, total expense, and net savings.
2. **Top Spending Categories**: List the biggest expenses.
3. **Trends**: Any noticeable patterns (e.g., "Spending increased on weekends").
4. **Recommendations**: 2-3 specific tips to improve financial health based on this data.
5. **Tone**: Professional but encouraging. Emojis are optional, not required.

Structure the report with clear H2 headers (##) and bullet points. Use bold text for key figures.

Transaction Data (last ${period === 'weekly' ? '7' : '30'} days):
${JSON.stringify(transactionData, null, 2)}`;

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
          { role: 'user', content: `Generate my ${periodLabel} financial report.` },
        ],
        temperature: 0.7,
        max_tokens: 2000,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return jsonResponse({ error: errorText || 'OpenAI request failed' }, response.status);
    }

    const payload = await response.json();
    const content = payload?.choices?.[0]?.message?.content;
    if (typeof content !== 'string' || content.trim().length === 0) {
      return jsonResponse({ error: 'OpenAI response did not include report text' }, 502);
    }

    return jsonResponse({ data: content });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return jsonResponse({ error: message }, 400);
  }
});
