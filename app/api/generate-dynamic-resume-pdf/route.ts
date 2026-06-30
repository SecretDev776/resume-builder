import { NextRequest } from 'next/server';
import { OpenAI } from 'openai';
import { getProfileByName } from '@/app/data/baseResumes';
import { getResumeTheme } from '@/app/data/resumeThemes';
import { buildResumePrompt } from '@/app/lib/resumePrompt';
import { renderResumePdf } from '@/app/lib/renderResumePdf';

type ProgressEvent =
  | { type: 'progress'; step: string; label: string; percent: number }
  | { type: 'complete'; filename: string; pdf: string; percent: number }
  | { type: 'error'; message: string; details?: string; step?: string };

function sseLine(event: ProgressEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

export async function POST(req: NextRequest) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: ProgressEvent) => {
        controller.enqueue(encoder.encode(sseLine(event)));
      };

      let currentStep = 'validating';

      const sendError = (message: string, details?: string) => {
        send({ type: 'error', message, details, step: currentStep });
      };

      try {
        send({ type: 'progress', step: 'validating', label: 'Validating input…', percent: 5 });

        const formData = await req.formData();
        const jobDescription = formData.get('job_description') as string;
        const company = formData.get('company') as string;
        const role = formData.get('role') as string;
        const baseResumeProfile = formData.get('base_resume_profile') as string | null;

        if (!jobDescription || !company || !role) {
          sendError('Missing required fields: job description, company, and role.');
          controller.close();
          return;
        }

        if (!process.env.OPENAI_API_KEY) {
          sendError('OpenAI API key not configured. Add OPENAI_API_KEY to your .env file.');
          controller.close();
          return;
        }

        currentStep = 'preparing';
        send({ type: 'progress', step: 'preparing', label: 'Loading resume profile…', percent: 15 });

        const profile = getProfileByName(baseResumeProfile);
        const baseResume: string = profile?.resumeText ?? '';
        const theme = getResumeTheme(profile?.themeId);

        currentStep = 'generating';
        send({ type: 'progress', step: 'generating', label: 'Generating tailored resume with AI…', percent: 25 });

        const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
        const prompt = buildResumePrompt(baseResume, jobDescription);

        const completion = await openai.chat.completions.create({
          model: process.env.OPENAI_VERSION || 'gpt-3.5-turbo',
          messages: [
            { role: 'system', content: 'You are a helpful assistant for creating professional resume content.' },
            { role: 'user', content: prompt },
          ],
          max_completion_tokens: 8000,
        });

        const tailoredResume = completion.choices[0].message.content || '';

        console.log('=== TOKEN USAGE ===');
        console.log('Prompt Tokens:', completion.usage?.prompt_tokens);
        console.log('Completion Tokens:', completion.usage?.completion_tokens);
        console.log('Total Tokens:', completion.usage?.total_tokens);

        if (!tailoredResume) {
          sendError('Failed to generate tailored resume content. The AI returned an empty response.');
          controller.close();
          return;
        }

        currentStep = 'pdf';
        send({ type: 'progress', step: 'pdf', label: 'Building PDF…', percent: 80 });

        const pdfBytes = await renderResumePdf(tailoredResume, theme);

        const fileBase = `${(baseResumeProfile && baseResumeProfile.replace(/[^a-zA-Z0-9_]/g, '_'))}_${company.replace(/[^a-zA-Z0-9_]/g, '_')}_${role.replace(/[^a-zA-Z0-9_]/g, '_')}`;

        send({
          type: 'complete',
          filename: `${fileBase}.pdf`,
          pdf: Buffer.from(pdfBytes).toString('base64'),
          percent: 100,
        });
        controller.close();
      } catch (error) {
        sendError(
          error instanceof Error ? error.message : 'An unexpected error occurred.',
          error instanceof Error ? error.stack : undefined
        );
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}
