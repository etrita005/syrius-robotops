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

export class SolutionNotFoundError extends AppError {
  constructor(id: string) {
    super("SOLUTION_NOT_FOUND", `Solution '${id}' does not exist.`, 404);
  }
}

export class SolutionAlreadyExistsError extends AppError {
  constructor(id: string) {
    super("SOLUTION_ALREADY_EXISTS", `Solution '${id}' already exists.`, 409);
  }
}

export class InvalidSolutionIdError extends AppError {
  constructor(id: string) {
    super("INVALID_SOLUTION_ID", `Solution ID '${id}' contains invalid characters.`, 400);
  }
}

export class NoActiveSolutionError extends AppError {
  constructor() {
    super("NO_ACTIVE_SOLUTION", "No active solution selected. Please select or create a solution first.", 400);
  }
}

export class SolutionCorruptedError extends AppError {
  constructor(id: string) {
    super("SOLUTION_CORRUPTED", `Metadata for solution '${id}' is corrupted.`, 500);
  }
}

export class ImportInvalidArchiveError extends AppError {
  constructor() {
    super("IMPORT_INVALID_ARCHIVE", "The selected file is not a valid solution archive.", 400);
  }
}

export class ImportIdCollisionError extends AppError {
  constructor() {
    super("IMPORT_ID_COLLISION", "Import cancelled due to ID collision.", 409);
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

export class RobotNotFoundError extends AppError {
  constructor(id: string) {
    super("ROBOT_NOT_FOUND", `Robot '${id}' does not exist.`, 404);
  }
}

export class InvalidRobotIdError extends AppError {
  constructor(id: string) {
    super("INVALID_ROBOT_ID", `Robot ID '${id}' contains invalid characters.`, 400);
  }
}

export class InvalidRobotAddressError extends AppError {
  constructor() {
    super("INVALID_ROBOT_ADDRESS", "Robot address cannot be empty and must not exceed 256 characters.", 400);
  }
}

export class RobotAddressExistsError extends AppError {
  constructor(address: string) {
    super("ROBOT_ADDRESS_EXISTS", `Robot with address '${address}' already exists in this solution.`, 409);
  }
}
