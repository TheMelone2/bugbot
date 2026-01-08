export class NeedMoreInfoError extends Error {
  public missingFields: string[];
  public details?: string;

  constructor(missingFields: string[], message?: string) {
    super(message ?? "Missing information for bug report generation");
    this.name = "NeedMoreInfoError";
    this.missingFields = missingFields;
    this.details = message;
  }
}