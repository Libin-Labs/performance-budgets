import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { summarize, evaluateBudgets } from '../dist/esm/index.js';
const repeated = (value) => [value, value, value, value, value];
test('summaries use population deviation and nearest-rank p95', () => {
  const summary = summarize([1, 2, 3, 4]);
  assert.equal(summary.count, 4);
  assert.equal(summary.mean, 2.5);
  assert.equal(summary.median, 2.5);
  assert.equal(summary.p95, 4);
  assert.ok(Math.abs(summary.standardDeviation - Math.sqrt(1.25)) < 1e-12);
  assert.deepEqual(summarize([0]), {
    count: 1,
    min: 0,
    max: 0,
    mean: 0,
    median: 0,
    p95: 0,
    standardDeviation: 0,
    coefficientOfVariation: null,
  });
});
test('large samples avoid sum and squared-value overflow', () => {
  const summary = summarize([Number.MAX_VALUE, Number.MAX_VALUE]);
  assert.equal(summary.mean, Number.MAX_VALUE);
  assert.equal(summary.median, Number.MAX_VALUE);
  assert.equal(summary.standardDeviation, 0);
  assert.equal(summarize([Number.MIN_VALUE, Number.MIN_VALUE]).median, Number.MIN_VALUE);
});
test('absolute upper/lower budgets use inclusive boundaries', () => {
  assert.equal(
    evaluateBudgets({ latency: repeated(10) }, [{ name: 'latency', limit: 10 }]).passed,
    true,
  );
  assert.equal(
    evaluateBudgets({ throughput: repeated(10) }, [
      { name: 'throughput', limit: 10, direction: 'lower' },
    ]).passed,
    true,
  );
  assert.equal(
    evaluateBudgets({ throughput: repeated(9) }, [
      { name: 'throughput', limit: 10, direction: 'lower' },
    ]).checks[0].status,
    'fail',
  );
});
test('baseline regression distinguishes lower and higher-is-better metrics', () => {
  const higher = evaluateBudgets(
    { latency: repeated(12) },
    [{ name: 'latency', limit: 100, maxRegressionPercent: 10 }],
    { latency: repeated(10) },
  );
  assert.equal(higher.checks[0].regressionPercent, 20);
  assert.equal(higher.passed, false);
  const lower = evaluateBudgets(
    { rate: repeated(8) },
    [{ name: 'rate', direction: 'lower', limit: 0, maxRegressionPercent: 10 }],
    { rate: repeated(10) },
  );
  assert.equal(lower.checks[0].regressionPercent, 20);
  assert.equal(lower.passed, false);
});
test('zero baselines report unbounded worsening without inventing a percentage', () => {
  const report = evaluateBudgets(
    { x: repeated(1) },
    [{ name: 'x', limit: 10, maxRegressionPercent: 100 }],
    { x: repeated(0) },
  );
  assert.equal(report.checks[0].regressionPercent, Infinity);
  assert.equal(report.checks[0].status, 'fail');
  assert.equal(
    evaluateBudgets({ x: repeated(0) }, [{ name: 'x', limit: 10, maxRegressionPercent: 0 }], {
      x: repeated(0),
    }).passed,
    true,
  );
});
test('insufficient and noisy samples are inconclusive rather than pass', () => {
  assert.equal(
    evaluateBudgets({ x: [1] }, [{ name: 'x', limit: 10 }]).checks[0].status,
    'insufficient',
  );
  const report = evaluateBudgets({ x: [0, 0, 0, 0, 10] }, [
    { name: 'x', limit: 20, maxCoefficientOfVariation: 0.1 },
  ]);
  assert.equal(report.checks[0].status, 'noisy');
  assert.equal(report.passed, false);
  assert.equal(
    evaluateBudgets({ x: repeated(1) }, [{ name: 'x', limit: 10 }], { x: [1] }).checks[0].status,
    'insufficient',
  );
});
test('clear threshold failures take precedence while retaining noise and sample diagnostics', () => {
  const report = evaluateBudgets({ x: [100] }, [{ name: 'x', limit: 10 }]);
  assert.equal(report.checks[0].status, 'fail');
  assert.deepEqual(report.checks[0].reasons, ['insufficient-samples', 'absolute-limit']);
});
test('invalid metrics, missing baselines and unsafe options fail explicitly', () => {
  for (const samples of [[], [NaN], [-1], [Infinity], ['1']])
    assert.throws(() => summarize(samples));
  assert.throws(() => summarize([1, 2], 1), RangeError);
  assert.throws(() => evaluateBudgets({}, [{ name: 'x', limit: 10 }]), TypeError);
  assert.throws(
    () => evaluateBudgets({ x: repeated(1) }, [{ name: 'x', limit: 10, maxRegressionPercent: 5 }]),
    TypeError,
  );
  assert.throws(
    () =>
      evaluateBudgets({}, [
        { name: 'x', limit: 1 },
        { name: 'x', limit: 2 },
      ]),
    TypeError,
  );
  assert.throws(
    () => evaluateBudgets({ x: [1] }, [{ name: 'x', limit: 1, statistic: 'p99' }]),
    TypeError,
  );
});
test('sample order is not mutated and generated summaries meet quantile invariants', () => {
  const input = Array.from({ length: 1000 }, (_, i) => (i * 37) % 101),
    before = [...input],
    result = summarize(input);
  assert.deepEqual(input, before);
  assert.ok(result.min <= result.median && result.median <= result.p95 && result.p95 <= result.max);
  assert.ok(Math.abs(result.mean - input.reduce((sum, n) => sum + n, 0) / input.length) < 1e-10);
});
test('CommonJS evaluates recorded performance data', () => {
  const api = createRequire(import.meta.url)('../dist/cjs/index.js');
  assert.equal(api.evaluateBudgets({ x: repeated(1) }, [{ name: 'x', limit: 2 }]).passed, true);
});
