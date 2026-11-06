# @lp-labs/performance-budgets

Evaluate recorded performance samples against absolute and baseline budgets with explicit
insufficient-data and variation diagnostics. Independent implementation, no runtime or peer
dependencies. This library analyzes supplied data; it does not run benchmarks automatically.

## Install

```bash
npm install @lp-labs/performance-budgets
```

ES2022, ESM/CommonJS and TypeScript declarations. CommonJS can use
`const { summarize, evaluateBudgets } = require('@lp-labs/performance-budgets')`.

## Quickstart

```js
import { summarize, evaluateBudgets } from '@lp-labs/performance-budgets';

const samples = [90, 92, 88, 91, 89];
const summary = summarize(samples);
const report = evaluateBudgets({ startupMs: samples }, [
  { name: 'startupMs', statistic: 'p95', limit: 100, minSamples: 5 },
]);
if (!report.passed || summary.p95 !== 92) throw new Error('Startup budget failed');
```

## Summaries

`summarize(samples: Iterable<number>, maxSamples = 100000): MetricSummary`

Accepts at least one non-negative finite sample; `maxSamples` is a positive safe integer.
Returns `count`, `min`, `max`, `mean`, `median`, `p95`, `standardDeviation` and
`coefficientOfVariation`. Input collections are not mutated.

- Median is the middle sample or midpoint of the two middle samples.
- p95 uses nearest-rank: sorted index `ceil(count * 0.95) - 1`.
- Deviation is the **population** standard deviation, not an unbiased sample estimate.
- CV is standard deviation / mean, or `null` when the computed mean is zero.
- Scaled online moments avoid overflowing raw sums/squares for very large samples.
  Results remain approximate IEEE-754 arithmetic, not exact statistics.

## Budget API

`evaluateBudgets(metrics, budgets, baseline = {}): PerformanceReport`

`metrics` and `baseline` are records of sample arrays in the **same units**.
Each `MetricBudget` has:

| Field                       | Default   | Meaning                                                               |
| --------------------------- | --------- | --------------------------------------------------------------------- |
| `name`                      | required  | Unique metric name, 1..256 UTF-16 units.                              |
| `limit`                     | required  | Non-negative finite absolute threshold.                               |
| `statistic`                 | `'p95'`   | `'min'`, `'max'`, `'mean'`, `'median'` or `'p95'`.                    |
| `direction`                 | `'upper'` | `'upper'`: lower is better; `'lower'`: higher is better.              |
| `minSamples`                | `5`       | Positive safe integer; applies to current and supplied baseline data. |
| `maxCoefficientOfVariation` | omitted   | Non-negative finite threshold for current-sample noise.               |
| `maxRegressionPercent`      | omitted   | Non-negative finite worsening threshold; requires a baseline.         |

There are at most 1000 budgets, each metric collection is bounded to 100000 samples.
Own data properties are required; missing metrics and baseline accessors throw explicitly.
Only named metrics are evaluated; unrelated keys are ignored.

The report contains `passed` and `checks`. Each `BudgetCheck` includes:

- `name`, selected statistic `value`, `baseline` statistic or `null`.
- Signed `regressionPercent` or `null` when no baseline exists.
- `status`: `'pass'`, `'fail'`, `'insufficient'` or `'noisy'`.
- `reasons`: any of `'insufficient-samples'`, `'insufficient-baseline-samples'`,
  `'high-variation'`, `'absolute-limit'`, `'baseline-regression'`.

Boundaries are inclusive: equality passes. Clear threshold failures take precedence over
insufficient/noisy states, but all applicable reasons remain present. Otherwise insufficient
data precedes noise. `passed` requires every check to be `'pass'`; an empty budget list passes
because no checks were requested.

## Baselines and customization

For upper budgets, regression is `(current - baseline) / baseline * 100`; for lower budgets
the numerator reverses. Negative percentages mean improvement. A zero baseline yields
`Infinity` for worsening and `0` otherwise, rather than a fabricated finite percentage.
JSON serialization converts Infinity to null; encode this condition explicitly in your reporter.

```js
import { evaluateBudgets } from '@lp-labs/performance-budgets';

const report = evaluateBudgets(
  { operationsPerSecond: [110, 110, 110, 110, 110] },
  [
    {
      name: 'operationsPerSecond',
      statistic: 'mean',
      direction: 'lower',
      limit: 90,
      maxRegressionPercent: 5,
      maxCoefficientOfVariation: 0.1,
    },
  ],
  { operationsPerSecond: [100, 100, 100, 100, 100] },
);
if (!report.passed || report.checks[0].regressionPercent !== -10) {
  throw new Error('Throughput improvement was misclassified');
}
```

Keep baseline hardware, warmup, sample count and units comparable. Decide your CI exit policy
from statuses; do not treat an insufficient/noisy result as proof of performance.
Baseline variation is not independently classified; only baseline sample count is checked.

## Errors, performance and non-goals

Invalid sample types/missing data/unsupported statistics throw `TypeError`; negative/nonfinite
thresholds, empty collections and capacity violations throw. Exceptions are not converted to passes.
Summarization costs O(N log N) time and O(N) space per named metric; each check recomputes its
summary. No benchmark harness, statistical significance tests, confidence intervals, trend storage,
browser instrumentation, CLI or cross-machine normalization is included.

Exported types: `MetricSummary`, `MetricBudget`, `BudgetCheck`, `PerformanceReport`.

## Support

If this library is useful to you, consider supporting its maintenance with a [donation via PayPal](https://www.paypal.me/LibinPrasanth).

## Author

Created by [Libin Prasanth](https://www.linkedin.com/in/libinprasanth/). Connect on LinkedIn for updates and discussion.
