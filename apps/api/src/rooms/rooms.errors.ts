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

export class InvalidRoomCursorError extends Error {
  public constructor(options?: ErrorOptions) {
    super('The room cursor is invalid', options);
    this.name = 'InvalidRoomCursorError';
  }
}

export class RoomNotFoundError extends Error {
  public constructor() {
    super('The room was not found');
    this.name = 'RoomNotFoundError';
  }
}
