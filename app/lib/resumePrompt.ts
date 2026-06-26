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
- Use all four companies from the profile. Never omit, merge, or return fewer than four companies even if older experience is less relevant.`,
      bullets: `- Exact bullet counts (strict requirement):
  • Company 1 (most recent): exactly 8 bullet points
  • Company 2: exactly 8 bullet points
  • Company 3: exactly 6 bullet points
  • Company 4 (oldest): exactly 6 bullet points`,
      metrics: `- Metrics rules (strict):
  • Company 1: exactly 2 modest metrics
  • Company 2: exactly 1 metric
  • Company 3 and 4: no metrics unless absolutely necessary
- Allowed metric style only:
  • reduced processing time by ~20–30%
  • improved reliability by ~15–25%
  • reduced manual effort
- No revenue figures. No inflated enterprise scale claims.`,
      seniority: `- Latest role = senior title (must match header exactly).
- Second and third roles = mid-level only (Engineer or Developer level, not senior, not junior).
- Oldest role = junior-level only (never intern).
- Progression must be natural: Senior → Mid → Mid → Junior.
- Do not over-normalize titles unnaturally.
- Treat Engineer as a higher generic title than Developer.
- Do not make an older role Engineer if a more recent role is only Developer, unless the older Engineer title is explicitly junior.
- Example progression: Senior Software Engineer → Software Engineer → Software Engineer → Junior Software Engineer`,
      tailoringOlderRoles:
        '- Older roles may use broader stacks naturally; do not keyword-stuff JD terms into every role.',
      verification: `- Verify summary word count (60–80), bullet counts (8/8/6/6), four companies present, metrics (2/1/0/0), and header title matches first role title exactly`,
    };
  }

  return {
    companyCount: 3,
    inclusion: `- Always include exactly three companies in newest-to-oldest order.
- Use all three companies from the profile. Never omit, merge, or return fewer than three companies even if older experience is less relevant.`,
    bullets: `- Exact bullet counts (strict requirement):
  • Company 1 (most recent): exactly 8 bullet points
  • Company 2: exactly 8 bullet points
  • Company 3 (oldest): exactly 6 bullet points`,
    metrics: `- Metrics rules (strict):
  • Company 1: exactly 2 modest metrics
  • Company 2: exactly 1 metric
  • Company 3: no metrics unless absolutely necessary
- Allowed metric style only:
  • reduced processing time by ~20–30%
  • improved reliability by ~15–25%
  • reduced manual effort
- No revenue figures. No inflated enterprise scale claims.`,
    seniority: `- Latest role = senior title (must match header exactly).
- Second role = mid-level only (Engineer or Developer level, not senior, not junior).
- Oldest role = junior-level only (never intern).
- Progression must be natural: Senior → Mid → Junior.
- Do not over-normalize titles unnaturally.
- Treat Engineer as a higher generic title than Developer.
- Example progression: Senior Software Engineer → Software Engineer → Junior Software Engineer`,
    tailoringOlderRoles:
      '- Older roles may use broader stacks naturally; do not keyword-stuff JD terms into every role.',
    verification: `- Verify summary word count (60–80), bullet counts (8/8/6), three companies present, metrics (2/1/0), and header title matches first role title exactly`,
  };
}

export function buildResumePrompt(baseResume: string, jobDescription: string) {
  const experienceRules = getExperiencePromptRules(countExperienceCompanies(baseResume));

  return `
You are a professional resume writer for software engineers.

Analyze the job description to identify industry, key skills, and responsibilities. Tailor the resume to match the role naturally, not aggressively.

Preserve all original company names and employment dates from the base resume. Keep the same section headers, section order, and plain-text layout as the base resume template. Update content only; do not add commentary outside the resume.

Here is the base resume:

${baseResume}

Here is the target job description:

${jobDescription}

CV TITLE
- Use a natural senior engineering title (NOT JD-styled).
- Preferred: Senior Software Engineer, Senior Backend Engineer, Senior Full Stack Engineer, Senior AI Engineer, or Senior Platform Engineer.
- Avoid overly niche or long titles.
- Header title MUST match the latest company title exactly. Never let the header title and the first company title differ.

SUMMARY
- 60–80 words total; count before finalizing and expand or trim until within range.
- 3–4 sentences.
- Must be natural, not keyword-stuffed.
- Must align with the JD tech stack and responsibilities.
- Must stay realistic and human-written.

SKILLS SECTION
- Exactly 4 categories (no more, no fewer).
- Each category must be one single line only.
- Each category must include 5–7 skills.
- No repetition of identical tools across categories.
- No keyword stuffing.
- Use appropriate grouping depending on role type (Backend, Full Stack, AI, DevOps, Data, or Frontend), but always exactly 4 categories.
- Use a single-column layout with bullet prefixes (•).
- Place Skills immediately after Summary and before Experience (match base resume section naming, e.g. "Technical Skills:").

PROFESSIONAL EXPERIENCE
${experienceRules.inclusion}
${experienceRules.bullets}

Writing rules for bullets — each bullet must:
- Be 22–30 words (natural variation allowed but must stay realistic).
- Describe real engineering work: build, design, implement, integrate, debug, deploy, optimize.
- Include technical implementation detail plus context.
- Avoid generic statements or buzzwords.
- Avoid standalone results; impact must be tied to action in the same bullet.
- Usually avoid numeric metrics except where the metrics rules below require them.
- Never be a short throwaway line such as a result without implementation context.
- Sound like a real memory of work, not generated text.

${experienceRules.metrics}

First bullet of Company 1 (most recent) ONLY must include:
- A platform or system description.
- Frontend + backend + infrastructure or deployment.
- Purpose of the system.

JOB TITLES AND SENIORITY
${experienceRules.seniority}
- Job titles may be slightly rewritten if needed, but keep progression believable.
- The header job title (first line) and the first company job title must be exactly the same text.

TECH STACK
- Use natural tech names only (React, Node.js, Python, AWS, .NET, etc.).
- Avoid version numbers unless necessary.
${experienceRules.tailoringOlderRoles}
- Do not copy exact tech stack version numbers from the JD unless truly necessary and believable.
- If the JD mentions a version, usually use the broader technology name in summary, skills, and experience bullets.
- Keep stack naming natural and human-written, not keyword-stuffed.

WRITING STYLE
- Human, practical, implementation-focused tone.
- No AI clichés or marketing language.
- Avoid words like: "cutting-edge", "robust", "seamless", "transformative", "synergy", "mission-critical", "world-class", "passionate", "rockstar".
- Use real engineering verbs: built, designed, integrated, refactored, deployed, optimized, migrated, debugged.
- Write in a classic, professional resume tone: clear, direct, and understated.
- No em dashes. Use commas, semicolons, "and", or simple hyphens.
- Vary phrasing between sections; avoid repeating openers like "Worked on" or "Responsible for".
- Do not make the job title too similar to the JD when the JD wording is rare or unusually specific; normalize first.

FINAL GOAL
The final resume must:
- Be realistic and believable.
- Match the job description naturally (not aggressively keyword-matched).
- Sound human-written by an experienced engineer.
- Maintain consistent structure and strict formatting rules.
- Avoid AI-like repetition or templated phrasing.
- Focus on real engineering work, platforms, and technologies.

Before outputting:
- Smooth transitions between bullets within each job.
- Reduce redundancy across jobs.
- Re-read aloud for natural flow.
${experienceRules.verification}

Output the complete tailored resume as plain text only, following the base resume's exact structure and formatting. Update content only; preserve the template layout. No markdown code fences, no HTML, and no extra explanation.
  `;
}
