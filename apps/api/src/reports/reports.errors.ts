export class ReportDatabaseUnavailableError extends Error {
  public constructor(options?: ErrorOptions) {
    super('Reports are temporarily unavailable', options);
    this.name = 'ReportDatabaseUnavailableError';
  }
}

export class ReportAlreadyActionedError extends Error {
  public constructor() {
    super('An actioned report cannot be dismissed');
    this.name = 'ReportAlreadyActionedError';
  }
}

export class ReportNotFoundError extends Error {
  public constructor() {
    super('The report was not found');
    this.name = 'ReportNotFoundError';
  }
}

export class ReportMessageNotFoundError extends Error {
  public constructor(options?: ErrorOptions) {
    super('The message to report was not found', options);
    this.name = 'ReportMessageNotFoundError';
  }
}

export class ReportOwnMessageError extends Error {
  public constructor() {
    super('A user cannot report their own message');
    this.name = 'ReportOwnMessageError';
  }
}
