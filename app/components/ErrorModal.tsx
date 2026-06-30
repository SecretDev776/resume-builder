'use client';

import { useEffect, useRef } from 'react';

export type ErrorInfo = {
  title: string;
  message: string;
  details?: string;
  step?: string;
};

type ErrorModalProps = {
  error: ErrorInfo;
  onClose: () => void;
};

export function ErrorModal({ error, onClose }: ErrorModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  async function copyError() {
    const parts = [
      error.title,
      error.step ? `Step: ${error.step}` : null,
      error.message,
      error.details ? `\nDetails:\n${error.details}` : null,
    ].filter(Boolean);
    await navigator.clipboard.writeText(parts.join('\n'));
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="alertdialog"
        aria-labelledby="error-modal-title"
        aria-describedby="error-modal-message"
        className="w-full max-w-lg rounded-lg bg-white shadow-xl"
      >
        <div className="flex items-start gap-3 border-b border-red-100 bg-red-50 px-5 py-4 rounded-t-lg">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-100 text-red-600 text-lg">
            !
          </span>
          <div className="min-w-0 flex-1">
            <h2 id="error-modal-title" className="text-lg font-semibold text-red-900">
              {error.title}
            </h2>
            {error.step && (
              <p className="mt-0.5 text-xs font-medium uppercase tracking-wide text-red-600">
                Failed at: {error.step}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-md p-1 text-gray-400 hover:bg-red-100 hover:text-gray-600"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className="px-5 py-4 space-y-3">
          <p id="error-modal-message" className="text-sm text-gray-800 whitespace-pre-wrap break-words">
            {error.message}
          </p>
          {error.details && (
            <div>
              <p className="mb-1 text-xs font-medium text-gray-500 uppercase tracking-wide">Technical details</p>
              <pre className="max-h-40 overflow-auto rounded-md border border-gray-200 bg-gray-50 p-3 text-xs text-gray-700 whitespace-pre-wrap break-words font-mono">
                {error.details}
              </pre>
            </div>
          )}
        </div>

        <div className="flex flex-col-reverse gap-2 border-t border-gray-100 px-5 py-4 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={copyError}
            className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Copy error
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700"
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
}
