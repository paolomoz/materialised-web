/**
 * Content Safety Module
 *
 * Zero-tolerance content safety validation with blocking capability.
 * This module is part of a multi-layer safety system that ensures all generated
 * content is on-brand, on-topic, and safe for the Vitamix website.
 *
 * ## CONTENT SAFETY ARCHITECTURE
 *
 * The Vitamix generative system employs a multi-layer safety approach:
 *
 * ### Layer 1: Topic Relevance / Food Angle Finder (PRE-GENERATION)
 * Location: lib/topic-relevance.ts
 * Timing: Stage 1.5 in orchestrator (after intent, before RAG)
 *
 * PHILOSOPHY: Find a food/Vitamix angle for almost ANY query.
 *
 * Instead of rejecting queries that aren't explicitly about food, this layer
 * creatively interprets user intent to generate relevant culinary content.
 *
 * Examples:
 * - "my kids hate going to school" → Fun breakfast ideas, lunchbox treats
 * - "I'm stressed about work" → Calming smoothies, comfort food recipes
 * - "planning a road trip" → Travel-friendly snacks, portable meal prep
 * - "Formula One racing" → Race day snacks, high-energy drinks
 *
 * Only REJECTS queries that are:
 * - Explicitly offensive (hate speech, violence)
 * - Clearly trying to manipulate/jailbreak the system
 * - Requesting harmful content (drugs, weapons, self-harm)
 *
 * Returns: foodAngle and suggestedQuery to guide content generation
 *
 * ### Layer 2: Content Safety (POST-GENERATION)
 * Location: THIS FILE (lib/content-safety.ts)
 * Timing: Stage 6 in orchestrator (after content generation)
 * Purpose: Validate generated content for brand compliance and safety
 *
 * Checks performed:
 * - Fast regex pattern matching (profanity, competitors, health claims)
 * - Brand compliance validation via LLM
 * - Toxicity detection via LLM
 *
 * ### Layer 3: Brand Voice (DURING GENERATION)
 * Location: prompts/brand-voice.ts
 * Purpose: Guide LLM to generate on-brand content
 *
 * ## BLOCKING BEHAVIOR
 *
 * Topic Rejection (Layer 1 - VERY RARE):
 * - Only for truly offensive/manipulative content
 * - Returns early with rejection message
 * - SSE event: 'error' with code 'OFF_TOPIC_QUERY'
 *
 * Content Safety Block (Layer 2):
 * - Replaces generated content with fallback
 * - SSE event: 'error' with code 'CONTENT_SAFETY_BLOCK'
 *
 * ## RELATED FILES
 *
 * - lib/topic-relevance.ts - Food angle finder (Layer 1)
 * - prompts/brand-voice.ts - Brand voice guidelines
 * - lib/fallback-content.ts - Safe fallback content
 * - lib/orchestrator.ts - Integration point for all safety layers
 */

import type { Env } from '../types';
import { validateBrandCompliance } from '../ai-clients/cerebras';
import { BANNED_PATTERNS } from '../prompts/brand-voice';

// ============================================================================
// Types
// ============================================================================

export type SafetyFlagType =
  | 'profanity'
  | 'hate_speech'
  | 'violence'
  | 'sexual'
  | 'harmful_advice'
  | 'competitor_mention'
  | 'off_brand'
  | 'unverified_claim';

export type SafetySeverity = 'low' | 'medium' | 'high' | 'critical';

export interface ContentSafetyFlag {
  type: SafetyFlagType;
  severity: SafetySeverity;
  text: string;
  position?: { start: number; end: number };
  suggestion?: string;
}

export interface ContentSafetyScores {
  brandCompliance: number;       // 0-100, from existing validation
  toxicity: number;              // 0-1, higher = more toxic
  offensiveness: number;         // 0-1, from flag severity
  overallSafety: number;         // 0-100, combined score
}

export interface ContentSafetyResult {
  safe: boolean;                 // Content passes safety checks
  blocked: boolean;              // Content should be blocked
  reason?: string;               // Reason for blocking
  scores: ContentSafetyScores;
  flags: ContentSafetyFlag[];
  suggestions: string[];         // Suggested improvements
  timing: {
    regexCheck: number;
    brandCheck: number;
    toxicityCheck: number;
    total: number;
  };
}

// ============================================================================
// Safety Thresholds Configuration
// ============================================================================

export const SAFETY_THRESHOLDS = {
  brandCompliance: {
    block: 50,    // Block if score < 50
    warn: 70,     // Warn if score < 70
    pass: 70,     // Pass if score >= 70
  },
  toxicity: {
    block: 0.3,   // Block if toxicity > 0.3
    warn: 0.1,    // Warn if toxicity > 0.1
  },
  offensiveness: {
    block: 0.5,   // Block if offensiveness > 0.5 (high/critical flags)
    warn: 0.2,    // Warn if offensiveness > 0.2 (medium flags)
  },
  // Number of flags by severity that trigger blocking
  flagCounts: {
    critical: 1,  // Block on any critical flag
    high: 2,      // Block on 2+ high flags
    medium: 3,    // Block on 3+ medium flags
  },
};

// ============================================================================
// Extended Offensive Content Patterns
// ============================================================================

interface OffensivePattern {
  pattern: RegExp;
  type: SafetyFlagType;
  severity: SafetySeverity;
  suggestion?: string;
}

/**
 * Extended patterns beyond brand-voice.ts
 * These focus on offensive/harmful content, not just off-brand messaging
 */
export const OFFENSIVE_PATTERNS: OffensivePattern[] = [
  // ==================== PROFANITY ====================
  // Mild profanity - low severity (might be contextual)
  { pattern: /\b(damn|darn|hell|crap|sucks?)\b/gi, type: 'profanity', severity: 'low' },

  // ==================== COMPETITOR MENTIONS ====================
  { pattern: /\b(ninja\s+blender|ninja\s+professional|ninja\s+foodi)\b/gi, type: 'competitor_mention', severity: 'medium', suggestion: 'Remove competitor reference' },
  { pattern: /\b(blendtec|blendtec\s+blender)\b/gi, type: 'competitor_mention', severity: 'medium', suggestion: 'Remove competitor reference' },
  { pattern: /\b(nutribullet|magic\s+bullet)\b/gi, type: 'competitor_mention', severity: 'medium', suggestion: 'Remove competitor reference' },
  { pattern: /\b(cuisinart\s+blender|kitchenaid\s+blender)\b/gi, type: 'competitor_mention', severity: 'medium', suggestion: 'Remove competitor reference' },
  { pattern: /\b(better\s+than\s+(?:ninja|blendtec|nutribullet))\b/gi, type: 'competitor_mention', severity: 'high', suggestion: 'Avoid competitive comparisons' },

  // ==================== UNVERIFIED HEALTH CLAIMS ====================
  { pattern: /\b(cure[sd]?|cures?|curing)\s+(cancer|diabetes|disease|illness|condition)\b/gi, type: 'unverified_claim', severity: 'critical', suggestion: 'Remove unverified medical claims' },
  { pattern: /\b(treat[sd]?|treats?|treating)\s+(cancer|diabetes|disease|illness)\b/gi, type: 'unverified_claim', severity: 'critical', suggestion: 'Use "may support" instead of treatment claims' },
  { pattern: /\b(heal[sd]?|heals?|healing)\s+(cancer|diabetes|disease|illness)\b/gi, type: 'unverified_claim', severity: 'critical', suggestion: 'Remove unverified healing claims' },
  { pattern: /\b(guaranteed|proven)\s+to\s+(cure|treat|heal|fix|eliminate)\b/gi, type: 'unverified_claim', severity: 'critical', suggestion: 'Remove guarantee language' },
  { pattern: /\b(rapid|extreme|fast|quick)\s+weight\s+loss\b/gi, type: 'harmful_advice', severity: 'high', suggestion: 'Use "healthy weight management" instead' },
  { pattern: /\b(miracle|magic)\s+(cure|remedy|solution|diet)\b/gi, type: 'unverified_claim', severity: 'high', suggestion: 'Remove miracle claims' },
  { pattern: /\bdetox\s+(your\s+)?body\b/gi, type: 'unverified_claim', severity: 'medium', suggestion: 'Use "support healthy eating" instead' },

  // ==================== HARMFUL ADVICE ====================
  { pattern: /\b(skip|replace)\s+(meals?|eating|food)\s+(entirely|completely)\b/gi, type: 'harmful_advice', severity: 'high', suggestion: 'Promote balanced nutrition' },
  { pattern: /\b(extreme|crash)\s+diet(ing)?\b/gi, type: 'harmful_advice', severity: 'high', suggestion: 'Promote sustainable healthy eating' },
  { pattern: /\b(only\s+eat|eat\s+only)\s+(smoothies?|liquids?)\b/gi, type: 'harmful_advice', severity: 'medium', suggestion: 'Recommend balanced diet' },

  // ==================== VIOLENCE (rare but must catch) ====================
  { pattern: /\b(kill|murder|destroy|attack|violent|weapon)\b/gi, type: 'violence', severity: 'high' },

  // ==================== OFF-BRAND (extend existing BANNED_PATTERNS) ====================
  { pattern: /\b(cheap|cheapest|cheaply)\b/gi, type: 'off_brand', severity: 'medium', suggestion: 'Use "value" or "accessible"' },
  { pattern: /\b(budget|budget-friendly|budget\s+option)\b/gi, type: 'off_brand', severity: 'medium', suggestion: 'Use "accessible" or remove' },
  { pattern: /\b(hack|hacks|life\s*hack|blender\s+hack)\b/gi, type: 'off_brand', severity: 'low', suggestion: 'Use "tip" or "technique"' },
  { pattern: /\b(game-?changer|game\s+changing)\b/gi, type: 'off_brand', severity: 'low', suggestion: 'Use "transformative"' },
  { pattern: /\b(revolutionary|revolutionize)\b/gi, type: 'off_brand', severity: 'low', suggestion: 'Use "innovative"' },
  { pattern: /\b(insane|crazy|killer|epic|awesome)\b/gi, type: 'off_brand', severity: 'low', suggestion: 'Use professional descriptors' },
  { pattern: /\b(just\s+(?:throw|dump|toss)|throw\s+everything\s+in)\b/gi, type: 'off_brand', severity: 'low', suggestion: 'Use more professional language' },
  { pattern: /\b(super\s+(?:cheap|easy|simple))\b/gi, type: 'off_brand', severity: 'low', suggestion: 'Maintain premium positioning' },
];

// ============================================================================
// Fast Regex-Based Safety Check
// ============================================================================

/**
 * Run fast regex-based safety checks on content
 */
export function runRegexSafetyChecks(content: string): ContentSafetyFlag[] {
  const flags: ContentSafetyFlag[] = [];

  for (const { pattern, type, severity, suggestion } of OFFENSIVE_PATTERNS) {
    let match;
    // Reset regex to start fresh
    pattern.lastIndex = 0;

    while ((match = pattern.exec(content)) !== null) {
      flags.push({
        type,
        severity,
        text: match[0],
        position: { start: match.index, end: match.index + match[0].length },
        suggestion,
      });
    }
  }

  // Also check original BANNED_PATTERNS from brand-voice
  for (const { pattern, suggestion } of BANNED_PATTERNS) {
    let match;
    pattern.lastIndex = 0;

    while ((match = pattern.exec(content)) !== null) {
      // Check if we already have this flag from OFFENSIVE_PATTERNS
      const alreadyFlagged = flags.some(
        f => f.text.toLowerCase() === match![0].toLowerCase()
      );
      if (!alreadyFlagged) {
        flags.push({
          type: 'off_brand',
          severity: 'low',
          text: match[0],
          position: { start: match.index, end: match.index + match[0].length },
          suggestion,
        });
      }
    }
  }

  return flags;
}

// ============================================================================
// LLM-Based Toxicity Check
// ============================================================================

export interface ToxicityCheckResult {
  safe: boolean;
  toxicityScore: number;
  flags: Array<{
    type: string;
    severity: string;
    excerpt: string;
  }>;
  explanation: string;
}

/**
 * Check content for toxicity using LLM
 * Uses Llama 3.1 8B for fast classification
 */
export async function checkToxicity(
  content: string,
  env: Env
): Promise<ToxicityCheckResult> {
  const messages = [
    {
      role: 'system' as const,
      content: `You are a content safety classifier for a premium kitchen appliance brand (Vitamix).
Analyze the text for any concerning content that could damage brand reputation or harm users.

Check for:
1. Profanity or vulgar language
2. Hate speech or discrimination
3. Violence or harmful content
4. Sexual or inappropriate content
5. Harmful health/diet advice (extreme diets, eating disorders)
6. Unverified medical claims (cures disease, treats conditions)
7. Competitor negativity or attacks

This content will appear on vitamix.com so must be family-friendly and professionally appropriate.

Return ONLY valid JSON:
{
  "safe": boolean,
  "toxicityScore": 0.0-1.0 (0=safe, 1=toxic),
  "flags": [{"type": "...", "severity": "low|medium|high|critical", "excerpt": "..."}],
  "explanation": "brief reason (max 50 words)"
}`,
    },
    {
      role: 'user' as const,
      content: `Analyze this Vitamix website content for safety concerns:\n\n${content.slice(0, 4000)}`,
    },
  ];

  try {
    const response = await fetch('https://api.cerebras.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${env.CEREBRAS_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'llama3.1-8b',
        messages,
        max_tokens: 500,
        temperature: 0.1, // Low temperature for consistent classification
      }),
    });

    if (!response.ok) {
      console.error('[checkToxicity] Cerebras API error:', response.status);
      // Default to safe if API fails (don't block on API errors)
      return {
        safe: true,
        toxicityScore: 0,
        flags: [],
        explanation: 'Toxicity check skipped due to API error',
      };
    }

    const result = await response.json() as {
      choices: Array<{ message: { content: string } }>;
    };
    const text = result.choices[0].message.content;

    // Parse JSON from response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        safe: parsed.safe ?? true,
        toxicityScore: Math.min(1, Math.max(0, parsed.toxicityScore || 0)),
        flags: parsed.flags || [],
        explanation: parsed.explanation || '',
      };
    }
  } catch (error) {
    console.error('[checkToxicity] Error:', error);
  }

  // Default to safe on error
  return {
    safe: true,
    toxicityScore: 0,
    flags: [],
    explanation: 'Unable to parse toxicity check result',
  };
}

// ============================================================================
// Safety Score Aggregation
// ============================================================================

/**
 * Calculate offensiveness score based on flags
 */
function calculateOffensivenessScore(flags: ContentSafetyFlag[]): number {
  if (flags.length === 0) return 0;

  // Weight by severity
  const weights: Record<SafetySeverity, number> = {
    low: 0.1,
    medium: 0.25,
    high: 0.5,
    critical: 1.0,
  };

  const totalWeight = flags.reduce(
    (sum, flag) => sum + weights[flag.severity],
    0
  );

  // Cap at 1.0
  return Math.min(1, totalWeight);
}

/**
 * Calculate overall safety score (0-100)
 */
function calculateOverallSafety(
  brandScore: number,
  toxicityScore: number,
  offensivenessScore: number
): number {
  // Weight: brand 40%, toxicity 40%, offensive patterns 20%
  const toxicityPenalty = toxicityScore * 100;
  const offensivenessPenalty = offensivenessScore * 100;

  const overall = (
    brandScore * 0.4 +
    (100 - toxicityPenalty) * 0.4 +
    (100 - offensivenessPenalty) * 0.2
  );

  return Math.round(Math.max(0, Math.min(100, overall)));
}

/**
 * Determine if content should be blocked based on all checks
 */
function shouldBlockContent(
  scores: ContentSafetyScores,
  flags: ContentSafetyFlag[]
): { blocked: boolean; reason?: string } {
  // Check brand compliance threshold
  if (scores.brandCompliance < SAFETY_THRESHOLDS.brandCompliance.block) {
    return {
      blocked: true,
      reason: `Brand compliance score ${scores.brandCompliance} below threshold ${SAFETY_THRESHOLDS.brandCompliance.block}`,
    };
  }

  // Check toxicity threshold
  if (scores.toxicity > SAFETY_THRESHOLDS.toxicity.block) {
    return {
      blocked: true,
      reason: `Toxicity score ${scores.toxicity.toFixed(2)} exceeds threshold ${SAFETY_THRESHOLDS.toxicity.block}`,
    };
  }

  // Check for critical flags
  const criticalFlags = flags.filter(f => f.severity === 'critical');
  if (criticalFlags.length >= SAFETY_THRESHOLDS.flagCounts.critical) {
    return {
      blocked: true,
      reason: `Critical safety flag: ${criticalFlags[0].text} (${criticalFlags[0].type})`,
    };
  }

  // Check for high severity flags
  const highFlags = flags.filter(f => f.severity === 'high');
  if (highFlags.length >= SAFETY_THRESHOLDS.flagCounts.high) {
    return {
      blocked: true,
      reason: `Multiple high-severity safety flags (${highFlags.length}): ${highFlags.map(f => f.type).join(', ')}`,
    };
  }

  // Check for medium severity flags
  const mediumFlags = flags.filter(f => f.severity === 'medium');
  if (mediumFlags.length >= SAFETY_THRESHOLDS.flagCounts.medium) {
    return {
      blocked: true,
      reason: `Multiple medium-severity safety flags (${mediumFlags.length}): ${mediumFlags.map(f => f.type).join(', ')}`,
    };
  }

  return { blocked: false };
}

/**
 * Generate improvement suggestions based on flags
 */
function generateSuggestions(flags: ContentSafetyFlag[]): string[] {
  const suggestions: string[] = [];
  const seen = new Set<string>();

  for (const flag of flags) {
    if (flag.suggestion && !seen.has(flag.suggestion)) {
      suggestions.push(`${flag.type}: "${flag.text}" - ${flag.suggestion}`);
      seen.add(flag.suggestion);
    }
  }

  // Limit suggestions
  return suggestions.slice(0, 10);
}

// ============================================================================
// Main Validation Function
// ============================================================================

/**
 * Comprehensive content safety validation
 *
 * Combines:
 * 1. Fast regex-based pattern matching
 * 2. Existing brand compliance check
 * 3. LLM-based toxicity detection
 *
 * Returns blocking decision with detailed reasoning
 */
export async function validateContentSafety(
  content: string,
  context: { query: string; intent: string },
  env: Env
): Promise<ContentSafetyResult> {
  const timing = {
    regexCheck: 0,
    brandCheck: 0,
    toxicityCheck: 0,
    total: 0,
  };
  const startTime = Date.now();

  // 1. Fast regex-based checks
  const regexStart = Date.now();
  const regexFlags = runRegexSafetyChecks(content);
  timing.regexCheck = Date.now() - regexStart;

  // 2. Run brand compliance and toxicity checks in parallel
  const [brandResult, toxicityResult] = await Promise.all([
    (async () => {
      const start = Date.now();
      const result = await validateBrandCompliance(content, env);
      timing.brandCheck = Date.now() - start;
      return result;
    })(),
    (async () => {
      const start = Date.now();
      const result = await checkToxicity(content, env);
      timing.toxicityCheck = Date.now() - start;
      return result;
    })(),
  ]);

  // Combine flags from all sources
  const allFlags: ContentSafetyFlag[] = [...regexFlags];

  // Add toxicity flags
  for (const toxicFlag of toxicityResult.flags) {
    allFlags.push({
      type: toxicFlag.type as SafetyFlagType,
      severity: toxicFlag.severity as SafetySeverity,
      text: toxicFlag.excerpt,
    });
  }

  // Calculate scores
  const offensivenessScore = calculateOffensivenessScore(allFlags);
  const scores: ContentSafetyScores = {
    brandCompliance: brandResult.score,
    toxicity: toxicityResult.toxicityScore,
    offensiveness: offensivenessScore,
    overallSafety: calculateOverallSafety(
      brandResult.score,
      toxicityResult.toxicityScore,
      offensivenessScore
    ),
  };

  // Determine blocking decision
  const blockDecision = shouldBlockContent(scores, allFlags);

  // Determine if safe (passes warning thresholds)
  const safe =
    scores.brandCompliance >= SAFETY_THRESHOLDS.brandCompliance.warn &&
    scores.toxicity <= SAFETY_THRESHOLDS.toxicity.warn &&
    allFlags.filter(f => f.severity === 'high' || f.severity === 'critical').length === 0;

  timing.total = Date.now() - startTime;

  return {
    safe,
    blocked: blockDecision.blocked,
    reason: blockDecision.reason,
    scores,
    flags: allFlags,
    suggestions: generateSuggestions(allFlags),
    timing,
  };
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Quick safety check using only regex (no API calls)
 * Use for pre-filtering before full validation
 */
export function quickSafetyCheck(content: string): {
  passed: boolean;
  criticalFlags: ContentSafetyFlag[];
} {
  const flags = runRegexSafetyChecks(content);
  const criticalFlags = flags.filter(
    f => f.severity === 'critical' || f.severity === 'high'
  );

  return {
    passed: criticalFlags.length === 0,
    criticalFlags,
  };
}

/**
 * Check if content is safe for a specific use case
 */
export function isSafeForUseCase(
  result: ContentSafetyResult,
  useCase: 'production' | 'preview' | 'debug'
): boolean {
  switch (useCase) {
    case 'production':
      return !result.blocked && result.safe;
    case 'preview':
      return !result.blocked;
    case 'debug':
      return true; // Allow viewing for debugging
    default:
      return !result.blocked;
  }
}

// ============================================================================
// Re-exports: Topic Relevance (Layer 1)
// ============================================================================

/**
 * Re-export topic relevance module for convenient access to all safety features
 * from a single import point.
 *
 * Usage:
 *   import { validateTopicRelevance, TopicRelevanceResult } from './content-safety';
 *
 * Or import directly:
 *   import { validateTopicRelevance } from './topic-relevance';
 */
export {
  validateTopicRelevance,
  getTopicRejectionResponse,
  type TopicRelevanceResult,
  type TopicCategory,
} from './topic-relevance';
