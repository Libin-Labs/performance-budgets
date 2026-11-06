import {
  summarize,
  evaluateBudgets,
  type MetricSummary,
  type PerformanceReport,
} from '@lp-labs/performance-budgets';
const summary: MetricSummary = summarize([1, 2, 3]);
const report: PerformanceReport = evaluateBudgets({ x: [1, 2] }, [{ name: 'x', limit: 3 }]);
// @ts-expect-error only documented statistics are supported.
evaluateBudgets({}, [{ name: 'x', limit: 1, statistic: 'p99' }]);
void [summary, report];
