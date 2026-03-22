import Anthropic from '@anthropic-ai/sdk';
import { NextRequest } from 'next/server';
import {
  getOverviewStats,
  getSegmentSummary,
  getTopAtRiskCustomers,
} from '@/lib/data';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
});

function formatOverviewStats(stats: Awaited<ReturnType<typeof getOverviewStats>>) {
  return `
## Overview Stats
- Total customers: ${stats.totalCustomers.toLocaleString()}
- High risk: ${stats.highRiskCount.toLocaleString()} (${stats.highRiskPct.toFixed(1)}%)
- Medium risk: ${stats.mediumRiskCount.toLocaleString()}
- Low risk: ${stats.lowRiskCount.toLocaleString()}
- Revenue at risk (High tier): $${(stats.revenueAtRisk / 1_000_000).toFixed(2)}M
`.trim();
}

function formatSegmentSummary(rows: Awaited<ReturnType<typeof getSegmentSummary>>) {
  if (!rows.length) return 'No segment data available.';
  const header = 'Risk Tier | Age | Gender | Source | Count | Avg Churn Prob | Revenue at Risk | Avg Orders/Mo | Return Rate | One-Time Buyers';
  const divider = '-'.repeat(120);
  const lines = rows.map((r) =>
    [
      r.risk_tier,
      r.age_bucket,
      r.gender,
      r.traffic_source,
      r.user_count,
      (r.avg_churn_prob * 100).toFixed(1) + '%',
      '$' + (r.total_revenue_at_risk ?? 0).toLocaleString('en-US', { maximumFractionDigits: 0 }),
      (r.avg_orders_per_month ?? 0).toFixed(2),
      (r.avg_return_rate * 100).toFixed(1) + '%',
      r.one_time_buyers,
    ].join(' | ')
  );
  return `## Segment Summary\n${header}\n${divider}\n${lines.join('\n')}`;
}

function formatAtRiskCustomers(customers: Awaited<ReturnType<typeof getTopAtRiskCustomers>>) {
  if (!customers.length) return '';
  const lines = customers.map((c) =>
    `- User ${c.user_id}: $${(c.total_revenue ?? 0).toLocaleString()} revenue, ${(c.churn_probability * 100).toFixed(1)}% churn prob, ${c.age_bucket} ${c.gender}, ${c.traffic_source}, top drivers: ${c.top_feature_1}, ${c.top_feature_2}, ${c.top_feature_3}`
  );
  return `## Top At-Risk Customers (by revenue)\n${lines.join('\n')}`;
}

export async function POST(req: NextRequest) {
  const { messages, question } = await req.json();
  const q = (question as string).toLowerCase();

  // Detect mentioned sources — only filter if exactly one source is mentioned and it's not a comparison
  const mentionedSources = [
    /email/.test(q) ? 'Email' : null,
    /facebook/.test(q) ? 'Facebook' : null,
    /adwords/.test(q) ? 'Adwords' : null,
    /organic/.test(q) ? 'Organic' : null,
    /youtube/.test(q) ? 'YouTube' : null,
  ].filter(Boolean);
  const isComparison = /compar|vs|versus/.test(q);
  const trafficSourceFilter =
    mentionedSources.length === 1 && !isComparison ? (mentionedSources[0] as string) : undefined;

  const ageBucketFilter = /18.?24/.test(q)
    ? '18-24'
    : /25.?34/.test(q)
    ? '25-34'
    : /35.?44/.test(q)
    ? '35-44'
    : /45.?54/.test(q)
    ? '45-54'
    : /55\+/.test(q)
    ? '55+'
    : undefined;

  // Fetch data context
  const [stats, segments] = await Promise.all([
    getOverviewStats(),
    getSegmentSummary({ trafficSource: trafficSourceFilter, ageBucket: ageBucketFilter }),
  ]);

  console.log('[ChurnLens] question:', question);
  console.log('[ChurnLens] filters — source:', trafficSourceFilter ?? 'none', '| age:', ageBucketFilter ?? 'none');
  console.log('[ChurnLens] segment rows returned:', segments.length);
  console.log('[ChurnLens] sources in data:', [...new Set(segments.map((r) => r.traffic_source))].join(', '));

  let customerContext = '';
  if (/customer|user|who|top/.test(q)) {
    const customers = await getTopAtRiskCustomers(5);
    customerContext = formatAtRiskCustomers(customers);
  }

  const dataContext = [
    formatOverviewStats(stats),
    formatSegmentSummary(segments),
    customerContext,
  ]
    .filter(Boolean)
    .join('\n\n');

  const systemPrompt = `You are ChurnLens, an AI analyst for a TheLook ecommerce customer risk scoring system.
You have access to real customer data from a database of 80,110 scored customers.
Answer questions about churn risk, customer segments, and retention strategies using the data provided.
Be specific — always reference actual numbers from the data context.
Keep answers concise (under 200 words) but data-rich.
When recommending retention actions, be specific about channel, timing, and targeting.
Format responses in clean markdown. Use bullet points for recommendations.
Never make up numbers — only use figures from the data context provided.
Do not use emojis in responses. Use clean markdown only.

--- LIVE DATA CONTEXT ---
${dataContext}
--- END DATA CONTEXT ---`;

  // Build message history (last 6 messages)
  const history = (messages as Array<{ role: string; content: string }>).slice(-6);

  const stream = anthropic.messages.stream({
    model: 'claude-opus-4-6',
    max_tokens: 1024,
    system: systemPrompt,
    messages: history as Anthropic.MessageParam[],
  });

  const readableStream = new ReadableStream({
    async start(controller) {
      try {
        for await (const event of stream) {
          if (
            event.type === 'content_block_delta' &&
            event.delta.type === 'text_delta'
          ) {
            controller.enqueue(
              new TextEncoder().encode(`data: ${JSON.stringify({ text: event.delta.text })}\n\n`)
            );
          }
        }
        controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n'));
        controller.close();
      } catch (err) {
        controller.error(err);
      }
    },
  });

  return new Response(readableStream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}
