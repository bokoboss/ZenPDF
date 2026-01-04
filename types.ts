export interface PdfFile {
  id: string;
  file: File;
  name: string;
  size: string;
  pageCount: number;
  thumbnails: string[];
  status: 'uploading' | 'processing' | 'ready' | 'error';
  type: 'pdf' | 'image';
}

export interface PageItem {
  uniqueId: string;
  fileId: string;
  pageIndex: number;
  thumb: string;
  rotation: number;
}

export interface Toast {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info';
}