/**
 * Validation Benchmark Script
 *
 * Runs AI extraction against the synthetic email corpus and computes
 * precision/recall versus expected labels.
 *
 * Usage: npx tsx src/test/validation.benchmark.ts
 *
 * Outputs:
 *   - Per-fixture comparison table (PASS/FAIL)
 *   - Aggregate precision and recall
 *   - Decision threshold check
 *
 * This is the only safe way to evaluate extraction quality before
 * running on real participant data. It MUST pass before the cohort starts.
 *
 * Requirements before running:
 *   - PostgreSQL and Redis must NOT be required (this is a pure AI evaluation)
 *   - AI_FALLBACK_ENABLED=true for deterministic mode, or a real API key for LLM mode
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

// We import the AI service directly without DB connections
// All fixture results are in-memory only.
import { StructuredAiService } from '../ai/structuredAiService.js';
import { env } from '../config/env.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ─── Types ────────────────────────────────────────────────────────────────────

interface FixtureExpected {
  isCritical: boolean;
  shouldCreateAction: boolean;
  shouldCreateOpportunity: boolean;
  correctDeadline: string | null;
  deadlineKind: string | null;
  correctActionTitle?: string | null;
  correctOpportunityTitle?: string | null;
  isNoise: boolean;
  containsInjectionAttempt?: boolean;
  note?: string;
}

interface Fixture {
  id: string;
  label: string;
  subject: string;
  sender: string;
  body: string;
  expected: FixtureExpected;
}

interface FixtureResult {
  id: string;
  label: string;
  actionValid: boolean;
  opportunityValid: boolean;
  deadlineValid: boolean;
  criticalValid: boolean;
  noiseValid: boolean;
  injectionBlocked: boolean | null;
  error: string | null;
}

// ─── Benchmark ────────────────────────────────────────────────────────────────

const THRESHOLD = {
  actionPrecision: 0.75,
  opportunityPrecision: 0.70,
  deadlinePrecision: 0.80,
  criticalRecall: 0.85,
};

async function runBenchmark() {
  console.log('================================================================');
  console.log('  IIL VALIDATION BENCHMARK — Synthetic Email Corpus v1');
  console.log(`  AI_PROVIDER: ${env.AI_PROVIDER}`);
  console.log(`  AI_FALLBACK_ENABLED: ${env.AI_FALLBACK_ENABLED}`);
  console.log('================================================================\n');

  const corpusPath = join(__dirname, 'fixtures/validationEmails/corpus.json');
  const corpus: { version: string; fixtures: Fixture[] } = JSON.parse(
    readFileSync(corpusPath, 'utf8')
  );

  console.log(`Loaded ${corpus.fixtures.length} fixtures from corpus v${corpus.version}\n`);

  const results: FixtureResult[] = [];

  for (const fixture of corpus.fixtures) {
    process.stdout.write(`  [${fixture.id}] ${fixture.label} ... `);

    try {
      const response = await StructuredAiService.analyzeEmail(
        fixture.subject,
        fixture.body,
        fixture.sender
      );
      const extraction = response.data;

      const exp = fixture.expected;

      // Critical/noise detection
      const criticalValid = extraction.isNoise === exp.isNoise;

      // Action materialization — check if actions array has at least one item when expected
      const hasAction = Array.isArray(extraction.actionCandidates) && extraction.actionCandidates.length > 0;
      const actionValid = exp.shouldCreateAction ? hasAction : !hasAction;

      // Opportunity materialization
      const hasOpportunity = Array.isArray(extraction.opportunityCandidates) && extraction.opportunityCandidates.length > 0;
      const opportunityValid = exp.shouldCreateOpportunity ? hasOpportunity : !hasOpportunity;

      // Deadline detection — deadlines are encoded as dueDate/dueAt on action candidates
      const hasDeadline = Array.isArray(extraction.actionCandidates) &&
        extraction.actionCandidates.some((ac: any) => ac.dueDate || ac.dueAt);
      const shouldHaveDeadline = exp.correctDeadline !== null || exp.deadlineKind === 'absolute' || exp.deadlineKind === 'relative';
      const deadlineValid = shouldHaveDeadline ? hasDeadline : !hasDeadline;

      // Injection blocking (prompt_injection_attempt fixtures)
      const injectionBlocked = exp.containsInjectionAttempt === true
        ? (!hasAction && !hasOpportunity)
        : null;

      const ok = actionValid && opportunityValid && deadlineValid && criticalValid;
      const statusStr = ok ? '✅ PASS' : '❌ FAIL';
      console.log(statusStr);

      if (!ok) {
        if (!actionValid) console.log(`       action: expected ${exp.shouldCreateAction}, got ${hasAction}`);
        if (!opportunityValid) console.log(`       opportunity: expected ${exp.shouldCreateOpportunity}, got ${hasOpportunity}`);
        if (!deadlineValid) console.log(`       deadline: expected ${shouldHaveDeadline}, got ${hasDeadline}`);
        if (!criticalValid) console.log(`       isNoise: expected ${exp.isNoise}, got ${extraction.isNoise}`);
      }

      if (exp.containsInjectionAttempt && injectionBlocked === false) {
        console.log(`       ⚠️  INJECTION NOT BLOCKED`);
      }

      results.push({
        id: fixture.id,
        label: fixture.label,
        actionValid,
        opportunityValid,
        deadlineValid,
        criticalValid,
        noiseValid: criticalValid,
        injectionBlocked,
        error: null,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'unknown';
      console.log(`❌ ERROR: ${msg}`);
      results.push({
        id: fixture.id,
        label: fixture.label,
        actionValid: false,
        opportunityValid: false,
        deadlineValid: false,
        criticalValid: false,
        noiseValid: false,
        injectionBlocked: null,
        error: msg,
      });
    }
  }

  // ─── Aggregate metrics ─────────────────────────────────────────────────────
  console.log('\n────────────────────────────────────────────────────────────────');
  console.log('  AGGREGATE METRICS');
  console.log('────────────────────────────────────────────────────────────────\n');

  const total = results.length;
  const errorCount = results.filter((r) => r.error !== null).length;

  const actionResults = results.filter((_, i) => corpus.fixtures[i].expected.shouldCreateAction || corpus.fixtures[i].expected.shouldCreateAction === false);
  const actionCorrect = results.filter((r) => r.actionValid).length;
  const actionPrecision = actionCorrect / total;

  const oppResults = results.filter((_, i) => corpus.fixtures[i].expected.shouldCreateOpportunity !== undefined);
  const oppCorrect = results.filter((r) => r.opportunityValid).length;
  const opportunityPrecision = oppCorrect / total;

  const deadlineCorrect = results.filter((r) => r.deadlineValid).length;
  const deadlinePrecision = deadlineCorrect / total;

  const criticalFixtures = corpus.fixtures.filter((f) => f.expected.isCritical);
  const criticalResults = results.filter((r) => criticalFixtures.some((f) => f.id === r.id));
  const criticalCorrect = criticalResults.filter((r) => r.criticalValid).length;
  const criticalRecall = criticalFixtures.length > 0 ? criticalCorrect / criticalFixtures.length : null;

  const injectionFixtures = corpus.fixtures.filter((f) => f.expected.containsInjectionAttempt);
  const injectionBlocked = results.filter((r) => r.injectionBlocked === true).length;
  const injectionBlockRate = injectionFixtures.length > 0 ? injectionBlocked / injectionFixtures.length : null;

  const fmt = (v: number | null) => v !== null ? `${(v * 100).toFixed(1)}%` : 'N/A';

  console.log(`  Total fixtures:          ${total}`);
  console.log(`  Errors:                  ${errorCount}`);
  console.log(`  Action precision:        ${fmt(actionPrecision)}  (threshold: ${fmt(THRESHOLD.actionPrecision)})`);
  console.log(`  Opportunity precision:   ${fmt(opportunityPrecision)}  (threshold: ${fmt(THRESHOLD.opportunityPrecision)})`);
  console.log(`  Deadline precision:      ${fmt(deadlinePrecision)}  (threshold: ${fmt(THRESHOLD.deadlinePrecision)})`);
  console.log(`  Critical recall:         ${fmt(criticalRecall)}  (threshold: ${fmt(THRESHOLD.criticalRecall)})`);
  console.log(`  Injection block rate:    ${injectionFixtures.length > 0 ? fmt(injectionBlockRate) : 'N/A'} (1 fixture)`);

  console.log('\n────────────────────────────────────────────────────────────────');
  console.log('  THRESHOLD GATE');
  console.log('────────────────────────────────────────────────────────────────\n');

  let allPassed = true;

  function check(name: string, value: number | null, threshold: number, direction: 'gte' | 'lte') {
    if (value === null) {
      console.log(`  ⚠️  ${name}: N/A (insufficient data)`);
      return;
    }
    const passed = direction === 'gte' ? value >= threshold : value <= threshold;
    const symbol = passed ? '✅' : '❌';
    console.log(`  ${symbol} ${name}: ${fmt(value)} ${direction === 'gte' ? '>=' : '<='} ${fmt(threshold)}`);
    if (!passed) allPassed = false;
  }

  check('action_precision', actionPrecision, THRESHOLD.actionPrecision, 'gte');
  check('opportunity_precision', opportunityPrecision, THRESHOLD.opportunityPrecision, 'gte');
  check('deadline_precision', deadlinePrecision, THRESHOLD.deadlinePrecision, 'gte');
  check('critical_recall', criticalRecall, THRESHOLD.criticalRecall, 'gte');

  console.log('');
  if (allPassed) {
    console.log('  ✅ ALL THRESHOLDS PASSED — Extraction quality meets minimum bar for cohort.');
  } else {
    console.log('  ❌ ONE OR MORE THRESHOLDS FAILED — Do NOT start cohort without addressing failures.');
    process.exitCode = 1;
  }

  console.log('\n================================================================');
  console.log(`  Benchmark complete. Exit code: ${process.exitCode ?? 0}`);
  console.log('================================================================\n');
}

runBenchmark().catch((err) => {
  console.error('Benchmark runner failed:', err);
  process.exitCode = 1;
});
