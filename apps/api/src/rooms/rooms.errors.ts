export class RoomDatabaseUnavailableError extends Error {
  public constructor(options?: ErrorOptions) {
    super('The database is temporarily unavailable', options);
    this.name = 'RoomDatabaseUnavailableError';
  }
}

export class RoomHostNotFoundError extends Error {
  public constructor(options?: ErrorOptions) {
    super('The authenticated host no longer exists', options);
    this.name = 'RoomHostNotFoundError';
  }
}
