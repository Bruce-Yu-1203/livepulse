export class AuditLogDatabaseUnavailableError extends Error {
  public constructor(options?: ErrorOptions) {
    super('The audit history is temporarily unavailable', options);
    this.name = 'AuditLogDatabaseUnavailableError';
  }
}

export class InvalidAuditLogCursorError extends Error {
  public constructor(options?: ErrorOptions) {
    super('The audit-log cursor is invalid', options);
    this.name = 'InvalidAuditLogCursorError';
  }
}
