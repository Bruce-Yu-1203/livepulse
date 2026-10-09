export class EmailAlreadyExistsError extends Error {
  public constructor() {
    super('An account with this email already exists');
    this.name = 'EmailAlreadyExistsError';
  }
}

export class DatabaseUnavailableError extends Error {
  public constructor(options?: ErrorOptions) {
    super('The database is temporarily unavailable', options);
    this.name = 'DatabaseUnavailableError';
  }
}

export class InvalidCredentialsError extends Error {
  public constructor() {
    super('The email or password is incorrect');
    this.name = 'InvalidCredentialsError';
  }
}

export class InvalidSessionError extends Error {
  public constructor() {
    super('The session is invalid or has expired');
    this.name = 'InvalidSessionError';
  }
}
