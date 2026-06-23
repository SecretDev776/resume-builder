import {
  PDFDocument,
  StandardFonts,
  PDFFont,
  PDFPage,
  RGB,
} from 'pdf-lib';
import {
  formatDisplayName,
  ResumeTheme,
  themeToRgb,
} from '@/app/data/resumeThemes';

const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;
const TOP_STRIPE_HEIGHT = 22;

function parseResume(resumeText: string) {
  const rawLines = resumeText.split('\n');
  const trimmedLines = rawLines.map((l) => l.trim());

  const sectionHeaderRegex = /^(summary|technical skills|experience|education)\s*:\s*$/i;
  const bodyStartIdx = trimmedLines.findIndex((l) => sectionHeaderRegex.test(l));

  const headerLines = (bodyStartIdx >= 0 ? rawLines.slice(0, bodyStartIdx) : rawLines)
    .map((l) => l.trim())
    .filter(Boolean);

  const headline = headerLines[0] ?? '';
  const name = headerLines[1] ?? '';

  const emailRegex = /\S+@\S+\.\S+/;
  const phoneRegex = /(\+?\d[\d\s()-]{6,}\d)|(\(\d{3}\)\s*\d{3}-\d{4})/;

  const email = headerLines.find((l) => emailRegex.test(l)) ?? '';
  const phone = headerLines.find((l) => phoneRegex.test(l)) ?? '';

  const location =
    headerLines.find(
      (l) =>
        l.includes(',') &&
        !emailRegex.test(l) &&
        !phoneRegex.test(l) &&
        !sectionHeaderRegex.test(l)
    ) ?? '';

  const body = bodyStartIdx >= 0 ? rawLines.slice(bodyStartIdx).join('\n') : rawLines.join('\n');
  return { headline, name, email, phone, location, body };
}

function formatDate(dateStr: string): string {
  const monthNames = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
  ];

  if (dateStr.includes('–') || dateStr.includes('-')) {
    const parts = dateStr.split(/[–-]/).map((part) => part.trim());
    return parts
      .map((part) => {
        if (part.match(/^\d{2}\/\d{4}$/)) {
          const [month, year] = part.split('/');
          return `${monthNames[parseInt(month, 10) - 1]} ${year}`;
        }
        return part;
      })
      .join(' – ');
  }
  if (dateStr.match(/^\d{2}\/\d{4}$/)) {
    const [month, year] = dateStr.split('/');
    return `${monthNames[parseInt(month, 10) - 1]} ${year}`;
  }
  return dateStr;
}

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number) {
  const words = text.split(' ');
  const lines: string[] = [];
  let currentLine = '';
  for (let i = 0; i < words.length; i++) {
    const testLine = currentLine ? `${currentLine} ${words[i]}` : words[i];
    if (font.widthOfTextAtSize(testLine, size) > maxWidth && currentLine) {
      lines.push(currentLine);
      currentLine = words[i];
    } else {
      currentLine = testLine;
    }
  }
  if (currentLine) lines.push(currentLine);
  return lines;
}

function drawTextWithBold(
  page: PDFPage,
  text: string,
  x: number,
  y: number,
  font: PDFFont,
  fontBold: PDFFont,
  size: number,
  color: RGB
) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  let offsetX = x;
  for (const part of parts) {
    if (part.startsWith('**') && part.endsWith('**')) {
      const content = part.slice(2, -2);
      page.drawText(content, { x: offsetX, y, size, font: fontBold, color });
      offsetX += fontBold.widthOfTextAtSize(content, size);
    } else {
      page.drawText(part, { x: offsetX, y, size, font, color });
      offsetX += font.widthOfTextAtSize(part, size);
    }
  }
}

function headerTextX(
  line: string,
  textFont: PDFFont,
  size: number,
  layout: ResumeTheme['headerLayout'],
  pageWidth: number,
  leftMargin: number
): number {
  if (layout === 'left') return leftMargin;
  return (pageWidth - textFont.widthOfTextAtSize(line, size)) / 2;
}

async function embedFonts(pdfDoc: PDFDocument, family: ResumeTheme['fontFamily']) {
  if (family === 'times') {
    return {
      font: await pdfDoc.embedFont(StandardFonts.TimesRoman),
      fontBold: await pdfDoc.embedFont(StandardFonts.TimesRomanBold),
    };
  }
  if (family === 'courier') {
    return {
      font: await pdfDoc.embedFont(StandardFonts.Courier),
      fontBold: await pdfDoc.embedFont(StandardFonts.CourierBold),
    };
  }
  return {
    font: await pdfDoc.embedFont(StandardFonts.Helvetica),
    fontBold: await pdfDoc.embedFont(StandardFonts.HelveticaBold),
  };
}

type Colors = {
  heading: RGB;
  body: RGB;
  mediumGray: RGB;
  accent: RGB;
  headerBg: RGB;
  leftRule: RGB;
  onAccent: RGB;
};

export async function renderResumePdf(resumeText: string, theme: ResumeTheme): Promise<Uint8Array> {
  const parsed = parseResume(resumeText);
  const pdfDoc = await PDFDocument.create();
  const { font, fontBold } = await embedFonts(pdfDoc, theme.fontFamily);

  const colors: Colors = {
    heading: themeToRgb(theme.heading),
    body: themeToRgb(theme.body),
    mediumGray: themeToRgb(theme.mediumGray),
    accent: themeToRgb(theme.accent),
    headerBg: themeToRgb(theme.headerBg),
    leftRule: themeToRgb(theme.leftRule),
    onAccent: themeToRgb(theme.onAccent),
  };

  const marginTop =
    theme.template === 'bold-band'
      ? theme.marginTop
      : theme.template === 'top-stripe'
        ? theme.marginTop
        : theme.marginTop;

  const left = theme.marginLeft;
  const right = PAGE_WIDTH - theme.marginRight;
  const contentWidth = right - left;
  const bodyIndent = theme.template === 'modern' ? 14 : 10;
  const bulletIndent = theme.template === 'modern' ? 26 : 20;
  /** Mirror left bodyIndent so text does not run flush to the right margin. */
  const contentRight = right - bodyIndent;
  const bodyTextX = left + bodyIndent;
  const bodyMaxWidth = contentRight - bodyTextX;
  const bulletTextX = left + bulletIndent;
  const bulletMaxWidth = contentRight - bulletTextX;

  const NAME_SIZE = theme.nameSize;
  const HEADLINE_SIZE = theme.headlineSize;
  const CONTACT_SIZE = theme.contactSize;
  const SECTION_HEADER_SIZE = theme.sectionHeaderSize;
  const BODY_SIZE = theme.bodySize;

  const NAME_LINE_HEIGHT = NAME_SIZE * 0.85;
  const HEADLINE_LINE_HEIGHT = HEADLINE_SIZE * 1.35;
  const CONTACT_LINE_HEIGHT = CONTACT_SIZE * 1.5;
  const SECTION_LINE_HEIGHT = SECTION_HEADER_SIZE * 1.45;
  const BODY_LINE_HEIGHT = BODY_SIZE * 1.4;

  let page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = PAGE_HEIGHT - marginTop;

  const useBandHeader = theme.template === 'bold-band';
  /** onAccent is only for text drawn on accent-colored fills (bands, pills). */
  const bandTextColor = colors.onAccent;
  const headerNameColor = useBandHeader ? bandTextColor : colors.heading;
  const headerHeadlineColor =
    useBandHeader ? bandTextColor : theme.template === 'professional' ? colors.mediumGray : colors.accent;

  const drawPageChrome = (targetPage: PDFPage) => {
    if (theme.template === 'top-stripe') {
      targetPage.drawRectangle({
        x: 0,
        y: PAGE_HEIGHT - TOP_STRIPE_HEIGHT,
        width: PAGE_WIDTH,
        height: TOP_STRIPE_HEIGHT,
        color: colors.accent,
      });
    }
    if (theme.showLeftRule) {
      targetPage.drawLine({
        start: { x: 0, y: 0 },
        end: { x: 0, y: PAGE_HEIGHT },
        thickness: theme.leftRuleThickness,
        color: colors.leftRule,
      });
    }
  };

  const newPage = () => {
    page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    drawPageChrome(page);
    y = PAGE_HEIGHT - marginTop;
  };

  const ensureSpace = (needed: number) => {
    if (y - needed < theme.marginBottom) newPage();
  };

  const drawSectionHeader = (sectionHeader: string) => {
    const displayHeader =
      theme.template === 'minimal'
        ? sectionHeader.toUpperCase()
        : theme.template === 'professional'
          ? sectionHeader.toUpperCase()
          : sectionHeader;
    const sectionLines = wrapText(displayHeader, fontBold, SECTION_HEADER_SIZE, bodyMaxWidth - 14);
    const sectionX =
      theme.template === 'professional' ? left : left + (theme.template === 'executive' ? 0 : 10);

    for (const sectionLine of sectionLines) {
      ensureSpace(SECTION_HEADER_SIZE + 14);

      if (theme.template === 'professional') {
        page.drawText(sectionLine, {
          x: sectionX,
          y,
          size: SECTION_HEADER_SIZE,
          font: fontBold,
          color: colors.heading,
        });
        y -= 4;
        page.drawLine({
          start: { x: left, y },
          end: { x: contentRight, y },
          thickness: theme.accentUnderlineThickness,
          color: colors.mediumGray,
        });
      } else if (theme.template === 'classic') {
        page.drawRectangle({
          x: left + 2,
          y: y - 4,
          width: Math.max(120, contentWidth - 4),
          height: SECTION_HEADER_SIZE + 4,
          color: colors.headerBg,
        });
        page.drawText(sectionLine, {
          x: sectionX,
          y,
          size: SECTION_HEADER_SIZE,
          font: fontBold,
          color: colors.heading,
        });
        y -= 4;
        const textWidth = fontBold.widthOfTextAtSize(sectionLine, SECTION_HEADER_SIZE);
        page.drawLine({
          start: { x: sectionX, y },
          end: { x: Math.min(sectionX + textWidth, contentRight), y },
          thickness: theme.accentUnderlineThickness,
          color: colors.accent,
        });
      } else if (theme.template === 'sidebar-accent' || theme.template === 'modern') {
        const barWidth = theme.template === 'sidebar-accent' ? 7 : 5;
        page.drawRectangle({
          x: left,
          y: y - 3,
          width: barWidth,
          height: SECTION_HEADER_SIZE + 6,
          color: colors.accent,
        });
        page.drawText(sectionLine, {
          x: left + barWidth + 8,
          y,
          size: SECTION_HEADER_SIZE,
          font: fontBold,
          color: colors.heading,
        });
        page.drawLine({
          start: { x: left + barWidth + 8, y: y - 6 },
          end: { x: contentRight, y: y - 6 },
          thickness: theme.template === 'sidebar-accent' ? 1 : 0.5,
          color: theme.template === 'sidebar-accent' ? colors.accent : colors.mediumGray,
        });
      } else if (theme.template === 'top-stripe') {
        const pillPad = 8;
        const textWidth = fontBold.widthOfTextAtSize(sectionLine, SECTION_HEADER_SIZE);
        page.drawRectangle({
          x: left,
          y: y - 4,
          width: textWidth + pillPad * 2,
          height: SECTION_HEADER_SIZE + 8,
          color: colors.accent,
        });
        page.drawText(sectionLine, {
          x: left + pillPad,
          y,
          size: SECTION_HEADER_SIZE,
          font: fontBold,
          color: bandTextColor,
        });
      } else if (theme.template === 'executive') {
        page.drawText(sectionLine, {
          x: sectionX,
          y,
          size: SECTION_HEADER_SIZE,
          font: fontBold,
          color: colors.accent,
        });
        y -= 3;
        page.drawLine({
          start: { x: left, y },
          end: { x: contentRight, y },
          thickness: theme.accentUnderlineThickness,
          color: colors.accent,
        });
        page.drawLine({
          start: { x: left, y: y - 3 },
          end: { x: contentRight, y: y - 3 },
          thickness: 0.5,
          color: colors.mediumGray,
        });
      } else if (theme.template === 'minimal') {
        page.drawText(sectionLine, {
          x: left,
          y,
          size: SECTION_HEADER_SIZE,
          font: fontBold,
          color: colors.heading,
        });
        y -= 2;
        page.drawLine({
          start: { x: left, y },
          end: { x: contentRight, y },
          thickness: theme.accentUnderlineThickness,
          color: colors.accent,
        });
      } else if (theme.template === 'bold-band') {
        page.drawText(sectionLine, {
          x: left,
          y,
          size: SECTION_HEADER_SIZE,
          font: fontBold,
          color: colors.accent,
        });
        const tw = fontBold.widthOfTextAtSize(sectionLine, SECTION_HEADER_SIZE);
        page.drawLine({
          start: { x: left, y: y - 4 },
          end: { x: left + tw + 40, y: y - 4 },
          thickness: 2,
          color: colors.accent,
        });
      }

      y -= SECTION_LINE_HEIGHT;
    }
    y -= theme.template === 'minimal' || theme.template === 'professional' ? 6 : 8;
  };

  const drawBullet = (bulletText: string) => {
    const wrappedLines = wrapText(bulletText, font, BODY_SIZE, bulletMaxWidth);
    ensureSpace(BODY_LINE_HEIGHT * Math.max(1, wrappedLines.length));

    const bulletColor = theme.template === 'professional' ? colors.body : colors.accent;
    page.drawText(theme.bulletChar, {
      x: left + bodyIndent,
      y,
      size: BODY_SIZE + (theme.bulletChar === '›' ? 3 : 1),
      font: fontBold,
      color: bulletColor,
    });

    let bulletY = y;
    for (const wrappedLine of wrappedLines) {
      drawTextWithBold(
        page,
        wrappedLine,
        bulletTextX,
        bulletY,
        font,
        fontBold,
        BODY_SIZE,
        colors.body
      );
      bulletY -= BODY_LINE_HEIGHT;
      if (bulletY < theme.marginBottom) {
        newPage();
        bulletY = PAGE_HEIGHT - marginTop;
      }
    }
    y = bulletY - 2;
  };

  drawPageChrome(page);

  const bandHeight = useBandHeader ? theme.headerBandHeight : 0;
  if (useBandHeader) {
    page.drawRectangle({
      x: 0,
      y: PAGE_HEIGHT - bandHeight,
      width: PAGE_WIDTH,
      height: bandHeight,
      color: colors.accent,
    });
  }

  const displayName = formatDisplayName(parsed.name, theme.nameCase);
  const nameLines = displayName
    ? wrapText(displayName, fontBold, NAME_SIZE, contentWidth)
    : [];
  const headlineLines = parsed.headline
    ? wrapText(parsed.headline, fontBold, HEADLINE_SIZE, contentWidth)
    : [];
  const contactParts = [parsed.location, parsed.phone, parsed.email].filter(Boolean);
  const contactLine = contactParts.join(theme.contactSeparator);
  const contactLines = contactLine
    ? wrapText(contactLine, font, CONTACT_SIZE, contentWidth)
    : [];

  if (theme.showHeaderCard && !useBandHeader) {
    const headerStartY = PAGE_HEIGHT - marginTop;
    const contactHeight =
      contactLines.length * CONTACT_LINE_HEIGHT + (contactLines.length > 0 ? 4 : 0);
    const yAfterName =
      headerStartY -
      nameLines.length * NAME_LINE_HEIGHT -
      2 -
      (headlineLines.length > 0 ? headlineLines.length * HEADLINE_LINE_HEIGHT + 2 : 0);
    const yBeforeRule = yAfterName - contactHeight;
    page.drawRectangle({
      x: left - 2,
      y: yBeforeRule,
      width: contentWidth + 4,
      height: headerStartY + 30 - yBeforeRule,
      color: colors.headerBg,
    });
  }

  if (useBandHeader) {
    y = PAGE_HEIGHT - bandHeight + bandHeight - 34;
    for (const line of nameLines) {
      const x = headerTextX(line, fontBold, NAME_SIZE, theme.headerLayout, PAGE_WIDTH, left);
      page.drawText(line, { x, y, size: NAME_SIZE, font: fontBold, color: headerNameColor });
      y -= NAME_LINE_HEIGHT;
    }
    if (headlineLines.length > 0) {
      y -= 2;
      for (const line of headlineLines) {
        const x = headerTextX(line, fontBold, HEADLINE_SIZE, theme.headerLayout, PAGE_WIDTH, left);
        page.drawText(line, { x, y, size: HEADLINE_SIZE, font: fontBold, color: headerHeadlineColor });
        y -= HEADLINE_LINE_HEIGHT;
      }
    }
    y = PAGE_HEIGHT - bandHeight - 14;
  } else {
    y = PAGE_HEIGHT - marginTop;
    for (const line of nameLines) {
      const x = headerTextX(line, fontBold, NAME_SIZE, theme.headerLayout, PAGE_WIDTH, left);
      page.drawText(line, { x, y, size: NAME_SIZE, font: fontBold, color: headerNameColor });
      y -= NAME_LINE_HEIGHT;
    }
    if (headlineLines.length > 0) {
      y -= 4;
      for (const line of headlineLines) {
        const x = headerTextX(line, fontBold, HEADLINE_SIZE, theme.headerLayout, PAGE_WIDTH, left);
        page.drawText(line, { x, y, size: HEADLINE_SIZE, font: fontBold, color: headerHeadlineColor });
        y -= HEADLINE_LINE_HEIGHT;
      }
    }
  }

  if (contactLines.length > 0) {
    y -= 4;
    const contactColor = colors.heading;
    for (const line of contactLines) {
      const x = headerTextX(line, font, CONTACT_SIZE, theme.headerLayout, PAGE_WIDTH, left);
      page.drawText(line, { x, y, size: CONTACT_SIZE, font, color: contactColor });
      y -= CONTACT_LINE_HEIGHT;
    }
  }

  if (theme.showHeaderRule && !useBandHeader) {
    y -= 6;
    const ruleColor = theme.template === 'professional' ? colors.mediumGray : colors.accent;
    page.drawLine({
      start: { x: left, y },
      end: { x: contentRight, y },
      thickness: theme.template === 'executive' ? 1 : theme.template === 'professional' ? 0.75 : 1.25,
      color: ruleColor,
    });
    if (theme.template === 'executive') {
      y -= 4;
      page.drawLine({
        start: { x: left, y },
        end: { x: contentRight, y },
        thickness: 0.75,
        color: colors.mediumGray,
      });
    }
  }

  y -= useBandHeader ? 20 : 16;

  const bodyLines = parsed.body.split('\n');
  let inSkillsSection = false;
  let firstJob = true;

  for (let i = 0; i < bodyLines.length; i++) {
    const line = bodyLines[i].trim();
    if (!line) {
      y -= theme.template === 'minimal' ? 4 : 6;
      continue;
    }

    if (line.endsWith(':')) {
      y -= 10;
      drawSectionHeader(line.slice(0, -1));
      inSkillsSection =
        line.toLowerCase() === 'technical skills:' || line.toLowerCase() === 'skills:';
      continue;
    }

    const isJobExperience = / at .+:.+/.test(line);
    if (isJobExperience) {
      const match = line.match(/^(.+?) at (.+?):\s*(.+)$/);
      if (match) {
        const [, jobTitle, companyName, period] = match;
        if (!firstJob) y -= 10;
        firstJob = false;

        const titleColor =
          theme.template === 'bold-band' ? colors.accent : colors.heading;
        const titleLines = wrapText(jobTitle.trim(), fontBold, BODY_SIZE + 1, bodyMaxWidth);
        for (const titleLine of titleLines) {
          ensureSpace(BODY_LINE_HEIGHT + 4);
          page.drawText(titleLine, {
            x: bodyTextX,
            y,
            size: BODY_SIZE + 1,
            font: fontBold,
            color: titleColor,
          });
          y -= BODY_LINE_HEIGHT + 2;
        }

        const periodText = formatDate(period.trim());
        const periodWidth = font.widthOfTextAtSize(periodText, BODY_SIZE);
        const periodX = contentRight - periodWidth;
        const companyX = bodyTextX;
        const companyMaxWidth = Math.max(50, periodX - companyX - 12);
        const companyLines = wrapText(companyName.trim(), font, BODY_SIZE, companyMaxWidth);

        ensureSpace(BODY_LINE_HEIGHT);
        if (companyLines.length > 0) {
          page.drawText(companyLines[0], {
            x: companyX,
            y,
            size: BODY_SIZE,
            font,
            color: colors.mediumGray,
          });
          page.drawText(periodText, {
            x: periodX,
            y,
            size: BODY_SIZE,
            font,
            color: colors.mediumGray,
          });
          y -= BODY_LINE_HEIGHT;
          for (let ci = 1; ci < companyLines.length; ci++) {
            ensureSpace(BODY_LINE_HEIGHT);
            page.drawText(companyLines[ci], {
              x: companyX,
              y,
              size: BODY_SIZE,
              font,
              color: colors.mediumGray,
            });
            y -= BODY_LINE_HEIGHT;
          }
        } else {
          page.drawText(periodText, {
            x: periodX,
            y,
            size: BODY_SIZE,
            font,
            color: colors.mediumGray,
          });
          y -= BODY_LINE_HEIGHT;
        }
        y -= 4;
      }
      continue;
    }

    const isSkillsCategory = inSkillsSection && /^[•·]\s*[^:]+:\s+/.test(line);
    if (isSkillsCategory) {
      const content = line.replace(/^[•·]\s*/, '');
      const idx = content.indexOf(':');
      const categoryLabel = idx >= 0 ? content.slice(0, idx).trim() : content.trim();
      const categoryItems = idx >= 0 ? content.slice(idx + 1).trim() : '';
      const labelX = bodyTextX;
      const labelWidth = fontBold.widthOfTextAtSize(categoryLabel, BODY_SIZE + 1);
      const itemsX = labelX + labelWidth + 8;
      const itemsMaxWidth = Math.max(50, contentRight - itemsX);

      ensureSpace(BODY_LINE_HEIGHT);
      page.drawText(categoryLabel, {
        x: labelX,
        y,
        size: BODY_SIZE + 1,
        font: fontBold,
        color: colors.heading,
      });

      const itemsLines = categoryItems
        ? wrapText(categoryItems, font, BODY_SIZE, itemsMaxWidth)
        : [];
      let cursorY = y;
      for (const itemsLine of itemsLines) {
        if (cursorY < theme.marginBottom) {
          newPage();
          cursorY = y;
          page.drawText(categoryLabel, {
            x: labelX,
            y: cursorY,
            size: BODY_SIZE + 1,
            font: fontBold,
            color: colors.heading,
          });
        }
        page.drawText(itemsLine, {
          x: itemsX,
          y: cursorY,
          size: BODY_SIZE,
          font,
          color: colors.mediumGray,
        });
        cursorY -= BODY_LINE_HEIGHT;
      }
      y = (itemsLines.length > 0 ? cursorY : y) - BODY_LINE_HEIGHT - 2;
      continue;
    }

    if (/^[•*\-]\s+/.test(line)) {
      drawBullet(line.replace(/^[•*\-]\s+/, '').trim());
      continue;
    }

    const wrappedLines = wrapText(line, font, BODY_SIZE, bodyMaxWidth);
    for (const wrappedLine of wrappedLines) {
      ensureSpace(BODY_LINE_HEIGHT);
      drawTextWithBold(
        page,
        wrappedLine,
        bodyTextX,
        y,
        font,
        fontBold,
        BODY_SIZE,
        colors.body
      );
      y -= BODY_LINE_HEIGHT;
    }
  }

  return pdfDoc.save();
}
