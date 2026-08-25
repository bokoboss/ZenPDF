import type { PdfErrorCode } from './errors';

export type PdfOperation = 'parse' | 'merge' | 'extract';

export interface WorkerRequestEnvelope<TType extends string, TPayload> {
  type: TType;
  sessionId: string;
  taskId: string;
  payload: TPayload;
}

export interface WorkerResponseEnvelope<TType extends string, TPayload> {
  type: TType;
  sessionId: string;
  taskId: string;
  payload: TPayload;
}

export interface WorkerFileInput {
  id: string;
  file: File;
}

export interface WorkerPageInput {
  uniqueId: string;
  fileId: string;
  pageIndex: number;
  rotation: number;
}

export type ParseFileRequest = WorkerRequestEnvelope<
  'PARSE_FILE',
  { fileId: string; file: File }
>;

export type MergeFilesRequest = WorkerRequestEnvelope<
  'MERGE_FILES',
  { files: WorkerFileInput[] }
>;

export type MergePagesRequest = WorkerRequestEnvelope<
  'MERGE_PAGES',
  { files: WorkerFileInput[]; pages: WorkerPageInput[] }
>;

export type ExtractPagesRequest = WorkerRequestEnvelope<
  'EXTRACT_PAGES',
  { files: WorkerFileInput[]; pages: WorkerPageInput[] }
>;

export type CancelTaskRequest = WorkerRequestEnvelope<
  'CANCEL_TASK',
  { targetTaskId: string }
>;

export type DisposeSessionRequest = WorkerRequestEnvelope<'DISPOSE_SESSION', Record<string, never>>;

export type WorkerRequest =
  | ParseFileRequest
  | MergeFilesRequest
  | MergePagesRequest
  | ExtractPagesRequest
  | CancelTaskRequest
  | DisposeSessionRequest;

export interface TaskProgressPayload {
  operation: PdfOperation;
  phase: 'parse' | 'thumbnail' | 'write';
  completed: number;
  total: number;
}

export type FileParsedResponse = WorkerResponseEnvelope<
  'FILE_PARSED',
  { fileId: string; pageCount: number }
>;

export type ThumbnailGeneratedResponse = WorkerResponseEnvelope<
  'THUMBNAIL_GENERATED',
  { fileId: string; pageIndex: number; blob: Blob }
>;

export type TaskProgressResponse = WorkerResponseEnvelope<'TASK_PROGRESS', TaskProgressPayload>;

export type OutputReadyResponse = WorkerResponseEnvelope<
  'OUTPUT_READY',
  { operation: Exclude<PdfOperation, 'parse'>; blob: Blob }
>;

export type TaskCompletedResponse = WorkerResponseEnvelope<
  'TASK_COMPLETED',
  { operation: PdfOperation }
>;

export type TaskCancelledResponse = WorkerResponseEnvelope<
  'TASK_CANCELLED',
  { operation?: PdfOperation; reason?: string }
>;

export interface WorkerErrorPayload {
  code: PdfErrorCode;
  message: string;
  userMessage: string;
}

export type TaskErrorResponse = WorkerResponseEnvelope<'TASK_ERROR', WorkerErrorPayload>;

export type WorkerResponse =
  | FileParsedResponse
  | ThumbnailGeneratedResponse
  | TaskProgressResponse
  | OutputReadyResponse
  | TaskCompletedResponse
  | TaskCancelledResponse
  | TaskErrorResponse;

const requestTypes = new Set<WorkerRequest['type']>([
  'PARSE_FILE',
  'MERGE_FILES',
  'MERGE_PAGES',
  'EXTRACT_PAGES',
  'CANCEL_TASK',
  'DISPOSE_SESSION',
]);

const responseTypes = new Set<WorkerResponse['type']>([
  'FILE_PARSED',
  'THUMBNAIL_GENERATED',
  'TASK_PROGRESS',
  'OUTPUT_READY',
  'TASK_COMPLETED',
  'TASK_CANCELLED',
  'TASK_ERROR',
]);

export function isWorkerRequest(value: unknown): value is WorkerRequest {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<WorkerRequest>;
  return (
    typeof candidate.type === 'string' &&
    requestTypes.has(candidate.type as WorkerRequest['type']) &&
    typeof candidate.sessionId === 'string' &&
    typeof candidate.taskId === 'string' &&
    'payload' in candidate
  );
}

export function isWorkerResponse(value: unknown): value is WorkerResponse {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<WorkerResponse>;
  return (
    typeof candidate.type === 'string' &&
    responseTypes.has(candidate.type as WorkerResponse['type']) &&
    typeof candidate.sessionId === 'string' &&
    typeof candidate.taskId === 'string' &&
    'payload' in candidate
  );
}
