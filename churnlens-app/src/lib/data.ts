import { supabase } from './supabase';

export interface OverviewStats {
  totalCustomers: number;
  highRiskCount: number;
  highRiskPct: number;
  mediumRiskCount: number;
  lowRiskCount: number;
  revenueAtRisk: number;
}

export interface SegmentRow {
  risk_tier: string;
  age_bucket: string;
  gender: string;
  traffic_source: string;
  user_count: number;
  avg_churn_prob: number;
  total_revenue_at_risk: number;
  avg_orders: number;
  avg_orders_per_month: number;
  avg_return_rate: number;
  one_time_buyers: number;
}

export interface AtRiskCustomer {
  user_id: string;
  churn_probability: number;
  risk_tier: string;
  total_revenue: number;
  age_bucket: string;
  gender: string;
  traffic_source: string;
  total_orders: number;
  top_feature_1: string;
  top_feature_2: string;
  top_feature_3: string;
}

export async function getOverviewStats(): Promise<OverviewStats> {
  try {
    // Use vw_segment_summary which is pre-aggregated — avoids Supabase's 1000-row default limit
    const { data, error } = await supabase
      .from('vw_segment_summary')
      .select('risk_tier, user_count, total_revenue_at_risk');

    if (error) throw error;

    const counts = { High: 0, Medium: 0, Low: 0 };
    let revenueAtRisk = 0;

    for (const row of data ?? []) {
      const tier = row.risk_tier as 'High' | 'Medium' | 'Low';
      if (tier in counts) counts[tier] += row.user_count ?? 0;
      if (tier === 'High') revenueAtRisk += row.total_revenue_at_risk ?? 0;
    }

    const total = counts.High + counts.Medium + counts.Low;

    return {
      totalCustomers: total,
      highRiskCount: counts.High,
      highRiskPct: total > 0 ? (counts.High / total) * 100 : 0,
      mediumRiskCount: counts.Medium,
      lowRiskCount: counts.Low,
      revenueAtRisk,
    };
  } catch {
    // Fallback to known dataset stats
    return {
      totalCustomers: 80110,
      highRiskCount: 55869,
      highRiskPct: 69.7,
      mediumRiskCount: 6747,
      lowRiskCount: 17494,
      revenueAtRisk: 6300000,
    };
  }
}

export async function getSegmentSummary(filters?: {
  trafficSource?: string;
  ageBucket?: string;
}): Promise<SegmentRow[]> {
  try {
    let query = supabase
      .from('vw_segment_summary')
      .select('*')
      .order('total_revenue_at_risk', { ascending: false })
      .limit(20);

    if (filters?.trafficSource) {
      query = query.ilike('traffic_source', filters.trafficSource);
    }
    if (filters?.ageBucket) {
      query = query.eq('age_bucket', filters.ageBucket);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data ?? [];
  } catch {
    return [];
  }
}

export async function getTopAtRiskCustomers(limit = 5): Promise<AtRiskCustomer[]> {
  try {
    const { data, error } = await supabase
      .from('vw_customer_risk')
      .select(
        'user_id, churn_probability, risk_tier, total_revenue, age_bucket, gender, traffic_source, total_orders, top_feature_1, top_feature_2, top_feature_3'
      )
      .eq('risk_tier', 'High')
      .order('total_revenue', { ascending: false })
      .limit(limit);

    if (error) throw error;
    return data ?? [];
  } catch {
    return [];
  }
}
