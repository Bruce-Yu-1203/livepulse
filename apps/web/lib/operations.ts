import type { OperationsSummaryResponse } from '@livepulse/contracts';

export interface OperationMetricCard {
  detail: string;
  label: string;
  value: string;
}

export function operationMetricCards(
  summary: OperationsSummaryResponse,
): OperationMetricCard[] {
  return [
    {
      detail: 'Open WebSocket connections on this API process',
      label: 'Connections',
      value: formatCount(summary.runtime.activeConnections),
    },
    {
      detail: `${formatCount(summary.runtime.acceptedMessages)} accepted since startup`,
      label: 'Messages / min',
      value: formatCount(summary.runtime.acceptedMessagesLastMinute),
    },
    {
      detail: 'WebSocket sends attempted by this API process',
      label: 'Deliveries',
      value: formatCount(summary.runtime.deliveryAttempts),
    },
    {
      detail: 'Redis operations that used local degradation paths',
      label: 'Redis failures',
      value: formatCount(summary.runtime.redisFailures),
    },
  ];
}

export function formatCount(value: number): string {
  return value.toLocaleString('en');
}
