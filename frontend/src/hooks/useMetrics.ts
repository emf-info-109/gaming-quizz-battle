import { useSyncExternalStore } from 'react';
import { getMetricsSnapshot, subscribeMetrics } from '../lib/metrics';

export function useMetrics() {
  return useSyncExternalStore(subscribeMetrics, getMetricsSnapshot, getMetricsSnapshot);
}
