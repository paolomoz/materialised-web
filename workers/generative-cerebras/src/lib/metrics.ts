/**
 * Metrics Collection Module
 *
 * Collects and aggregates metrics for content quality monitoring:
 * - Safety scores and block rates
 * - Content provenance statistics
 * - Performance metrics
 * - Alert conditions
 */

import type { Env } from '../types';
import type { ContentSafetyResult } from './content-safety';
import type { ContentProvenance } from './provenance-tracker';

// ============================================================================
// Types
// ============================================================================

export interface GenerationMetrics {
  timestamp: string;
  query: string;
  intentType: string;
  safety: {
    blocked: boolean;
    brandScore: number;
    toxicityScore: number;
    flagCount: number;
    reason?: string;
  };
  provenance: {
    ragContribution: number;
    source: 'rag' | 'generated' | 'hybrid';
    recipeCount: number;
    aiGeneratedRecipes: number;
  };
  performance: {
    totalLatency: number;
    intentLatency?: number;
    ragLatency?: number;
    generationLatency?: number;
    validationLatency?: number;
  };
}

export interface AggregatedMetrics {
  period: {
    start: string;
    end: string;
    duration: string;  // '1h', '24h', '7d'
  };
  safety: {
    totalGenerated: number;
    blocked: number;
    warnings: number;
    blockRate: number;           // 0-1 percentage
    averageBrandScore: number;
    averageToxicityScore: number;
    blockReasons: Record<string, number>;
  };
  provenance: {
    averageRagContribution: number;
    sourceDistribution: {
      rag: number;
      hybrid: number;
      generated: number;
    };
    recipeBreakdown: {
      total: number;
      vitamixOfficial: number;
      ragAdapted: number;
      aiGenerated: number;
    };
  };
  performance: {
    averageLatency: number;
    p50Latency: number;
    p95Latency: number;
    maxLatency: number;
  };
  topBlockedQueries: Array<{
    query: string;
    count: number;
    reason: string;
  }>;
}

export interface Alert {
  id: string;
  severity: 'info' | 'warning' | 'critical';
  type: 'block_rate_spike' | 'score_degradation' | 'latency_spike' | 'ai_recipe_spike';
  message: string;
  value: number;
  threshold: number;
  timestamp: string;
}

// ============================================================================
// Alert Thresholds
// ============================================================================

export const ALERT_THRESHOLDS = {
  blockRate: {
    warning: 0.1,   // 10% blocked
    critical: 0.2,  // 20% blocked
  },
  brandScore: {
    warning: 75,    // Average below 75
    critical: 60,   // Average below 60
  },
  toxicityScore: {
    warning: 0.1,   // Average above 0.1
    critical: 0.2,  // Average above 0.2
  },
  latency: {
    warning: 5000,  // 5 seconds
    critical: 10000, // 10 seconds
  },
  aiRecipeRate: {
    warning: 0.3,   // 30% AI-generated recipes
    critical: 0.5,  // 50% AI-generated recipes
  },
};

// ============================================================================
// Metrics Collection
// ============================================================================

/**
 * Record a generation event with all metrics
 */
export async function recordGenerationMetrics(
  env: Env,
  data: GenerationMetrics
): Promise<void> {
  try {
    // Store individual metric record
    const key = `metrics:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
    await env.CACHE.put(key, JSON.stringify(data), {
      expirationTtl: 86400 * 7, // Keep for 7 days
    });

    // Update counters
    await incrementCounter(env, 'total_generated');
    if (data.safety.blocked) {
      await incrementCounter(env, 'blocked');
    }
    if (data.safety.flagCount > 0 && !data.safety.blocked) {
      await incrementCounter(env, 'warnings');
    }

    // Update running averages
    await updateRunningAverage(env, 'avg_brand_score', data.safety.brandScore);
    await updateRunningAverage(env, 'avg_latency', data.performance.totalLatency);
    await updateRunningAverage(env, 'avg_rag_contribution', data.provenance.ragContribution);

    // Track blocked reasons
    if (data.safety.blocked && data.safety.reason) {
      await incrementCounter(env, `block_reason:${data.safety.reason.slice(0, 50)}`);
    }

    // Track AI-generated recipes
    if (data.provenance.aiGeneratedRecipes > 0) {
      await incrementCounter(env, 'ai_generated_recipes', data.provenance.aiGeneratedRecipes);
    }
    await incrementCounter(env, 'total_recipes', data.provenance.recipeCount);

  } catch (error) {
    console.error('[recordGenerationMetrics] Error:', error);
    // Don't throw - metrics should not block the main flow
  }
}

/**
 * Increment a counter in KV
 */
async function incrementCounter(env: Env, key: string, amount: number = 1): Promise<void> {
  const fullKey = `counter:${key}`;
  const current = await env.CACHE.get(fullKey);
  const value = (current ? parseInt(current, 10) : 0) + amount;
  await env.CACHE.put(fullKey, String(value), { expirationTtl: 86400 * 30 });
}

/**
 * Update a running average
 */
async function updateRunningAverage(env: Env, key: string, newValue: number): Promise<void> {
  const avgKey = `avg:${key}`;
  const countKey = `avg_count:${key}`;

  const currentAvg = parseFloat(await env.CACHE.get(avgKey) || '0');
  const count = parseInt(await env.CACHE.get(countKey) || '0', 10);

  // Calculate new running average
  const newCount = count + 1;
  const newAvg = (currentAvg * count + newValue) / newCount;

  await env.CACHE.put(avgKey, String(newAvg), { expirationTtl: 86400 * 30 });
  await env.CACHE.put(countKey, String(newCount), { expirationTtl: 86400 * 30 });
}

// ============================================================================
// Metrics Retrieval
// ============================================================================

/**
 * Get aggregated metrics for a time range
 */
export async function getAggregatedMetrics(
  env: Env,
  range: '1h' | '24h' | '7d' = '24h'
): Promise<AggregatedMetrics> {
  const now = Date.now();
  const rangeMs = {
    '1h': 60 * 60 * 1000,
    '24h': 24 * 60 * 60 * 1000,
    '7d': 7 * 24 * 60 * 60 * 1000,
  }[range];

  const startTime = now - rangeMs;

  // Get metrics from KV
  const metrics = await getMetricsInRange(env, startTime, now);

  if (metrics.length === 0) {
    return getEmptyMetrics(range, startTime, now);
  }

  // Aggregate safety metrics
  const blocked = metrics.filter(m => m.safety.blocked).length;
  const warnings = metrics.filter(m => m.safety.flagCount > 0 && !m.safety.blocked).length;
  const avgBrandScore = average(metrics.map(m => m.safety.brandScore));
  const avgToxicityScore = average(metrics.map(m => m.safety.toxicityScore));

  // Count block reasons
  const blockReasons: Record<string, number> = {};
  for (const m of metrics.filter(m => m.safety.blocked && m.safety.reason)) {
    const reason = m.safety.reason!.slice(0, 50);
    blockReasons[reason] = (blockReasons[reason] || 0) + 1;
  }

  // Aggregate provenance metrics
  const avgRagContribution = average(metrics.map(m => m.provenance.ragContribution));
  const sourceDistribution = {
    rag: metrics.filter(m => m.provenance.source === 'rag').length,
    hybrid: metrics.filter(m => m.provenance.source === 'hybrid').length,
    generated: metrics.filter(m => m.provenance.source === 'generated').length,
  };

  // Recipe breakdown
  const totalRecipes = sum(metrics.map(m => m.provenance.recipeCount));
  const aiGeneratedRecipes = sum(metrics.map(m => m.provenance.aiGeneratedRecipes));

  // Performance metrics
  const latencies = metrics.map(m => m.performance.totalLatency).sort((a, b) => a - b);
  const avgLatency = average(latencies);
  const p50Latency = percentile(latencies, 50);
  const p95Latency = percentile(latencies, 95);
  const maxLatency = Math.max(...latencies);

  // Top blocked queries
  const blockedQueries: Record<string, { count: number; reason: string }> = {};
  for (const m of metrics.filter(m => m.safety.blocked)) {
    const key = m.query.slice(0, 100);
    if (!blockedQueries[key]) {
      blockedQueries[key] = { count: 0, reason: m.safety.reason || 'unknown' };
    }
    blockedQueries[key].count++;
  }
  const topBlockedQueries = Object.entries(blockedQueries)
    .map(([query, data]) => ({ query, ...data }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  return {
    period: {
      start: new Date(startTime).toISOString(),
      end: new Date(now).toISOString(),
      duration: range,
    },
    safety: {
      totalGenerated: metrics.length,
      blocked,
      warnings,
      blockRate: metrics.length > 0 ? blocked / metrics.length : 0,
      averageBrandScore: avgBrandScore,
      averageToxicityScore: avgToxicityScore,
      blockReasons,
    },
    provenance: {
      averageRagContribution: avgRagContribution,
      sourceDistribution,
      recipeBreakdown: {
        total: totalRecipes,
        vitamixOfficial: totalRecipes - aiGeneratedRecipes, // Approximation
        ragAdapted: 0, // Would need more detailed tracking
        aiGenerated: aiGeneratedRecipes,
      },
    },
    performance: {
      averageLatency: avgLatency,
      p50Latency,
      p95Latency,
      maxLatency,
    },
    topBlockedQueries,
  };
}

/**
 * Get raw metrics in a time range
 */
async function getMetricsInRange(
  env: Env,
  startTime: number,
  endTime: number
): Promise<GenerationMetrics[]> {
  const metrics: GenerationMetrics[] = [];

  // List all metric keys (this is a simplified approach)
  // In production, you'd use a more efficient index
  const list = await env.CACHE.list({ prefix: 'metrics:' });

  for (const key of list.keys) {
    // Extract timestamp from key
    const parts = key.name.split(':');
    if (parts.length >= 2) {
      const timestamp = parseInt(parts[1], 10);
      if (timestamp >= startTime && timestamp <= endTime) {
        const data = await env.CACHE.get(key.name, 'json');
        if (data) {
          metrics.push(data as GenerationMetrics);
        }
      }
    }
  }

  return metrics;
}

/**
 * Get empty metrics structure
 */
function getEmptyMetrics(range: string, start: number, end: number): AggregatedMetrics {
  return {
    period: {
      start: new Date(start).toISOString(),
      end: new Date(end).toISOString(),
      duration: range,
    },
    safety: {
      totalGenerated: 0,
      blocked: 0,
      warnings: 0,
      blockRate: 0,
      averageBrandScore: 0,
      averageToxicityScore: 0,
      blockReasons: {},
    },
    provenance: {
      averageRagContribution: 0,
      sourceDistribution: { rag: 0, hybrid: 0, generated: 0 },
      recipeBreakdown: { total: 0, vitamixOfficial: 0, ragAdapted: 0, aiGenerated: 0 },
    },
    performance: {
      averageLatency: 0,
      p50Latency: 0,
      p95Latency: 0,
      maxLatency: 0,
    },
    topBlockedQueries: [],
  };
}

// ============================================================================
// Blocked Content Log
// ============================================================================

/**
 * Get blocked content log
 */
export async function getBlockedContentLog(
  env: Env,
  limit: number = 100
): Promise<Array<{
  timestamp: string;
  query: string;
  reason: string;
  scores: {
    brandCompliance: number;
    toxicity: number;
  };
}>> {
  const logs: Array<any> = [];

  const list = await env.CACHE.list({ prefix: 'blocked:' });

  for (const key of list.keys.slice(0, limit)) {
    const data = await env.CACHE.get(key.name, 'json');
    if (data) {
      logs.push({
        timestamp: (data as any).timestamp,
        query: (data as any).query,
        reason: (data as any).reason,
        scores: {
          brandCompliance: (data as any).scores?.brandCompliance || 0,
          toxicity: (data as any).scores?.toxicity || 0,
        },
      });
    }
  }

  // Sort by timestamp descending
  return logs.sort((a, b) =>
    new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );
}

// ============================================================================
// Alert System
// ============================================================================

/**
 * Check alert conditions and return active alerts
 */
export async function checkAlerts(
  env: Env,
  metrics: AggregatedMetrics
): Promise<Alert[]> {
  const alerts: Alert[] = [];
  const now = new Date().toISOString();

  // Block rate alerts
  if (metrics.safety.blockRate > ALERT_THRESHOLDS.blockRate.critical) {
    alerts.push({
      id: `block_rate_${Date.now()}`,
      severity: 'critical',
      type: 'block_rate_spike',
      message: `Block rate is ${(metrics.safety.blockRate * 100).toFixed(1)}% (threshold: ${ALERT_THRESHOLDS.blockRate.critical * 100}%)`,
      value: metrics.safety.blockRate,
      threshold: ALERT_THRESHOLDS.blockRate.critical,
      timestamp: now,
    });
  } else if (metrics.safety.blockRate > ALERT_THRESHOLDS.blockRate.warning) {
    alerts.push({
      id: `block_rate_${Date.now()}`,
      severity: 'warning',
      type: 'block_rate_spike',
      message: `Block rate is ${(metrics.safety.blockRate * 100).toFixed(1)}% (threshold: ${ALERT_THRESHOLDS.blockRate.warning * 100}%)`,
      value: metrics.safety.blockRate,
      threshold: ALERT_THRESHOLDS.blockRate.warning,
      timestamp: now,
    });
  }

  // Brand score alerts
  if (metrics.safety.averageBrandScore < ALERT_THRESHOLDS.brandScore.critical) {
    alerts.push({
      id: `brand_score_${Date.now()}`,
      severity: 'critical',
      type: 'score_degradation',
      message: `Average brand score is ${metrics.safety.averageBrandScore.toFixed(1)} (threshold: ${ALERT_THRESHOLDS.brandScore.critical})`,
      value: metrics.safety.averageBrandScore,
      threshold: ALERT_THRESHOLDS.brandScore.critical,
      timestamp: now,
    });
  } else if (metrics.safety.averageBrandScore < ALERT_THRESHOLDS.brandScore.warning) {
    alerts.push({
      id: `brand_score_${Date.now()}`,
      severity: 'warning',
      type: 'score_degradation',
      message: `Average brand score is ${metrics.safety.averageBrandScore.toFixed(1)} (threshold: ${ALERT_THRESHOLDS.brandScore.warning})`,
      value: metrics.safety.averageBrandScore,
      threshold: ALERT_THRESHOLDS.brandScore.warning,
      timestamp: now,
    });
  }

  // Latency alerts
  if (metrics.performance.p95Latency > ALERT_THRESHOLDS.latency.critical) {
    alerts.push({
      id: `latency_${Date.now()}`,
      severity: 'critical',
      type: 'latency_spike',
      message: `P95 latency is ${metrics.performance.p95Latency}ms (threshold: ${ALERT_THRESHOLDS.latency.critical}ms)`,
      value: metrics.performance.p95Latency,
      threshold: ALERT_THRESHOLDS.latency.critical,
      timestamp: now,
    });
  } else if (metrics.performance.p95Latency > ALERT_THRESHOLDS.latency.warning) {
    alerts.push({
      id: `latency_${Date.now()}`,
      severity: 'warning',
      type: 'latency_spike',
      message: `P95 latency is ${metrics.performance.p95Latency}ms (threshold: ${ALERT_THRESHOLDS.latency.warning}ms)`,
      value: metrics.performance.p95Latency,
      threshold: ALERT_THRESHOLDS.latency.warning,
      timestamp: now,
    });
  }

  // AI recipe alerts
  const aiRecipeRate = metrics.provenance.recipeBreakdown.total > 0
    ? metrics.provenance.recipeBreakdown.aiGenerated / metrics.provenance.recipeBreakdown.total
    : 0;

  if (aiRecipeRate > ALERT_THRESHOLDS.aiRecipeRate.critical) {
    alerts.push({
      id: `ai_recipe_${Date.now()}`,
      severity: 'critical',
      type: 'ai_recipe_spike',
      message: `${(aiRecipeRate * 100).toFixed(1)}% of recipes are AI-generated (threshold: ${ALERT_THRESHOLDS.aiRecipeRate.critical * 100}%)`,
      value: aiRecipeRate,
      threshold: ALERT_THRESHOLDS.aiRecipeRate.critical,
      timestamp: now,
    });
  } else if (aiRecipeRate > ALERT_THRESHOLDS.aiRecipeRate.warning) {
    alerts.push({
      id: `ai_recipe_${Date.now()}`,
      severity: 'warning',
      type: 'ai_recipe_spike',
      message: `${(aiRecipeRate * 100).toFixed(1)}% of recipes are AI-generated (threshold: ${ALERT_THRESHOLDS.aiRecipeRate.warning * 100}%)`,
      value: aiRecipeRate,
      threshold: ALERT_THRESHOLDS.aiRecipeRate.warning,
      timestamp: now,
    });
  }

  return alerts;
}

// ============================================================================
// Utility Functions
// ============================================================================

function average(arr: number[]): number {
  if (arr.length === 0) return 0;
  return arr.reduce((sum, val) => sum + val, 0) / arr.length;
}

function sum(arr: number[]): number {
  return arr.reduce((sum, val) => sum + val, 0);
}

function percentile(sortedArr: number[], p: number): number {
  if (sortedArr.length === 0) return 0;
  const index = Math.ceil((p / 100) * sortedArr.length) - 1;
  return sortedArr[Math.max(0, Math.min(index, sortedArr.length - 1))];
}

/**
 * Create metrics from safety and provenance results
 */
export function createGenerationMetrics(
  query: string,
  intentType: string,
  safetyResult: ContentSafetyResult,
  provenance: ContentProvenance,
  timing: {
    total: number;
    intent?: number;
    rag?: number;
    generation?: number;
    validation?: number;
  }
): GenerationMetrics {
  return {
    timestamp: new Date().toISOString(),
    query,
    intentType,
    safety: {
      blocked: safetyResult.blocked,
      brandScore: safetyResult.scores.brandCompliance,
      toxicityScore: safetyResult.scores.toxicity,
      flagCount: safetyResult.flags.length,
      reason: safetyResult.reason,
    },
    provenance: {
      ragContribution: provenance.overall.ragContribution,
      source: provenance.overall.source,
      recipeCount: provenance.recipes.length,
      aiGeneratedRecipes: provenance.recipes.filter(r => r.source === 'ai_generated').length,
    },
    performance: {
      totalLatency: timing.total,
      intentLatency: timing.intent,
      ragLatency: timing.rag,
      generationLatency: timing.generation,
      validationLatency: timing.validation,
    },
  };
}
