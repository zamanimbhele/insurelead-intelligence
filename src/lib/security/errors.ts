export class PublicSubmissionUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PublicSubmissionUnavailableError";
  }
}
