export class AppError extends Error {
  constructor(
    public code: string,
    message: string,
    public statusCode: 400 | 401 | 403 | 404 | 409 | 500 = 400
  ) {
    super(message);
    this.name = "AppError";
  }
}

export class ArtifactNotFoundError extends AppError {
  constructor(id: string) {
    super("ARTIFACT_NOT_FOUND", `Artifact '${id}' does not exist.`, 404);
  }
}

export class ArtifactAlreadyExistsError extends AppError {
  constructor(id: string) {
    super("ARTIFACT_ALREADY_EXISTS", `Artifact '${id}' already exists.`, 409);
  }
}

export class InvalidArtifactIdError extends AppError {
  constructor(id: string) {
    super("INVALID_ARTIFACT_ID", `Artifact ID '${id}' contains invalid characters.`, 400);
  }
}

export class ArtifactReferencedError extends AppError {
  constructor(refCount: number) {
    super("ARTIFACT_REFERENCED", `This artifact is referenced by ${refCount} solution(s). Please remove references first.`, 409);
  }
}

export class ArtifactDuplicateChecksumError extends AppError {
  constructor() {
    super("ARTIFACT_DUPLICATE_CHECKSUM", "A file with the same checksum already exists. You can reference the existing artifact.", 409);
  }
}

export class FileTooLargeError extends AppError {
  constructor() {
    super("FILE_TOO_LARGE", "File too large. Maximum single file size is 2 GB.", 400);
  }
}

export class RefCountNegativeError extends AppError {
  constructor() {
    super("REFCOUNT_NEGATIVE", "Reference count anomaly detected. Please contact technical support.", 500);
  }
}

export class FlowNotFoundError extends AppError {
  constructor(id: string) {
    super("FLOW_NOT_FOUND", "Flow not found", 404);
  }
}

export class MissingTypeOrDagError extends AppError {
  constructor() {
    super("MISSING_TYPE_OR_DAG", "Missing type or dag", 400);
  }
}

export class InvalidFlowTypeError extends AppError {
  constructor() {
    super("INVALID_TYPE", "Invalid type, must be internal or user", 400);
  }
}

export class InvalidIdsError extends AppError {
  constructor() {
    super("INVALID_IDS", "ids must be an array", 400);
  }
}

export class ResolverNotFoundError extends AppError {
  constructor(name: string) {
    super("RESOLVER_NOT_FOUND", `Resolver '${name}' is not registered`, 400);
  }
}
