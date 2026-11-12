import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import type { Account, Category } from '../../../types.ts';
import { extractJsonObject, validateParsedReceipt } from '../../../utils/aiShared.ts';
import { corsHeaders, jsonResponse } from '../_shared/cors.ts';

interface ScanReceiptRequest {
  imageBase64: string;
  categories: Category[];
  accounts: Account[];
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

    const { imageBase64, categories, accounts }: ScanReceiptRequest = await req.json();

    const categoryList = categories.map((category) => `${category.name} (${category.type})`).join(', ');
    const accountList = accounts.map((account) => `${account.name} (${account.currency})`).join(', ');

    const systemPrompt = `Extract receipt data from this image.
Current Date: ${new Date().toISOString().split('T')[0]}.
Categories: ${categoryList}
Accounts: ${accountList}

Return JSON with:
amount (number - the total),
currency (string: USD, EUR, RSD),
categoryName (string - pick best match),
subcategory (string, optional),
type (string: 'expense'),
note (string - merchant name),
date (YYYY-MM-DD),
accountName (string, optional),
receiptData (object with: items [{name, price, quantity}], total, merchant),
fees (number, optional - ONLY for service fees. DO NOT include tax (porez/PDV) as fees. Taxes are already included in prices and total.)

IMPORTANT:
- Extract quantity for each item. If not specified, default to 1.
- "Porez" or "PDV" lines are TAX. Ignore them for 'fees'. They are part of the total.
- If the receipt is in Serbian, 'Kolicina' or similar indicates quantity.
- Return ONLY valid JSON, no markdown or extra text.`;

    const imageUrl = imageBase64.startsWith('data:') ? imageBase64 : `data:image/jpeg;base64,${imageBase64}`;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${openAiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: systemPrompt },
          {
            role: 'user',
            content: [
              {
                type: 'image_url',
                image_url: { url: imageUrl },
              },
            ],
          },
        ],
        temperature: 0.3,
        max_tokens: 1500,
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
    const validated = validateParsedReceipt(parsed);
    if (!validated) {
      return jsonResponse({ error: 'Could not validate scanned receipt' }, 422);
    }

    return jsonResponse({ data: validated });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return jsonResponse({ error: message }, 400);
  }
});
