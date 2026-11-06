export interface MetricSummary {
  count: number;
  min: number;
  max: number;
  mean: number;
  standardDeviation: number;
  median: number;
  p95: number;
  coefficientOfVariation: number | null;
}
export interface MetricBudget {
  name: string;
  statistic?: 'min' | 'max' | 'mean' | 'median' | 'p95';
  limit: number;
  direction?: 'upper' | 'lower';
  minSamples?: number;
  maxCoefficientOfVariation?: number;
  maxRegressionPercent?: number;
}
export interface BudgetCheck {
  name: string;
  status: 'pass' | 'fail' | 'insufficient' | 'noisy';
  value: number;
  reasons: string[];
  baseline: number | null;
  regressionPercent: number | null;
}
export interface PerformanceReport {
  passed: boolean;
  checks: BudgetCheck[];
}
export function summarize(samples: Iterable<number>, maxSamples = 100_000): MetricSummary {
  if (!Number.isSafeInteger(maxSamples) || maxSamples < 1)
    throw new RangeError('maxSamples must be positive.');
  if (samples == null || typeof samples[Symbol.iterator] !== 'function')
    throw new TypeError('Samples must be iterable.');
  const values: number[] = [];
  for (const sample of samples) {
    if (values.length === maxSamples) throw new RangeError('Samples exceed capacity.');
    if (typeof sample !== 'number' || !Number.isFinite(sample) || sample < 0)
      throw new TypeError('Metrics require non-negative finite samples.');
    values.push(sample);
  }
  if (!values.length) throw new RangeError('At least one sample is required.');
  values.sort((a, b) => a - b);
  const scale = values.at(-1)!;
  let average = 0,
    variance = 0,
    count = 0;
  for (const sample of values) {
    const normalized = scale === 0 ? 0 : sample / scale;
    count++;
    const delta = normalized - average;
    average += delta / count;
    variance += delta * (normalized - average);
  }
  const mean = average * scale,
    standardDeviation = Math.sqrt(Math.max(0, variance / count)) * scale;
  const half = Math.floor(values.length / 2);
  const median =
    values.length % 2 ? values[half]! : values[half - 1]! + (values[half]! - values[half - 1]!) / 2;
  return {
    count,
    min: values[0]!,
    max: scale,
    mean,
    standardDeviation,
    median,
    p95: values[Math.ceil(count * 0.95) - 1]!,
    coefficientOfVariation: mean === 0 ? null : standardDeviation / mean,
  };
}
export function evaluateBudgets(
  metrics: Readonly<Record<string, readonly number[]>>,
  budgets: readonly MetricBudget[],
  baseline: Readonly<Record<string, readonly number[]>> = {},
): PerformanceReport {
  if (!Array.isArray(budgets) || budgets.length > 1000)
    throw new RangeError('Expected up to 1000 budgets.');
  const names = new Set<string>(),
    checks: BudgetCheck[] = [];
  for (const entry of budgets) {
    const budget: MetricBudget = entry;
    if (
      typeof budget.name !== 'string' ||
      !budget.name ||
      budget.name.length > 256 ||
      names.has(budget.name)
    )
      throw new TypeError('Budget names must be bounded and unique.');
    names.add(budget.name);
    if (!Number.isFinite(budget.limit) || budget.limit < 0)
      throw new RangeError('Limit must be non-negative and finite.');
    const statistic = budget.statistic ?? 'p95',
      direction = budget.direction ?? 'upper';
    if (
      !['min', 'max', 'mean', 'median', 'p95'].includes(statistic) ||
      !['upper', 'lower'].includes(direction)
    )
      throw new TypeError('Unknown statistic/direction.');
    const minimum = budget.minSamples ?? 5;
    if (!Number.isSafeInteger(minimum) || minimum < 1)
      throw new RangeError('minSamples must be positive.');
    for (const value of [budget.maxCoefficientOfVariation, budget.maxRegressionPercent]) {
      if (value !== undefined && (!Number.isFinite(value) || value < 0))
        throw new RangeError('Noise/regression limits must be non-negative finite numbers.');
    }
    const samples = Object.getOwnPropertyDescriptor(metrics, budget.name);
    if (!samples || !('value' in samples))
      throw new TypeError(`Missing own metric samples: ${budget.name}`);
    const summary = summarize(samples.value as readonly number[]);
    const value = summary[statistic];
    const reasons: string[] = [];
    if (summary.count < minimum) reasons.push('insufficient-samples');
    const noisy =
      budget.maxCoefficientOfVariation !== undefined &&
      summary.coefficientOfVariation !== null &&
      summary.coefficientOfVariation > budget.maxCoefficientOfVariation;
    if (noisy) reasons.push('high-variation');
    let prior: number | null = null,
      regression: number | null = null;
    const reference = Object.getOwnPropertyDescriptor(baseline, budget.name);
    if (reference) {
      if (!('value' in reference)) throw new TypeError('Baseline accessors are not supported.');
      const old = summarize(reference.value as readonly number[]);
      const oldValue = old[statistic];
      prior = oldValue;
      if (old.count < minimum) reasons.push('insufficient-baseline-samples');
      const delta = direction === 'upper' ? value - oldValue : oldValue - value;
      regression = oldValue === 0 ? (delta > 0 ? Infinity : 0) : (delta / oldValue) * 100;
    } else if (budget.maxRegressionPercent !== undefined)
      throw new TypeError(`Baseline required for ${budget.name}`);
    if (direction === 'upper' ? value > budget.limit : value < budget.limit)
      reasons.push('absolute-limit');
    if (
      budget.maxRegressionPercent !== undefined &&
      regression !== null &&
      regression > budget.maxRegressionPercent
    )
      reasons.push('baseline-regression');
    const failed = reasons.includes('absolute-limit') || reasons.includes('baseline-regression');
    const status = failed
      ? 'fail'
      : reasons.some((reason) => reason.startsWith('insufficient'))
        ? 'insufficient'
        : noisy
          ? 'noisy'
          : 'pass';
    checks.push({
      name: budget.name,
      status,
      value,
      reasons,
      baseline: prior,
      regressionPercent: regression,
    });
  }
  return { passed: checks.every((check) => check.status === 'pass'), checks };
}
