import { DefaultLogger as Logger } from 'koatty_logger';

export interface MetricValue {
  value: number;
  timestamp: number;
}

export interface Metric {
  name: string;
  values: MetricValue[];
  min: number;
  max: number;
  avg: number;
  count: number;
}

export class MetricsCollector {
  private static instance: MetricsCollector;
  private metrics: Map<string, Metric> = new Map();

  private constructor() {}

  public static getInstance(): MetricsCollector {
    if (!MetricsCollector.instance) {
      MetricsCollector.instance = new MetricsCollector();
    }
    return MetricsCollector.instance;
  }

  public recordMetric(name: string, value: number): void {
    const metric = this.metrics.get(name) || {
      name,
      values: [],
      min: Infinity,
      max: -Infinity,
      avg: 0,
      count: 0,
    };

    const timestamp = Date.now();
    metric.values.push({ value, timestamp });
    metric.count++;
    metric.min = Math.min(metric.min, value);
    metric.max = Math.max(metric.max, value);
    metric.avg = (metric.avg * (metric.count - 1) + value) / metric.count;

    // Keep only last 1000 values
    if (metric.values.length > 1000) {
      metric.values.shift();
    }

    this.metrics.set(name, metric);
    Logger.log('debug', `Recorded metric ${name}: ${value}`);
  }

  public getMetric(name: string): Metric | undefined {
    return this.metrics.get(name);
  }

  public getAllMetrics(): Metric[] {
    return Array.from(this.metrics.values());
  }

  public clearMetrics(): void {
    this.metrics.clear();
    Logger.log('info', 'Cleared all metrics');
  }

  public getMetricSummary(name: string): string {
    const metric = this.metrics.get(name);
    if (!metric) {
      return `Metric ${name} not found`;
    }

    return `
Metric: ${name}
Count: ${metric.count}
Min: ${metric.min}
Max: ${metric.max}
Average: ${metric.avg.toFixed(2)}
    `.trim();
  }
} 