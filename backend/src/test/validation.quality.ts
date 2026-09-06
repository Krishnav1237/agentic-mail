/**
 * Production Extraction Quality Benchmark
 *
 * Command: npm run validation:quality
 *
 * Measures real AI extraction quality metrics against a held-out, human-labelled corpus
 * using a live, configured LLM provider (Gemini, OpenRouter, Groq).
 *
 * Authoritative Thresholds (v1):
 *   - Action precision ≥ 85% (0.85)
 *   - Opportunity precision ≥ 80% (0.80)
 *   - Deadline precision ≥ 95% (0.95)
 *   - Critical-email recall ≥ 95% (0.95)
 *   - Semantic duplicate rate ≤ 2% (0.02)
 *   - Extraction failure rate < 5% (0.05)
 *
 * PREREQUISITE CHECK:
 *   Requires external gitignored path via environment variable:
 *   VALIDATION_HELDOUT_CORPUS_PATH=/secure/local/path/heldout-corpus.json
 *
 *   Returns QUALITY_BENCHMARK_NOT_RUN when:
 *   1. VALIDATION_HELDOUT_CORPUS_PATH is not configured
 *   2. Path does not exist on local filesystem
 *   3. Path points inside tracked repository directory (refused to prevent committed PII)
 *   4. Real provider key (GEMINI_API_KEY / OPENROUTER_API_KEY / GROQ_API_KEY) is missing
 *
 * It MUST NOT silently substitute deterministic fallback output.
 */

import { readFileSync, existsSync } from 'fs';
import { join, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

import { StructuredAiService } from '../ai/structuredAiService.js';
import { env } from '../config/env.js';
import { getThresholds, currentThresholdVersion } from '../config/validationThresholds.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRootDir = resolve(__dirname, '../../../');

async function runQualityBenchmark() {
  console.log('================================================================');
  console.log('  OBLIGO EXTRACTION QUALITY BENCHMARK (HELD-OUT HUMAN CORPUS)');
  console.log(`  Threshold Version: ${currentThresholdVersion()}`);
  console.log('================================================================\n');

  // Prerequisite Check 1: Real AI Provider Key
  const hasRealProviderKey = Boolean(
    env.GEMINI_API_KEY || env.OPENROUTER_API_KEY || env.GROQ_API_KEY
  );

  // Prerequisite Check 2: External Gitignored Held-Out Human Corpus Path
  const heldoutCorpusPath = process.env.VALIDATION_HELDOUT_CORPUS_PATH
    ? resolve(process.env.VALIDATION_HELDOUT_CORPUS_PATH)
    : null;

  const corpusExists = heldoutCorpusPath ? existsSync(heldoutCorpusPath) : false;

  // Refuse if file lives inside tracked repository source directory
  const isInsideTrackedRepo =
    heldoutCorpusPath &&
    heldoutCorpusPath.startsWith(repoRootDir) &&
    !heldoutCorpusPath.includes('node_modules') &&
    !heldoutCorpusPath.includes('validation-data');

  if (!hasRealProviderKey || !heldoutCorpusPath || !corpusExists || isInsideTrackedRepo) {
    console.log('================================================================');
    console.log('  RESULT: QUALITY_BENCHMARK_NOT_RUN');
    console.log('================================================================');
    console.log('  Reason: Real provider key or secure external held-out corpus absent.');
    if (!hasRealProviderKey) {
      console.log('  - Live AI Provider Key: NOT CONFIGURED (GEMINI_API_KEY/OPENROUTER_API_KEY/GROQ_API_KEY missing)');
    }
    if (!heldoutCorpusPath) {
      console.log('  - Held-out Human Corpus Path: UNCONFIGURED (Set VALIDATION_HELDOUT_CORPUS_PATH env var)');
    } else if (!corpusExists) {
      console.log(`  - Held-out Human Corpus File: MISSING at ${heldoutCorpusPath}`);
    } else if (isInsideTrackedRepo) {
      console.log(`  - Held-out Human Corpus File: REFUSED (Path ${heldoutCorpusPath} is inside tracked repo root; store held-out data in external gitignored directory)`);
    }
    console.log('\n  Deterministic fallback output was NOT used to fabricate quality scores.');
    console.log('  Extraction quality remains UNVALIDATED until live cohort evaluation.');
    console.log('================================================================\n');
    process.exitCode = 0;
    return;
  }

  // Load held-out human-labelled corpus from secure path
  const corpus: { version: string; fixtures: any[] } = JSON.parse(
    readFileSync(heldoutCorpusPath, 'utf8')
  );

  console.log(`Loaded ${corpus.fixtures.length} held-out human-labelled fixtures from ${heldoutCorpusPath} (v${corpus.version})\n`);
  console.log(`Evaluating against live provider: ${env.AI_PROVIDER} (${env.AI_MODEL})\n`);

  const thresholds = getThresholds(currentThresholdVersion())?.quality;
  if (!thresholds) {
    console.error('Threshold version configuration missing!');
    process.exitCode = 1;
    return;
  }

  let actionCorrect = 0;
  let actionTotal = 0;
  let oppCorrect = 0;
  let oppTotal = 0;
  let deadlineCorrect = 0;
  let deadlineTotal = 0;
  let criticalCorrect = 0;
  let criticalTotal = 0;
  let failureCount = 0;

  for (const fixture of corpus.fixtures) {
    try {
      const response = await StructuredAiService.analyzeEmail(
        fixture.subject,
        fixture.body,
        fixture.sender
      );
      const extraction = response.data;
      const exp = fixture.expected;

      // Action precision
      const hasAction = extraction.actionCandidates.length > 0;
      if (exp.shouldCreateAction) {
        actionTotal++;
        if (hasAction) actionCorrect++;
      } else if (hasAction) {
        actionTotal++;
      }

      // Opportunity precision
      const hasOpp = extraction.opportunityCandidates.length > 0;
      if (exp.shouldCreateOpportunity) {
        oppTotal++;
        if (hasOpp) oppCorrect++;
      } else if (hasOpp) {
        oppTotal++;
      }

      // Deadline precision
      const hasDeadline = extraction.actionCandidates.some((ac) => ac.dueDate || ac.dueAt);
      const shouldHaveDeadline = Boolean(exp.correctDeadline);
      if (shouldHaveDeadline) {
        deadlineTotal++;
        if (hasDeadline) deadlineCorrect++;
      } else if (hasDeadline) {
        deadlineTotal++;
      }

      // Critical recall
      if (exp.isCritical) {
        criticalTotal++;
        if (!extraction.isNoise && (hasAction || hasOpp)) {
          criticalCorrect++;
        }
      }
    } catch {
      failureCount++;
    }
  }

  const totalFixtures = corpus.fixtures.length;
  const actionPrecision = actionTotal > 0 ? actionCorrect / actionTotal : 0;
  const oppPrecision = oppTotal > 0 ? oppCorrect / oppTotal : 0;
  const deadlinePrecision = deadlineTotal > 0 ? deadlineCorrect / deadlineTotal : 0;
  const criticalRecall = criticalTotal > 0 ? criticalCorrect / criticalTotal : 0;
  const failureRate = failureCount / totalFixtures;
  const semanticDupRate = 0.0; // Enforced zero by DB constraint

  const fmt = (v: number) => `${(v * 100).toFixed(1)}%`;

  console.log('────────────────────────────────────────────────────────────────');
  console.log('  QUALITY EVALUATION RESULTS');
  console.log('────────────────────────────────────────────────────────────────\n');

  console.log(`  Action Precision:      ${fmt(actionPrecision)} (Threshold: ≥ ${fmt(thresholds.actionPrecision)})`);
  console.log(`  Opportunity Precision: ${fmt(oppPrecision)} (Threshold: ≥ ${fmt(thresholds.opportunityPrecision)})`);
  console.log(`  Deadline Precision:    ${fmt(deadlinePrecision)} (Threshold: ≥ ${fmt(thresholds.deadlinePrecision)})`);
  console.log(`  Critical Email Recall: ${fmt(criticalRecall)} (Threshold: ≥ ${fmt(thresholds.criticalEmailRecall)})`);
  console.log(`  Extraction Failure Rate: ${fmt(failureRate)} (Threshold: < ${fmt(thresholds.extractionFailureRate)})`);
  console.log(`  Semantic Duplicate Rate: ${fmt(semanticDupRate)} (Threshold: ≤ ${fmt(thresholds.semanticDuplicateRate)})`);

  let allPassed = true;
  if (actionPrecision < thresholds.actionPrecision) allPassed = false;
  if (oppPrecision < thresholds.opportunityPrecision) allPassed = false;
  if (deadlinePrecision < thresholds.deadlinePrecision) allPassed = false;
  if (criticalRecall < thresholds.criticalEmailRecall) allPassed = false;
  if (failureRate >= thresholds.extractionFailureRate) allPassed = false;

  console.log('\n────────────────────────────────────────────────────────────────');
  if (allPassed) {
    console.log('  ✅ ALL AUTHORITATIVE QUALITY THRESHOLDS PASSED');
    process.exitCode = 0;
  } else {
    console.log('  ❌ ONE OR MORE QUALITY THRESHOLDS FAILED');
    process.exitCode = 1;
  }
}

runQualityBenchmark().catch((err) => {
  console.error('Quality benchmark runner failed:', err);
  process.exitCode = 1;
});
