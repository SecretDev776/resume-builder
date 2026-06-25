import { NextRequest, NextResponse } from 'next/server';
import { OpenAI } from 'openai';
import { getProfileByName } from '@/app/data/baseResumes';
import { getResumeTheme } from '@/app/data/resumeThemes';
import { buildResumePrompt } from '@/app/lib/resumePrompt';
import { renderResumePdf } from '@/app/lib/renderResumePdf';

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const jobDescription = formData.get('job_description') as string;
    const company = formData.get('company') as string;
    const role = formData.get('role') as string;
    const baseResumeProfile = formData.get('base_resume_profile') as string | null;

    if (!jobDescription || !company || !role) {
      return new NextResponse(
        JSON.stringify({ error: 'Missing required fields: job_description, company, role' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (!process.env.OPENAI_API_KEY) {
      return new NextResponse(
        JSON.stringify({ error: 'OpenAI API key not configured' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const profile = getProfileByName(baseResumeProfile);
    const baseResume: string = profile?.resumeText ?? '';
    const theme = getResumeTheme(profile?.themeId);

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const prompt = buildResumePrompt(baseResume, jobDescription);

    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_VERSION || 'gpt-3.5-turbo',
      messages: [
        { role: 'system', content: 'You are a helpful assistant for creating professional resume content.' },
        { role: 'user', content: prompt }
      ],
      max_completion_tokens: 8000
    });

    const tailoredResume = completion.choices[0].message.content || '';

    console.log("=== TOKEN USAGE ===");
    console.log("Prompt Tokens:", completion.usage?.prompt_tokens);
    console.log("Completion Tokens:", completion.usage?.completion_tokens);
    console.log("Total Tokens:", completion.usage?.total_tokens);

    if (!tailoredResume) {
      return new NextResponse(
        JSON.stringify({ error: 'Failed to generate tailored resume content' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const pdfBytes = await renderResumePdf(tailoredResume, theme);

    const fileBase = `${(baseResumeProfile && baseResumeProfile.replace(/[^a-zA-Z0-9_]/g, '_'))}_${company.replace(/[^a-zA-Z0-9_]/g, '_')}_${role.replace(/[^a-zA-Z0-9_]/g, '_')}`;
    return new NextResponse(Buffer.from(pdfBytes), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${fileBase}.pdf"`
      }
    });
  } catch (error) {
    return new NextResponse(
      JSON.stringify({
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error'
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
