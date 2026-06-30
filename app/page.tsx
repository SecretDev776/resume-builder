'use client';

import { FormEvent, useRef, useState } from 'react';
import { ErrorInfo, ErrorModal } from './components/ErrorModal';
import { baseResumes } from './data/baseResumes';
import { getResumeTheme } from './data/resumeThemes';

type ProgressState = {
  step: string;
  label: string;
  percent: number;
};

const STEPS = [
  { id: 'validating', label: 'Validate' },
  { id: 'preparing', label: 'Prepare' },
  { id: 'generating', label: 'AI generate' },
  { id: 'pdf', label: 'Build PDF' },
  { id: 'complete', label: 'Done' },
] as const;

function stepIndex(step: string): number {
  const idx = STEPS.findIndex((s) => s.id === step);
  return idx === -1 ? 0 : idx;
}

function showError(
  setError: (error: ErrorInfo | null) => void,
  message: string,
  options?: { details?: string; step?: string; title?: string }
) {
  setError({
    title: options?.title ?? 'Resume generation failed',
    message,
    details: options?.details,
    step: options?.step,
  });
}

export default function Home() {
  const formRef = useRef<HTMLFormElement>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState<ProgressState | null>(null);
  const [error, setError] = useState<ErrorInfo | null>(null);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!formRef.current || isGenerating) return;

    setIsGenerating(true);
    setError(null);
    setProgress({ step: 'validating', label: 'Starting…', percent: 0 });

    const formData = new FormData(formRef.current);
    let completed = false;
    let lastStep = 'validating';

    try {
      const response = await fetch('/api/generate-dynamic-resume-pdf', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const contentType = response.headers.get('content-type') ?? '';
        if (contentType.includes('application/json')) {
          const data = (await response.json()) as { error?: string; details?: string };
          showError(setError, data.error ?? `Request failed with status ${response.status}.`, {
            details: data.details,
            step: lastStep,
            title: 'Server error',
          });
        } else {
          const text = await response.text();
          showError(setError, `Request failed with status ${response.status}.`, {
            details: text || undefined,
            step: lastStep,
            title: 'Server error',
          });
        }
        setProgress(null);
        return;
      }

      const reader = response.body?.getReader();
      if (!reader) {
        showError(setError, 'No response stream received from the server.', { step: lastStep });
        setProgress(null);
        return;
      }

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;

          let event: {
            type: string;
            step?: string;
            label?: string;
            percent?: number;
            filename?: string;
            pdf?: string;
            message?: string;
            details?: string;
          };

          try {
            event = JSON.parse(line.slice(6));
          } catch {
            showError(setError, 'Received a malformed response from the server.', {
              details: line,
              step: lastStep,
              title: 'Parse error',
            });
            setProgress(null);
            return;
          }

          if (event.type === 'progress' && event.step && event.label != null && event.percent != null) {
            lastStep = event.step;
            setProgress({ step: event.step, label: event.label, percent: event.percent });
          } else if (event.type === 'error') {
            showError(setError, event.message ?? 'An unknown error occurred.', {
              details: event.details,
              step: event.step ?? lastStep,
            });
            setProgress(null);
            return;
          } else if (event.type === 'complete' && event.pdf && event.filename) {
            const bytes = Uint8Array.from(atob(event.pdf), (c) => c.charCodeAt(0));
            const blob = new Blob([bytes], { type: 'application/pdf' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = event.filename;
            link.click();
            URL.revokeObjectURL(url);
            completed = true;
          }
        }
      }
    } catch (err) {
      showError(setError, err instanceof Error ? err.message : 'Something went wrong.', {
        details: err instanceof Error ? err.stack : undefined,
        step: lastStep,
        title: 'Network error',
      });
      setProgress(null);
    } finally {
      setIsGenerating(false);
      if (completed) {
        formRef.current?.reset();
        setProgress(null);
        setError(null);
      }
    }
  }

  const currentStepIdx = progress ? stepIndex(progress.step) : -1;

  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      {error && <ErrorModal error={error} onClose={() => setError(null)} />}

      <div className="bg-white shadow-lg rounded-lg p-8 w-full max-w-xl">
        <h1 className="text-2xl font-bold mb-6 text-center text-gray-800">Dynamic Resume PDF Generator</h1>
        <form ref={formRef} onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-gray-700 font-medium mb-2">Base Resume Profile:</label>
            <select
              name="base_resume_profile"
              disabled={isGenerating}
              className="w-full border border-gray-300 rounded-md p-2 text-black bg-white focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:bg-gray-100 disabled:cursor-not-allowed"
              defaultValue={baseResumes[0]?.name}
            >
              {baseResumes.map((p) => (
                <option key={p.name} value={p.name}>
                  {p.name} — {getResumeTheme(p.themeId).label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-gray-700 font-medium mb-2">Job Description:</label>
            <textarea
              name="job_description"
              required
              disabled={isGenerating}
              rows={6}
              className="w-full border border-gray-300 rounded-md p-2 text-black bg-white focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none disabled:bg-gray-100 disabled:cursor-not-allowed"
            />
          </div>
          <div>
            <label className="block text-gray-700 font-medium mb-2">Company:</label>
            <input
              name="company"
              required
              disabled={isGenerating}
              className="w-full border border-gray-300 rounded-md p-2 text-black bg-white focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:bg-gray-100 disabled:cursor-not-allowed"
            />
          </div>
          <div>
            <label className="block text-gray-700 font-medium mb-2">Role:</label>
            <input
              name="role"
              required
              disabled={isGenerating}
              className="w-full border border-gray-300 rounded-md p-2 text-black bg-white focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:bg-gray-100 disabled:cursor-not-allowed"
            />
          </div>

          {(isGenerating || progress) && (
            <div className="rounded-lg border border-blue-100 bg-blue-50 p-4 space-y-4">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium text-blue-900">
                  {progress?.label ?? 'Generating resume…'}
                </span>
                <span className="text-blue-700 tabular-nums">{progress?.percent ?? 0}%</span>
              </div>

              <div className="h-2 w-full rounded-full bg-blue-200 overflow-hidden">
                <div
                  className="h-full rounded-full bg-blue-600 transition-all duration-500 ease-out"
                  style={{ width: `${progress?.percent ?? 0}%` }}
                />
              </div>

              <ol className="flex justify-between gap-1">
                {STEPS.map((step, idx) => {
                  const isActive = idx === currentStepIdx;
                  const isDone = currentStepIdx > idx || progress?.step === 'complete';
                  return (
                    <li key={step.id} className="flex flex-col items-center flex-1 min-w-0">
                      <span
                        className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold shrink-0 ${
                          isDone
                            ? 'bg-blue-600 text-white'
                            : isActive
                              ? 'bg-blue-600 text-white ring-2 ring-blue-300 ring-offset-1'
                              : 'bg-gray-200 text-gray-500'
                        }`}
                      >
                        {isDone && !isActive ? '✓' : idx + 1}
                      </span>
                      <span
                        className={`mt-1 text-[10px] text-center leading-tight truncate w-full ${
                          isActive || isDone ? 'text-blue-800 font-medium' : 'text-gray-400'
                        }`}
                      >
                        {step.label}
                      </span>
                    </li>
                  );
                })}
              </ol>
            </div>
          )}

          <button
            type="submit"
            disabled={isGenerating}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 disabled:cursor-not-allowed text-white font-semibold py-2 px-4 rounded-md shadow transition-colors duration-200"
          >
            {isGenerating ? 'Generating…' : 'Generate PDF'}
          </button>
        </form>
      </div>
    </main>
  );
}
