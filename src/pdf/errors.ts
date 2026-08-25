import type { WorkerErrorPayload } from './protocol';

export const PDF_ERROR_CODES = [
  'INVALID_PDF',
  'PASSWORD_REQUIRED',
  'UNSUPPORTED_ENCRYPTION',
  'UNSUPPORTED_FILE_TYPE',
  'IMAGE_DECODE_FAILED',
  'PDF_PARSE_FAILED',
  'PDF_RENDER_FAILED',
  'PDF_WRITE_FAILED',
  'WORKER_INITIALIZATION_FAILED',
  'WORKER_RUNTIME_FAILED',
  'TASK_CANCELLED',
  'OUT_OF_MEMORY_OR_RESOURCE_LIMIT',
  'UNKNOWN',
] as const;

export type PdfErrorCode = (typeof PDF_ERROR_CODES)[number];

const userMessages: Record<PdfErrorCode, string> = {
  INVALID_PDF: 'This PDF is invalid or could not be read.',
  PASSWORD_REQUIRED: 'This PDF is password-protected and cannot be opened yet.',
  UNSUPPORTED_ENCRYPTION: 'This PDF uses encryption that is not supported.',
  UNSUPPORTED_FILE_TYPE: 'This file type is not supported.',
  IMAGE_DECODE_FAILED: 'This image could not be decoded.',
  PDF_PARSE_FAILED: 'The PDF could not be read.',
  PDF_RENDER_FAILED: 'A PDF page could not be rendered.',
  PDF_WRITE_FAILED: 'The PDF could not be generated.',
  WORKER_INITIALIZATION_FAILED: 'The PDF engine could not be started.',
  WORKER_RUNTIME_FAILED: 'The PDF engine stopped unexpectedly.',
  TASK_CANCELLED: 'The PDF operation was cancelled.',
  OUT_OF_MEMORY_OR_RESOURCE_LIMIT: 'This document is too large to process in the browser.',
  UNKNOWN: 'The PDF operation could not be completed.',
};

export class PdfDomainError extends Error {
  readonly code: PdfErrorCode;
  readonly userMessage: string;
  readonly cause: unknown;

  constructor(code: PdfErrorCode, message: string, cause?: unknown, userMessage = userMessages[code]) {
    super(message, { cause });
    this.name = 'PdfDomainError';
    this.code = code;
    this.userMessage = userMessage;
    this.cause = cause;
  }
}

export function isPdfErrorCode(value: unknown): value is PdfErrorCode {
  return typeof value === 'string' && (PDF_ERROR_CODES as readonly string[]).includes(value);
}

export function toPdfDomainError(error: unknown, fallbackCode: PdfErrorCode = 'UNKNOWN'): PdfDomainError {
  if (error instanceof PdfDomainError) return error;

  const name = typeof error === 'object' && error !== null && 'name' in error
    ? String(error.name)
    : '';
  const message = error instanceof Error ? error.message : String(error ?? 'Unknown PDF error');

  if (name === 'PasswordException') {
    return new PdfDomainError('PASSWORD_REQUIRED', message, error);
  }

  if (name === 'InvalidPDFException' || /invalid pdf|invalidpdf|invalid pdf structure/i.test(message)) {
    return new PdfDomainError('INVALID_PDF', message, error);
  }

  if (name === 'AbortException' || /cancelled|canceled|aborted/i.test(message)) {
    return new PdfDomainError('TASK_CANCELLED', message, error);
  }

  if (/out of memory|allocation failed|array buffer|resource limit/i.test(message)) {
    return new PdfDomainError('OUT_OF_MEMORY_OR_RESOURCE_LIMIT', message, error);
  }

  if (/decode|image|jpeg|jpg|png/i.test(message) && /invalid|failed|unable|corrupt/i.test(message)) {
    return new PdfDomainError('IMAGE_DECODE_FAILED', message, error);
  }

  return new PdfDomainError(fallbackCode, message, error);
}

export function toWorkerErrorPayload(error: unknown, fallbackCode: PdfErrorCode = 'UNKNOWN'): WorkerErrorPayload {
  const domainError = toPdfDomainError(error, fallbackCode);
  return {
    code: domainError.code,
    message: domainError.message,
    userMessage: domainError.userMessage,
  };
}

export function fromWorkerErrorPayload(payload: WorkerErrorPayload): PdfDomainError {
  const code = isPdfErrorCode(payload.code) ? payload.code : 'UNKNOWN';
  return new PdfDomainError(code, payload.message, undefined, payload.userMessage || userMessages[code]);
}
