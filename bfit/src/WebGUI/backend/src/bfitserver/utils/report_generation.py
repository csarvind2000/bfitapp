import base64
import os
import re
import tempfile

from fpdf import FPDF

# ---------------------------------------------------------------------------
# Design tokens - one place to tune the whole report's look
# ---------------------------------------------------------------------------
NAVY = (24, 34, 53)
NAVY_SOFT = (38, 52, 77)
CYAN = (34, 211, 238)
CYAN_DARK = (14, 116, 144)
CYAN_TINT = (224, 247, 250)
TEXT_PRIMARY = (20, 29, 45)
TEXT_MUTED = (104, 118, 138)
BORDER = (224, 229, 237)
ROW_TINT = (247, 249, 252)
ROW_TOTAL = (232, 237, 244)

RISK_PALETTE = {
    "high": {"bg": (254, 226, 226), "text": (185, 28, 28), "border": (248, 113, 113), "label": "HIGH RISK"},
    "moderate": {"bg": (254, 243, 199), "text": (146, 64, 14), "border": (251, 191, 36), "label": "MODERATE RISK"},
    "low": {"bg": (209, 250, 229), "text": (6, 95, 70), "border": (52, 211, 153), "label": "LOW RISK"},
}


class BodyAnalysisPDF(FPDF):
    def footer(self):
        self.set_y(-10)
        self.set_draw_color(*BORDER)
        self.set_line_width(0.2)
        self.line(self.l_margin, self.get_y(), self.w - self.r_margin, self.get_y())
        self.set_y(-8)
        self.set_font("Helvetica", "", 7.5)
        self.set_text_color(*TEXT_MUTED)
        self.cell(0, 5, "Body Analysis Report")
        self.set_xy(self.w - self.r_margin - 30, -8)
        self.cell(30, 5, f"Page {self.page_no()}", align="R")


def _report_data_url_bytes(data_url):
    if not data_url:
        return None
    _, _, encoded = data_url.partition(",")
    try:
        return base64.b64decode(encoded or data_url)
    except Exception:
        return None


def _report_png_size(image_bytes):
    png_signature = b"\x89PNG\r\n\x1a\n"
    if not image_bytes or not image_bytes.startswith(png_signature):
        return None
    if len(image_bytes) < 24:
        return None
    return (
        int.from_bytes(image_bytes[16:20], "big"),
        int.from_bytes(image_bytes[20:24], "big"),
    )


def _report_color(value):
    if not value or value == "transparent":
        return 255, 255, 255
    rgb = re.match(r"rgb\((\d+),\s*(\d+),\s*(\d+)\)", str(value))
    if rgb:
        return tuple(int(part) for part in rgb.groups())
    if isinstance(value, str) and re.match(r"^#[0-9a-fA-F]{6}$", value):
        return tuple(int(value[index:index + 2], 16) for index in (1, 3, 5))
    return 255, 255, 255


def _report_text(value):
    return str(value if value not in (None, "") else "-")


def _report_summary_text(value):
    text = str(value or "").strip()
    text = re.sub(r"```.*?```", "", text, flags=re.DOTALL)
    text = text.replace("**", "")
    text = re.sub(r"^\s*#+\s*", "", text, flags=re.MULTILINE)
    text = text.replace("\u2022", "-").replace("\u2013", "-").replace("\u2014", "-")
    return text.strip().encode("latin-1", "replace").decode("latin-1")


def _report_round_numbers(text):
    def round_match(match):
        number = float(match.group(0))
        return f"{number:.1f}" if abs(number) >= 10 else f"{number:.2f}"

    return re.sub(r"\d+\.\d{2,}", round_match, text)


def _report_clean_summary_line(value):
    text = str(value or "").strip()
    text = text.replace("**", "")
    text = re.sub(r"\s+", " ", text)
    text = text.replace("\u2022", "-").replace("\u2013", "-").replace("\u2014", "-")
    text = _report_round_numbers(text)
    return text.strip().encode("latin-1", "replace").decode("latin-1")


def _normalize_heading_key(value):
    return re.sub(r"[^a-z0-9]+", " ", str(value or "").lower()).strip()


def _detect_risk_level(text):
    lowered = str(text or "").lower()
    if re.search(r"\bhigh\b", lowered):
        return "high"
    if re.search(r"\b(moderate|intermediate|elevated)\b", lowered):
        return "moderate"
    if re.search(r"\b(low|minimal)\b", lowered):
        return "low"
    return None


def _report_summary_blocks(summary):
    text = _report_summary_text(summary)
    if not text:
        return []

    blocks = []
    paragraph_lines = []
    seen_headings = set()

    def flush_paragraph():
        if paragraph_lines:
            paragraph = _report_clean_summary_line(" ".join(paragraph_lines))
            if paragraph:
                blocks.append({"type": "paragraph", "text": paragraph})
            paragraph_lines.clear()

    for raw_line in text.splitlines():
        line = raw_line.strip()
        if not line:
            flush_paragraph()
            continue

        heading_match = re.match(r"^(\d+)[\)\.]\s+(.+?)(?::\s*(.+))?$", line)
        if heading_match:
            number, heading, inline_body = heading_match.groups()
            heading = _report_clean_summary_line(heading).rstrip(":")
            heading_key = _normalize_heading_key(heading)
            if heading_key in {"patient report", "patient analysis report"}:
                continue
            flush_paragraph()
            if heading_key and heading_key not in seen_headings:
                seen_headings.add(heading_key)
                blocks.append({"type": "heading", "number": number, "text": heading})
            if inline_body:
                inline_body = _report_clean_summary_line(inline_body)
                if inline_body:
                    blocks.append({"type": "paragraph", "text": inline_body})
            continue

        simple_heading = _report_clean_summary_line(line).rstrip(":")
        simple_heading_key = _normalize_heading_key(simple_heading)
        if (
            simple_heading_key in {
                "patient report",
                "patient analysis report",
                "introduction",
                "clinical observations",
                "diagnostic insights based on imat sat and muscle volume",
                "diagnostic insights based on imf imat sat sub muscles and muscle volume",
                "diagnostic insights based on vat dsat and ssat",
                "differential diagnosis",
                "differential diagnosis and clinical risk factors",
                "treatment and management recommendations",
                "recommended diagnostic tests",
                "overall risk score",
                "conclusion",
            }
            and len(simple_heading.split()) <= 10
        ):
            flush_paragraph()
            if (
                simple_heading_key not in {"patient report", "patient analysis report"}
                and simple_heading_key not in seen_headings
            ):
                seen_headings.add(simple_heading_key)
                blocks.append({"type": "heading", "number": "", "text": simple_heading})
            continue

        bullet_match = re.match(r"^[\*\+\-]\s+(.+)$", line)
        if bullet_match:
            flush_paragraph()
            bullet = _report_clean_summary_line(bullet_match.group(1))
            if bullet:
                blocks.append({"type": "bullet", "text": bullet})
            continue

        paragraph_lines.append(line)

    flush_paragraph()

    # Tag the "Overall Risk Score" heading (if present) with a risk level
    # pulled from the text that follows it, so it can render a colored pill.
    for index, block in enumerate(blocks):
        if block["type"] == "heading" and _normalize_heading_key(block["text"]) == "overall risk score":
            for lookahead in blocks[index + 1: index + 3]:
                if lookahead["type"] in ("paragraph", "bullet"):
                    level = _detect_risk_level(lookahead["text"])
                    if level:
                        block["badge"] = level
                    break

    return blocks


def _report_ensure_space(pdf, height):
    if pdf.get_y() + height > pdf.page_break_trigger:
        pdf.add_page()


def _report_image(pdf, data_url, x, y, width, height):
    image_bytes = _report_data_url_bytes(data_url)
    if not image_bytes:
        return False

    tmp_path = None
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=".png") as tmp:
            tmp.write(image_bytes)
            tmp_path = tmp.name

        image_size = _report_png_size(image_bytes)
        if image_size:
            image_w, image_h = image_size
            scale = min(width / image_w, height / image_h)
            draw_w = image_w * scale
            draw_h = image_h * scale
            draw_x = x + ((width - draw_w) / 2)
            draw_y = y + ((height - draw_h) / 2)
            pdf.image(tmp_path, x=draw_x, y=draw_y, w=draw_w, h=draw_h)
        else:
            pdf.image(tmp_path, x=x, y=y, w=width)
        return True
    finally:
        if tmp_path and os.path.exists(tmp_path):
            os.unlink(tmp_path)


def _report_add_header(pdf, generated_at, generated_by=None):
    pdf.add_page()
    band_x, band_y = pdf.l_margin, pdf.get_y()
    band_w, band_h = pdf.w - pdf.l_margin - pdf.r_margin, 22

    pdf.set_fill_color(*NAVY)
    pdf.rect(band_x, band_y, band_w, band_h, "F")
    pdf.set_fill_color(*CYAN)
    pdf.rect(band_x, band_y, band_w, 0.8, "F")

    pdf.set_xy(band_x + 5, band_y + 4.5)
    pdf.set_font("Helvetica", "B", 7)
    pdf.set_text_color(205, 215, 228)
    pdf.cell(0, 4, "BODY COMPOSITION")
    pdf.ln(5)
    pdf.set_x(band_x + 5)
    pdf.set_font("Helvetica", "B", 16)
    pdf.set_text_color(255, 255, 255)
    pdf.cell(0, 7, "Body Analysis Report")

    pdf.set_xy(band_x + band_w - 50, band_y + 6)
    pdf.set_font("Helvetica", "", 7)
    pdf.set_text_color(205, 215, 228)
    header_lines = ["Generated", _report_text(generated_at)]
    if generated_by:
        header_lines.append(f"By {_report_text(generated_by)}")
    pdf.multi_cell(46, 4, "\n".join(header_lines), align="R")
    pdf.set_y(band_y + band_h + 7)


def _report_add_patient_info(pdf, patient_info):
    if not patient_info:
        return

    _report_ensure_space(pdf, 22)
    title_y = pdf.get_y()
    pdf.set_font("Helvetica", "B", 10)
    pdf.set_text_color(*NAVY)
    pdf.cell(0, 6, "Patient Information")
    pdf.set_draw_color(*BORDER)
    pdf.set_line_width(0.25)
    pdf.line(pdf.l_margin, title_y + 7.5, pdf.w - pdf.r_margin, title_y + 7.5)
    pdf.set_y(title_y + 11)

    width = pdf.w - pdf.l_margin - pdf.r_margin
    gap = 4
    cell_w = (width - gap) / 2
    cell_h = 12.5
    start_y = pdf.get_y()

    for index, item in enumerate(patient_info or []):
        row = index // 2
        col = index % 2
        x = pdf.l_margin + (col * (cell_w + gap))
        y = start_y + (row * (cell_h + 2))

        if y + cell_h > pdf.page_break_trigger:
            pdf.add_page()
            start_y = pdf.get_y()
            row = 0
            y = start_y

        if col == 0:
            _report_ensure_space(pdf, cell_h + 2)

        pdf.set_fill_color(249, 251, 254)
        pdf.set_draw_color(*BORDER)
        pdf.rect(x, y, cell_w, cell_h, "DF")
        pdf.set_xy(x + 3, y + 2)
        pdf.set_font("Helvetica", "", 6)
        pdf.set_text_color(*TEXT_MUTED)
        pdf.cell(cell_w - 6, 3, _report_text(item.get("label")).upper())
        pdf.set_xy(x + 3, y + 6)
        pdf.set_font("Helvetica", "B", 7.2)
        pdf.set_text_color(*NAVY)
        pdf.multi_cell(cell_w - 6, 3, _report_text(item.get("value")))

    row_count = (len(patient_info or []) + 1) // 2
    pdf.set_y(start_y + row_count * (cell_h + 2) + 5)


def _report_section_title(pdf, title):
    _report_ensure_space(pdf, 17)
    y = pdf.get_y()
    width = pdf.w - pdf.l_margin - pdf.r_margin
    pdf.set_fill_color(246, 249, 252)
    pdf.set_draw_color(*BORDER)
    pdf.rect(pdf.l_margin, y, width, 10, "DF")
    pdf.set_fill_color(*CYAN)
    pdf.rect(pdf.l_margin, y, 1.2, 10, "F")
    pdf.set_xy(pdf.l_margin + 4, y + 1)
    pdf.set_font("Helvetica", "B", 12)
    pdf.set_text_color(*NAVY)
    pdf.cell(0, 8, _report_text(title))
    pdf.set_y(y + 14)


def _report_add_compact_section_heading(pdf, title):
    _report_ensure_space(pdf, 14)
    pdf.ln(2)
    y = pdf.get_y()
    pdf.set_xy(pdf.l_margin, y - 0.2)
    pdf.set_font("Helvetica", "B", 9.2)
    pdf.set_text_color(*NAVY)
    pdf.cell(0, 6, title)
    pdf.set_draw_color(*BORDER)
    pdf.set_line_width(0.2)
    pdf.line(pdf.l_margin, y + 6.5, pdf.w - pdf.r_margin, y + 6.5)
    pdf.set_y(y + 9)


def _report_add_image_row(pdf, title, images):
    _report_ensure_space(pdf, 52)
    pdf.set_font("Helvetica", "B", 8.5)
    pdf.set_text_color(*NAVY_SOFT)
    pdf.cell(0, 5, title)
    pdf.ln(6)

    width = pdf.w - pdf.l_margin - pdf.r_margin
    gap = 3
    image_w = (width - (gap * 2)) / 3
    image_h = 36
    y = pdf.get_y()

    for index, image in enumerate(images or []):
        x = pdf.l_margin + (index * (image_w + gap))
        pdf.set_draw_color(*BORDER)
        pdf.rect(x, y, image_w, image_h + 7)
        pdf.set_fill_color(0, 0, 0)
        pdf.rect(x, y, image_w, image_h, "F")
        _report_image(pdf, image.get("dataUrl"), x, y, image_w, image_h)
        pdf.set_xy(x, y + image_h)
        pdf.set_fill_color(*ROW_TINT)
        pdf.set_font("Helvetica", "B", 6)
        pdf.set_text_color(*NAVY_SOFT)
        pdf.cell(image_w, 7, _report_text(image.get("label")), border=1, align="C", fill=True)

    pdf.set_y(y + image_h + 12)


def _volume_table_header(pdf, col_w):
    pdf.set_fill_color(*NAVY_SOFT)
    pdf.set_draw_color(*NAVY_SOFT)
    pdf.set_text_color(255, 255, 255)
    pdf.set_font("Helvetica", "B", 6)
    pdf.cell(col_w[0], 7, "  TISSUE", fill=True)
    pdf.cell(col_w[1], 7, "OVERALL VOLUME (CC)  ", align="R", fill=True)
    pdf.cell(col_w[2], 7, "DISTRIBUTION  ", align="R", fill=True)
    pdf.ln(7)


def _report_add_volume_table(pdf, rows):
    _report_add_compact_section_heading(pdf, "Overall Volume")

    width = pdf.w - pdf.l_margin - pdf.r_margin
    col_w = [width * 0.52, width * 0.24, width * 0.24]
    _volume_table_header(pdf, col_w)

    for index, row in enumerate(rows or []):
        if pdf.get_y() + 7 > pdf.page_break_trigger:
            pdf.add_page()
            _volume_table_header(pdf, col_w)

        is_total = str(row.get("label", "")).lower() == "total"
        fill = is_total or index % 2 == 1
        pdf.set_fill_color(*(ROW_TOTAL if is_total else ROW_TINT))
        y = pdf.get_y()
        pdf.cell(col_w[0], 7, "", fill=fill)
        pdf.set_font("Helvetica", "B" if is_total else "", 7)
        pdf.set_text_color(*TEXT_PRIMARY)
        pdf.cell(col_w[1], 7, _report_text(row.get("volume")) + "  ", align="R", fill=fill)
        pdf.cell(col_w[2], 7, _report_text(row.get("percent")) + "  ", align="R", fill=fill)
        r, g, b = _report_color(row.get("color"))
        pdf.set_fill_color(r, g, b)
        pdf.set_draw_color(120, 132, 150)
        pdf.ellipse(pdf.l_margin + 3, y + 2, 3, 3, "FD")
        pdf.set_xy(pdf.l_margin + 8, y)
        pdf.set_font("Helvetica", "B", 7)
        pdf.set_text_color(*NAVY)
        pdf.cell(col_w[0] - 8, 7, _report_text(row.get("label")))
        pdf.set_y(y + 7)
        pdf.set_draw_color(*BORDER)
        pdf.line(pdf.l_margin, pdf.get_y(), pdf.w - pdf.r_margin, pdf.get_y())
        if is_total:
            pdf.set_draw_color(190, 200, 214)
            pdf.line(pdf.l_margin, y, pdf.w - pdf.r_margin, y)

    if not rows:
        pdf.set_draw_color(*BORDER)
        pdf.set_text_color(*TEXT_MUTED)
        pdf.set_font("Helvetica", "", 7.5)
        pdf.cell(width, 8, "No overall volume data available for this mask.", border=1, align="C")
        pdf.ln(8)

    pdf.ln(5)


def _report_draw_swatch(pdf, x, y, color):
    if not color or color == "transparent":
        return
    r, g, b = _report_color(color)
    pdf.set_fill_color(r, g, b)
    pdf.set_draw_color(120, 132, 150)
    pdf.ellipse(x, y, 2.1, 2.1, "FD")


def _sub_muscle_header(pdf, x0, col_w, left_total, right_total):
    pdf.set_fill_color(*NAVY_SOFT)
    pdf.set_draw_color(*NAVY_SOFT)
    pdf.set_text_color(255, 255, 255)
    pdf.set_font("Helvetica", "B", 6)

    y0 = pdf.get_y()
    pdf.cell(col_w[0], 12, "  MUSCLE", align="L", fill=True)
    pdf.set_xy(x0 + col_w[0], y0)
    pdf.cell(left_total, 6, "LEFT", align="C", fill=True)
    pdf.cell(right_total, 6, "RIGHT", align="C", fill=True)
    pdf.set_xy(x0 + col_w[0], y0 + 6)
    pdf.cell(col_w[1], 6, "", fill=True)
    pdf.cell(col_w[2], 6, "VOL", align="C", fill=True)
    pdf.cell(col_w[3], 6, "%", align="C", fill=True)
    pdf.cell(col_w[4], 6, "", fill=True)
    pdf.cell(col_w[5], 6, "VOL", align="C", fill=True)
    pdf.cell(col_w[6], 6, "%", align="C", fill=True)
    pdf.set_draw_color(70, 88, 118)
    pdf.line(x0 + col_w[0] + left_total, y0, x0 + col_w[0] + left_total, y0 + 12)
    pdf.set_y(y0 + 12)


def _report_add_sub_muscle_table(pdf, rows):
    if not rows:
        return

    _report_add_compact_section_heading(pdf, "Sub-muscles")

    width = pdf.w - pdf.l_margin - pdf.r_margin
    col_w = [
        width * 0.34,
        width * 0.04,
        width * 0.16,
        width * 0.10,
        width * 0.04,
        width * 0.16,
        width * 0.16,
    ]
    left_total = sum(col_w[1:4])
    right_total = sum(col_w[4:7])
    x0 = pdf.l_margin
    _sub_muscle_header(pdf, x0, col_w, left_total, right_total)

    for index, row in enumerate(rows or []):
        if pdf.get_y() + 8 > pdf.page_break_trigger:
            pdf.add_page()
            _sub_muscle_header(pdf, x0, col_w, left_total, right_total)

        is_total = str(row.get("key", "")).lower() == "total"
        fill = is_total or index % 2 == 1
        pdf.set_text_color(*TEXT_PRIMARY)
        pdf.set_font("Helvetica", "B" if is_total else "", 6.5)
        y = pdf.get_y()

        left = row.get("left") or {}
        right = row.get("right") or {}
        label_value = "  " + _report_text(row.get("label"))

        pdf.set_fill_color(*(ROW_TOTAL if is_total else ROW_TINT))
        pdf.cell(col_w[0], 8, label_value, border=0, align="L", fill=fill)

        pdf.set_font("Helvetica", "B" if is_total else "", 6.5)
        numeric_values = [
            ("", col_w[1], "C"),
            (_report_text(left.get("volume")), col_w[2], "R"),
            (_report_text(left.get("percent")), col_w[3], "R"),
            ("", col_w[4], "C"),
            (_report_text(right.get("volume")), col_w[5], "R"),
            (_report_text(right.get("percent")), col_w[6], "R"),
        ]
        for value, w, align in numeric_values:
            pdf.cell(w, 8, value, border=0, align=align, fill=fill)

        pdf.set_draw_color(*BORDER)
        pdf.line(x0, y + 8, x0 + width, y + 8)

        if is_total:
            pdf.set_draw_color(*NAVY)
            pdf.set_line_width(0.4)
            pdf.line(x0, y, x0 + width, y)
            pdf.set_line_width(0.2)

        divider_x = x0 + col_w[0] + left_total
        pdf.set_draw_color(*BORDER)
        pdf.line(divider_x, y, divider_x, y + 8)

        _report_draw_swatch(pdf, x0 + col_w[0] + 2.1, y + 2.9, left.get("color"))
        _report_draw_swatch(
            pdf,
            x0 + col_w[0] + left_total + 2.1,
            y + 2.9,
            right.get("color"),
        )
        pdf.set_y(y + 8)

    pdf.ln(5)


def _report_add_comments(pdf, comments):
    normalized_comments = []
    for comment in comments or []:
        if isinstance(comment, dict):
            text = str(comment.get("text", "")).strip()
            created_at = str(comment.get("created_at", "")).strip()
        else:
            text = str(comment).strip()
            created_at = ""
        if text:
            normalized_comments.append({"text": text, "created_at": created_at})

    if not normalized_comments:
        return

    _report_ensure_space(pdf, 20)
    y = pdf.get_y()
    pdf.set_xy(pdf.l_margin, y)
    pdf.set_font("Helvetica", "B", 10.5)
    pdf.set_text_color(*NAVY)
    pdf.cell(0, 6, "Other Comments")
    pdf.set_draw_color(*BORDER)
    pdf.set_line_width(0.2)
    pdf.line(pdf.l_margin, y + 7.2, pdf.w - pdf.r_margin, y + 7.2)
    pdf.set_y(y + 10)

    for index, comment in enumerate(normalized_comments, start=1):
        _report_ensure_space(pdf, 16)
        pdf.set_fill_color(250, 252, 255)
        pdf.set_draw_color(*BORDER)
        y = pdf.get_y()
        pdf.rect(pdf.l_margin, y, pdf.w - pdf.l_margin - pdf.r_margin, 14, "DF")
        pdf.set_xy(pdf.l_margin + 3, y + 2)
        pdf.set_font("Helvetica", "B", 7)
        pdf.set_text_color(*NAVY_SOFT)
        title = f"Comment {index}"
        if comment["created_at"]:
            title = f"{title}   -   {comment['created_at']}"
        pdf.cell(0, 3, title)
        pdf.set_xy(pdf.l_margin + 3, y + 6)
        pdf.set_font("Helvetica", "", 7)
        pdf.set_text_color(*TEXT_PRIMARY)
        pdf.multi_cell(pdf.w - pdf.l_margin - pdf.r_margin - 6, 3.5, comment["text"])
        pdf.set_y(max(pdf.get_y() + 3, y + 17))


def _draw_risk_badge(pdf, x_right, y, level):
    info = RISK_PALETTE.get(level)
    if not info:
        return 0
    pdf.set_font("Helvetica", "B", 6.5)
    label = info["label"]
    text_w = pdf.get_string_width(label)
    pad = 3.5
    pill_w = text_w + pad * 2
    pill_h = 5.6
    x = x_right - pill_w
    pdf.set_fill_color(*info["bg"])
    pdf.set_draw_color(*info["border"])
    pdf.set_line_width(0.35)
    pdf.rect(x, y, pill_w, pill_h, style="DF", round_corners=True, corner_radius=pill_h / 2)
    pdf.set_text_color(*info["text"])
    pdf.set_xy(x, y + 0.9)
    pdf.cell(pill_w, pill_h - 1.4, label, align="C")
    pdf.set_line_width(0.2)
    return pill_w + 4


def _report_add_summary(pdf, summary):
    blocks = _report_summary_blocks(summary)
    if not blocks:
        return

    _report_ensure_space(pdf, 24)
    width = pdf.w - pdf.l_margin - pdf.r_margin

    pdf.ln(2)
    title_y = pdf.get_y()
    pdf.set_font("Helvetica", "B", 12.5)
    pdf.set_text_color(*NAVY)
    pdf.cell(0, 6, "Clinical Summary")
    pdf.set_draw_color(*CYAN)
    pdf.set_line_width(0.8)
    pdf.line(pdf.l_margin, title_y + 8, pdf.l_margin + 26, title_y + 8)
    pdf.set_line_width(0.2)
    pdf.ln(13)

    for block in blocks:
        block_type = block.get("type")
        text = block.get("text", "")

        if block_type == "heading":
            _report_ensure_space(pdf, 15)
            pdf.ln(4)
            y = pdf.get_y()
            number = str(block.get("number") or "").strip()
            indent = 0
            if number:
                pdf.set_fill_color(*CYAN_TINT)
                pdf.rect(pdf.l_margin, y, 6.5, 6.5, "F", round_corners=True, corner_radius=1.3)
                pdf.set_font("Helvetica", "B", 7.4)
                pdf.set_text_color(*CYAN_DARK)
                pdf.set_xy(pdf.l_margin, y + 1.3)
                pdf.cell(6.5, 4, number, align="C")
                indent = 9

            badge_w = 0
            if block.get("badge"):
                badge_w = _draw_risk_badge(pdf, pdf.w - pdf.r_margin, y, block["badge"])

            pdf.set_xy(pdf.l_margin + indent, y)
            pdf.set_font("Helvetica", "B", 9)
            pdf.set_text_color(*NAVY)
            pdf.multi_cell(width - indent - badge_w, 4.6, text, align="L")
            pdf.set_draw_color(*BORDER)
            pdf.set_line_width(0.2)
            pdf.line(pdf.l_margin + indent, pdf.get_y() + 0.6, pdf.w - pdf.r_margin, pdf.get_y() + 0.6)
            pdf.ln(3)
            continue

        if block_type == "bullet":
            _report_ensure_space(pdf, 7)
            y = pdf.get_y()
            pdf.set_font("Helvetica", "B", 7.5)
            pdf.set_text_color(*CYAN_DARK)
            pdf.set_xy(pdf.l_margin + 4, y)
            pdf.cell(3, 3.8, "-")
            pdf.set_xy(pdf.l_margin + 8, y)
            pdf.set_font("Helvetica", "", 7.6)
            pdf.set_text_color(*TEXT_PRIMARY)
            pdf.multi_cell(width - 8, 4.4, text, align="L")
            pdf.ln(1.3)
            continue

        _report_ensure_space(pdf, 10)
        pdf.set_x(pdf.l_margin)
        pdf.set_font("Helvetica", "", 7.8)
        pdf.set_text_color(*TEXT_PRIMARY)
        pdf.multi_cell(width, 4.7, text, align="L")
        pdf.ln(2.4)

    pdf.ln(2)


def build_body_analysis_pdf(payload):
    pdf = BodyAnalysisPDF(unit="mm", format="A4")
    pdf.set_margins(16, 14, 16)
    pdf.set_auto_page_break(auto=True, margin=16)
    _report_add_header(pdf, payload.get("generated_at"), payload.get("generated_by"))
    _report_add_patient_info(pdf, payload.get("patient_info") or [])

    for section in payload.get("sections") or []:
        _report_ensure_space(pdf, 70)
        _report_section_title(pdf, section.get("maskName"))
        _report_add_image_row(pdf, "Input Image", section.get("inputImages") or [])
        _report_add_image_row(pdf, "Segmentation Overlay", section.get("overlayImages") or [])
        _report_add_volume_table(pdf, section.get("volumeRows") or [])
        _report_add_sub_muscle_table(pdf, section.get("subMuscleRows") or [])

    _report_add_summary(pdf, payload.get("summary") or "")
    _report_add_comments(pdf, payload.get("comments") or [])

    output = pdf.output(dest="S")
    if isinstance(output, str):
        return output.encode("latin1")
    return bytes(output)
