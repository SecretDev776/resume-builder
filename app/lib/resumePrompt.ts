const JOB_LINE_REGEX = / at .+:.+/;

/** Count employer entries between Experience: and Education: in the base resume. */
export function countExperienceCompanies(baseResume: string): number {
  const experienceMatch = baseResume.match(/^Experience:\s*$/im);
  if (!experienceMatch || experienceMatch.index === undefined) return 3;

  const afterExperience = baseResume.slice(experienceMatch.index + experienceMatch[0].length);
  const educationMatch = afterExperience.match(/^Education:\s*$/im);
  const experienceSection =
    educationMatch && educationMatch.index !== undefined
      ? afterExperience.slice(0, educationMatch.index)
      : afterExperience;

  const count = experienceSection
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && JOB_LINE_REGEX.test(line)).length;

  return count >= 4 ? 4 : 3;
}

function getExperiencePromptRules(companyCount: number) {
  if (companyCount >= 4) {
    return {
      companyCount: 4,
      inclusion: `- Always include exactly four companies in newest-to-oldest order.
- Use all four companies from the profile. Do not omit, merge, or return fewer than four companies even if older experience is less relevant.`,
      bullets: `- Exact bullet counts (hard requirement):
  • First company (most recent): exactly 8 bullet points
  • Second company: exactly 8 bullet points
  • Third company: exactly 6 bullet points
  • Fourth company (oldest): exactly 6 bullet points`,
      seniority: `- The most recent role must be a senior role.
- The second role must be mid-level only (not junior and not senior).
- The third role must not be junior or intern.
- Only the oldest (fourth) role may be junior; never use intern titles anywhere.
- If the oldest role lasted multiple years, use a junior engineer title rather than an intern title.`,
      tailoringOlderRoles:
        '- The older roles beyond the two most recent can use broader or less directly related tech stacks if that sounds more natural.',
      verification: `- Verify summary word count (60-80), bullet counts (8/8/6/6), four companies present, and header title matches first role title`,
    };
  }

  return {
    companyCount: 3,
    inclusion: `- Always include exactly three companies in newest-to-oldest order.
- Use all three companies from the profile. Do not omit, merge, or return fewer than three companies even if older experience is less relevant.`,
    bullets: `- Exact bullet counts (hard requirement):
  • First company (most recent): exactly 8 bullet points
  • Second company: exactly 8 bullet points
  • Third company (oldest): exactly 6 bullet points`,
    seniority: `- The most recent role must be a senior role.
- Only the oldest role may be junior; never use intern titles anywhere.
- The second role must be mid-level only (not junior and not senior).
- The second-oldest role must not be junior or intern.
- If the oldest role lasted multiple years, use a junior engineer title rather than an intern title.`,
    tailoringOlderRoles:
      '- The oldest two roles can use broader or less directly related tech stacks if that sounds more natural.',
    verification: `- Verify summary word count (60-80), bullet counts (8/8/6), three companies present, and header title matches first role title`,
  };
}

export function buildResumePrompt(baseResume: string, jobDescription: string) {
  const experienceRules = getExperiencePromptRules(countExperienceCompanies(baseResume));

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
${experienceRules.inclusion}
${experienceRules.bullets}

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
${experienceRules.seniority}
- Keep title seniority progression natural from newest to oldest.
- Treat Engineer as a higher generic title than Developer.
- Do not make an older role Engineer if a more recent role is only Developer, unless the older Engineer title is explicitly junior.
- Example progression (${experienceRules.companyCount} companies): ${
    experienceRules.companyCount >= 4
      ? 'Senior Software Engineer -> Software Engineer -> Software Engineer -> Junior Software Engineer'
      : 'Senior Software Engineer -> Software Engineer -> Junior Software Engineer'
  }
- The header job title (first line) and the first company job title must be exactly the same text. If you normalize one, normalize both.
- Use a common, natural senior engineer title for the CV headline (e.g. Senior Backend Engineer, Senior Software Engineer, Senior Full Stack Engineer). Do not mirror rare or niche JD titles. Do not use overly long titles.

TAILORING BALANCE
- Do not over-tailor the resume.
${experienceRules.tailoringOlderRoles}
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
${experienceRules.verification}

Output the complete tailored resume as plain text only, following the base resume's exact structure and formatting. Update content only; preserve the template layout. No markdown code fences, no HTML, and no extra explanation.
  `;
}
