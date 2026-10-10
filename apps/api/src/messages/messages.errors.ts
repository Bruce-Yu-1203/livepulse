export class InvalidMessageCursorError extends Error {
  public constructor(options?: ErrorOptions) {
    super('The message cursor is invalid', options);
    this.name = 'InvalidMessageCursorError';
  }
}

export class MessageDatabaseUnavailableError extends Error {
  public constructor(options?: ErrorOptions) {
    super('Message history is temporarily unavailable', options);
    this.name = 'MessageDatabaseUnavailableError';
  }
}
