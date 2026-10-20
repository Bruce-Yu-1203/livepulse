export class BroadcastConfigurationError extends Error {
  public constructor() {
    super('Live broadcasting is not configured');
    this.name = 'BroadcastConfigurationError';
  }
}

export class BroadcastUnavailableError extends Error {
  public constructor() {
    super('The broadcast is not live');
    this.name = 'BroadcastUnavailableError';
  }
}
