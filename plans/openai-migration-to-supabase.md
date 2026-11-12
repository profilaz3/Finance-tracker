# OpenAI Migration to Supabase Edge Functions

## Overview

This plan outlines migrating the OpenAI SDK from the frontend bundle to Supabase Edge Functions. This will:
- **Reduce bundle size** by ~108 KB (gzipped) - the OpenAI SDK chunk
- **Improve security** by keeping API keys server-side
- **Enable rate limiting** and usage tracking
- **Reduce client-side CPU usage** for AI operations

## Current Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Frontend (React)                        │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  aiService.ts (OpenAI SDK)                             │   │
│  │  - parseTransaction()                                   │   │
│  │  - scanReceipt()                                       │   │
│  │  - generateInsights()                                  │   │
│  └─────────────────────────────────────────────────────────┘   │
│                              │                                  │
│                              ▼                                  │
│                    OpenAI API (Direct)                         │
│                    (API Key in browser)                       │
└─────────────────────────────────────────────────────────────────┘
```

## Target Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Frontend (React)                        │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  aiService.ts (HTTP Client)                             │   │
│  │  - parseTransaction() → Supabase Edge Function           │   │
│  │  - scanReceipt() → Supabase Edge Function               │   │
│  │  - generateInsights() → Supabase Edge Function          │   │
│  └─────────────────────────────────────────────────────────┘   │
│                              │                                  │
│                              ▼                                  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              Supabase Edge Functions                    │   │
│  │  ┌─────────────────────────────────────────────────┐   │   │
│  │  │  parse-transaction (Deno + OpenAI SDK)         │   │   │
│  │  └─────────────────────────────────────────────────┘   │   │
│  │  ┌─────────────────────────────────────────────────┐   │   │
│  │  │  scan-receipt (Deno + OpenAI Vision)            │   │   │
│  │  └─────────────────────────────────────────────────┘   │   │
│  │  ┌─────────────────────────────────────────────────┐   │   │
│  │  │  generate-insights (Deno + OpenAI SDK)           │   │   │
│  │  └─────────────────────────────────────────────────┘   │   │
│  └─────────────────────────────────────────────────────────┘   │
│                              │                                  │
│                              ▼                                  │
│                    OpenAI API (Server-side)                     │
│                    (API Key in Supabase)                        │
└─────────────────────────────────────────────────────────────────┘
```

## Implementation Plan

### Phase 1: Create Supabase Edge Functions

#### 1.1 Create `parse-transaction` Edge Function
**File:** `supabase/functions/parse-transaction/index.ts`

**Purpose:** Parse natural language transaction input using GPT-4o-mini

**Input:**
```typescript
{
  input: string;
  categories: Category[];
  accounts: Account[];
  people: Person[];
}
```

**Output:**
```typescript
{
  data?: ParsedTransaction;
  error?: string;
}
```

**Implementation Details:**
- Use Deno's OpenAI SDK from `https://esm.sh/openai@4`
- Same system prompt as current implementation
- Same validation logic
- CORS headers matching existing delete-user function
- Auth validation using Supabase client

#### 1.2 Create `scan-receipt` Edge Function
**File:** `supabase/functions/scan-receipt/index.ts`

**Purpose:** Extract transaction data from receipt images using GPT-4o Vision

**Input:**
```typescript
{
  imageBase64: string;
  categories: Category[];
  accounts: Account[];
}
```

**Output:**
```typescript
{
  data?: ParsedReceipt;
  error?: string;
}
```

**Implementation Details:**
- Use GPT-4o model for vision capabilities
- Same system prompt as current implementation
- Same validation logic
- CORS headers matching existing delete-user function
- Auth validation using Supabase client

#### 1.3 Create `generate-insights` Edge Function
**File:** `supabase/functions/generate-insights/index.ts`

**Purpose:** Generate AI-powered financial insights report

**Input:**
```typescript
{
  transactions: Transaction[];
  categories: Category[];
  period: 'weekly' | 'monthly';
  baseCurrency: Currency;
  language: 'en' | 'sr';
}
```

**Output:**
```typescript
{
  data?: string; // Markdown report
  error?: string;
}
```

**Implementation Details:**
- Use GPT-4o-mini for cost efficiency
- Same filtering and summarization logic
- Same markdown report format
- CORS headers matching existing delete-user function
- Auth validation using Supabase client

### Phase 2: Update Frontend Service

#### 2.1 Refactor `services/aiService.ts`

**Changes:**
1. Remove OpenAI SDK import
2. Remove `getClient()` function
3. Remove `OPENAI_API_KEY` environment variable usage
4. Update `isAIAvailable()` to check if Edge Functions are configured
5. Update all three functions to call Supabase Edge Functions via HTTP

**New Implementation Pattern:**
```typescript
export const parseTransaction = async (
  input: string,
  categories: Category[],
  accounts: Account[],
  people: Person[]
): Promise<ParsedTransaction | null> => {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const { data: { session } } = await supabaseService.client.auth.getSession();
  
  const response = await fetch(`${supabaseUrl}/functions/v1/parse-transaction`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${session?.access_token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ input, categories, accounts, people }),
  });
  
  const result = await response.json();
  return result.data || null;
};
```

### Phase 3: Environment Configuration

#### 3.1 Configure Supabase Environment Variables

**Required in Supabase Dashboard:**
- `OPENAI_API_KEY` - Your OpenAI API key

**Optional but recommended:**
- `OPENAI_ORGANIZATION` - Your OpenAI organization ID (if applicable)
- `AI_RATE_LIMIT` - Requests per minute per user (e.g., "10")

#### 3.2 Remove Frontend Environment Variable

**Remove from `.env` file:**
- `VITE_OPENAI_API_KEY` - No longer needed in frontend

### Phase 4: Deployment & Testing

#### 4.1 Deploy Edge Functions to Supabase

**Command:**
```bash
npx supabase functions deploy parse-transaction
npx supabase functions deploy scan-receipt
npx supabase functions deploy generate-insights
```

#### 4.2 Test Each Function

**Test parse-transaction:**
- Input: "Lunch 20 EUR from Bank"
- Verify: Returns structured transaction data

**Test scan-receipt:**
- Input: Receipt image base64
- Verify: Returns extracted receipt data with items

**Test generate-insights:**
- Input: Sample transactions
- Verify: Returns markdown report

#### 4.3 Verify Bundle Size Reduction

**Build and analyze:**
```bash
npm run build
npm run analyze
```

**Expected Results:**
- `aiService-Vsi0fysf.js` chunk should disappear (~108 KB gzipped)
- Total bundle size should decrease by ~108 KB

### Phase 5: Usage Tracking Implementation

#### 5.1 Create AI Usage Tracking Table

**Migration File:** `supabase/migrations/20250111000000_create_ai_usage_tracking.sql`

```sql
-- AI Usage Tracking Table
CREATE TABLE IF NOT EXISTS ai_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  function_name TEXT NOT NULL, -- 'parse-transaction', 'scan-receipt', 'generate-insights'
  model_used TEXT NOT NULL,   -- 'gpt-4o-mini', 'gpt-4o'
  input_tokens INTEGER,
  output_tokens INTEGER,
  total_tokens INTEGER,
  estimated_cost_usd NUMERIC(10, 6), -- Estimated cost in USD
  status TEXT NOT NULL, -- 'success', 'error'
  error_message TEXT,
  request_duration_ms INTEGER,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for user-based queries
CREATE INDEX idx_ai_usage_user_id ON ai_usage(user_id, created_at DESC);

-- Index for function-based queries
CREATE INDEX idx_ai_usage_function_name ON ai_usage(function_name, created_at DESC);

-- Enable RLS
ALTER TABLE ai_usage ENABLE ROW LEVEL SECURITY;

-- Users can only see their own usage
CREATE POLICY "Users can view own AI usage"
  ON ai_usage FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own usage (via Edge Functions)
CREATE POLICY "Users can insert own AI usage"
  ON ai_usage FOR INSERT
  WITH CHECK (auth.uid() = user_id);
```

#### 5.2 Add Usage Tracking Helper Function

**File:** `supabase/functions/_shared/usage-tracker.ts` (shared utility)

```typescript
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// OpenAI pricing (as of 2025)
const PRICING = {
  'gpt-4o-mini': { input: 0.00015, output: 0.0006 }, // per 1K tokens
  'gpt-4o': { input: 0.005, output: 0.015 }, // per 1K tokens
};

export interface UsageTrackingData {
  userId: string;
  functionName: string;
  modelUsed: string;
  inputTokens: number;
  outputTokens: number;
  status: 'success' | 'error';
  errorMessage?: string;
  requestDurationMs: number;
}

export async function trackUsage(
  supabaseUrl: string,
  supabaseServiceKey: string,
  data: UsageTrackingData
): Promise<void> {
  const totalTokens = data.inputTokens + data.outputTokens;
  const pricing = PRICING[data.modelUsed as keyof typeof PRICING];
  
  const estimatedCost = pricing
    ? ((data.inputTokens * pricing.input) / 1000) + ((data.outputTokens * pricing.output) / 1000)
    : 0;

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  await supabase.from('ai_usage').insert({
    user_id: data.userId,
    function_name: data.functionName,
    model_used: data.modelUsed,
    input_tokens: data.inputTokens,
    output_tokens: data.outputTokens,
    total_tokens: totalTokens,
    estimated_cost_usd: estimatedCost,
    status: data.status,
    error_message: data.errorMessage,
    request_duration_ms: data.requestDurationMs,
  });
}
```

#### 5.3 Update Edge Functions to Track Usage

**Each Edge Function will:**
1. Record start time before API call
2. Capture token usage from OpenAI response
3. Record end time after API call
4. Call `trackUsage()` helper function

**Example for parse-transaction:**
```typescript
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import OpenAI from 'https://esm.sh/openai@4';
import { trackUsage } from '../_shared/usage-tracker.ts';

serve(async (req) => {
  const startTime = Date.now();
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  
  // ... auth and request parsing ...
  
  const openai = new OpenAI({ apiKey: Deno.env.get('OPENAI_API_KEY') });
  
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      // ... other params ...
    });
    
    const duration = Date.now() - startTime;
    
    // Track usage
    await trackUsage(supabaseUrl, supabaseServiceKey, {
      userId: user.id,
      functionName: 'parse-transaction',
      modelUsed: 'gpt-4o-mini',
      inputTokens: response.usage?.prompt_tokens || 0,
      outputTokens: response.usage?.completion_tokens || 0,
      status: 'success',
      requestDurationMs: duration,
    });
    
    return new Response(JSON.stringify({ data: result }), { status: 200 });
  } catch (error) {
    const duration = Date.now() - startTime;
    
    // Track error
    await trackUsage(supabaseUrl, supabaseServiceKey, {
      userId: user.id,
      functionName: 'parse-transaction',
      modelUsed: 'gpt-4o-mini',
      inputTokens: 0,
      outputTokens: 0,
      status: 'error',
      errorMessage: error.message,
      requestDurationMs: duration,
    });
    
    throw error;
  }
});
```

#### 5.4 Add Usage View to Settings

**New Component:** `components/AIUsageView.tsx`

Display:
- Total requests this month
- Total tokens used
- Estimated cost
- Breakdown by function type
- Recent usage history

#### 5.5 Optional Enhancements

##### 5.5.1 Add Rate Limiting
Implement rate limiting in Edge Functions using Supabase's built-in rate limiting or a custom implementation.

##### 5.5.2 Add Caching
Cache common transaction parsing results to reduce API calls.

##### 5.5.3 Add Fallback Logic
Implement graceful degradation when AI is unavailable.

##### 5.5.4 Add Usage Alerts
Send notifications when usage exceeds thresholds.

## File Structure After Migration

```
supabase/
├── functions/
│   ├── delete-user/
│   │   └── index.ts
│   ├── parse-transaction/
│   │   └── index.ts          [NEW]
│   ├── scan-receipt/
│   │   └── index.ts          [NEW]
│   └── generate-insights/
│       └── index.ts          [NEW]
└── migrations/
    └── ...

services/
├── aiService.ts               [MODIFIED]
├── supabaseService.ts
└── ...

package.json                  [MODIFIED - remove openai dependency]
```

## Security Benefits

| Aspect | Before | After |
|--------|--------|-------|
| API Key Storage | Browser localStorage/env | Supabase server environment |
| Exposure Risk | High (anyone can inspect) | Low (server-side only) |
| Rate Limiting | None | Can be enforced server-side |
| Usage Tracking | None | Can be implemented server-side |

## Bundle Size Impact

| Metric | Before | After | Change |
|--------|--------|-------|--------|
| aiService chunk | 108.63 KB | 0 KB | -108.63 KB |
| Total gzipped | ~798 KB | ~690 KB | -108 KB |

## Rollback Plan

If issues arise, rollback steps:
1. Revert `services/aiService.ts` to use OpenAI SDK directly
2. Re-add `openai` dependency to `package.json`
3. Run `npm install`
4. Set `VITE_OPENAI_API_KEY` in `.env`

## Questions for Review

1. **Rate Limiting:** Should we implement rate limiting for AI requests? If so, what limits per user?

2. **Error Handling:** How should the app behave when Edge Functions are unavailable? Show error message or fall back to manual input?

3. **Caching:** Should we implement caching for common transaction patterns?

4. **Analytics:** Should we track AI usage for cost monitoring?

5. **Fallback:** Should we maintain a fallback to direct OpenAI API calls if Edge Functions fail?
