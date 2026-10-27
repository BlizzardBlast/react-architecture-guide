// Shared infrastructure has no dependency on any business entity.
export interface AnalyticsSink {
  track(eventName: string, fields: Readonly<Record<string, string | number>>): void | Promise<void>;
}
