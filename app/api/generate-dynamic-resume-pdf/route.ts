import { NextRequest, NextResponse } from 'next/server';
import { OpenAI } from 'openai';
import { getProfileByName } from '@/app/data/baseResumes';
import { getResumeTheme } from '@/app/data/resumeThemes';
import { renderResumePdf } from '@/app/lib/renderResumePdf';

function buildPrompt(baseResume: string, jobDescription: string) {
  return `
You are a professional resume writer for software engineers.

Analyze the job description to identify industry, key skills, and responsibilities. Tailor the resume to strongly match the role.

Preserve all original company names and employment dates from the base resume. Keep the same section headers, section order, and plain-text layout as the base resume template. Update content only; do not add commentary outside the resume.

Here is the base resume:

${baseResume}

Here is the target job description:

${jobDescription}

SKILLS SECTION
- The skills section must contain 4-5 categories.
- Each category must be one line only.
- Use a single-column layout with bullet prefixes (•).
- Skills and technologies must match the job description.
- Place Skills immediately after Summary and before Experience (match base resume section naming, e.g. "Technical Skills:").

SUMMARY
- Keep the summary short and concise; it must align with the job description and technical stack.
- Summary must be 60-80 words. Count before finalizing and expand or trim until within range.
- Use 3-4 full sentences, not a short 1-2 sentence stub.

PROFESSIONAL EXPERIENCE
- Always include exactly three companies in newest-to-oldest order.
- Use all three companies from the profile. Do not omit, merge, or return fewer than three companies even if older experience is less relevant.
- Exact bullet counts (hard requirement):
  • First company (most recent): exactly 8 bullet points
  • Second company: exactly 8 bullet points
  • Third company (oldest): exactly 6 bullet points

Each bullet point must:
- Be detailed and grounded in real hands-on experience
- Describe a specific responsibility, project, technical implementation, or outcome
- Avoid generic or vague statements
- Sound natural and human-written, not AI-generated
- Avoid mentioning specific numeric metrics
- Usually be 22-30 words long
- Never be a short throwaway line such as a result without implementation context
- If a result is mentioned, keep it in the same bullet as the technical work that caused it
- Balance technical skills used, projects or systems built, and results, improvements, or impact

First bullet of the first (most recent) company must:
- Clearly mention the platform or system used (preferably from the JD; otherwise the most relevant match)
- Explain how the platform was built or used, including frontend technology, backend technology, infrastructure or deployment platform, and the purpose or mission of the system

JOB TITLES AND SENIORITY
- Experience descriptions must feel personal, practical, and implementation-focused.
- Job titles may be slightly rewritten if needed.
- The most recent role must be a senior role.
- Only the oldest role may be junior; never use intern titles anywhere.
- The second role must be mid-level only (not junior and not senior).
- The second-oldest role must not be junior or intern.
- If the oldest role lasted multiple years, use a junior engineer title rather than an intern title.
- Keep title seniority progression natural from newest to oldest.
- Treat Engineer as a higher generic title than Developer.
- Do not make an older role Engineer if a more recent role is only Developer, unless the older Engineer title is explicitly junior.
- Example progression: Senior Software Engineer -> Software Engineer -> Junior Software Engineer
- The header job title (first line) and the first company job title must be exactly the same text. If you normalize one, normalize both.
- Use a common, natural senior engineer title for the CV headline (e.g. Senior Backend Engineer, Senior Software Engineer, Senior Full Stack Engineer). Do not mirror rare or niche JD titles. Do not use overly long titles.

TAILORING BALANCE
- Do not over-tailor the resume.
- The oldest two roles can use broader or less directly related tech stacks if that sounds more natural.
- Do not make the job title too similar to the JD when the JD wording is rare or unusually specific; normalize first.
- Never let the header title and the first company title differ.
- Make everything sound natural, believable, and human-written instead of aggressively tailored.

TECH STACK NAMING
- Do not copy exact tech stack version numbers from the JD unless truly necessary and believable.
- Prefer natural technology names (PHP, Laravel, .NET, React, AWS, Kubernetes, TypeScript, Node.js, Python) over versions.
- If the JD mentions a version, usually use the broader technology name in summary, skills, and experience bullets.
- Keep stack naming natural and human-written, not keyword-stuffed.

STYLE
- Write in a classic, professional resume tone: clear, direct, and understated.
- Avoid flashy, promotional, or superlative language (e.g. "world-class," "cutting-edge," "passionate," "rockstar").
- No em dashes. Use commas, semicolons, "and", or simple hyphens.
- Vary phrasing between sections; avoid repeating openers like "Worked on" or "Responsible for".
- Use plain professional phrasing; do not sound salesy or overly enthusiastic.

OVERALL GOAL
The final resume must:
- Be tailored to the job description without sounding overfitted to the posting language
- Sound authentic and human-written
- Focus on real engineering work, platforms, and technologies
- Avoid anything that looks AI-generated or generic
- Show rich experience in a real developer's tone while staying believable for the candidate's background

Before outputting:
- Smooth transitions between bullets within each job
- Reduce redundancy across jobs
- Re-read aloud for natural flow
- Verify summary word count (60-80), bullet counts (8/8/6), three companies present, and header title matches first role title

Output the complete tailored resume as plain text only, following the base resume's exact structure and formatting. Update content only; preserve the template layout. No markdown code fences, no HTML, and no extra explanation.
  `;
}

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
    const prompt = buildPrompt(baseResume, jobDescription);

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
