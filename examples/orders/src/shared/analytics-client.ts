export interface AnalyticsClient {
  // Generic technical contract: do not import any Order type here.
  track(name: string, properties: Readonly<Record<string, string | number>>): void;
}
