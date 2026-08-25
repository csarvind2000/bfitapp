import base64
import csv
import json
import logging
import os
import re
from io import StringIO
from types import SimpleNamespace

import numpy as np

logger = logging.getLogger("bfitserver")

LOCAL_LLM_BASE_URL = os.environ.get(
    "LOCAL_LLM_BASE_URL",
    "http://host.docker.internal:11434",
).rstrip("/")
LOCAL_LLM_MODEL = os.environ.get("LOCAL_LLM_MODEL", "llama3.2:3b")
try:
    LOCAL_LLM_TIMEOUT = int(os.environ.get("LOCAL_LLM_TIMEOUT", "90"))
except ValueError:
    LOCAL_LLM_TIMEOUT = 90

NON_MUSCLE_VOLUME_TERMS = (
    "imat",
    "imf",
    "sat",
    "ssat",
    "dsat",
    "vat",
    "fat",
    "bone",
    "femur",
    "ilium",
    "organ",
    "total",
)


def parse_float(value):
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return float(value)
    text = str(value).strip().replace("%", "")
    if not text or text == "-":
        return None
    try:
        return float(text)
    except ValueError:
        return None


def parse_summary_csv_b64(b64_data):
    if not b64_data:
        return None
    try:
        decoded = base64.b64decode(b64_data).decode("utf-8-sig")
        rows = list(csv.DictReader(StringIO(decoded)))
        return rows[0] if rows else None
    except Exception as error:
        logger.warning(f"Failed to parse summary CSV for LLM summary: {error}")
        return None


def normalise_metric_key(value):
    return str(value or "").strip().lower().replace(" ", "_")


def is_volume_key(key):
    return normalise_metric_key(key).endswith("_volume")


def finite_number(value):
    return isinstance(value, (int, float)) and np.isfinite(value)


def ratio_or_none(numerator, denominator):
    if finite_number(numerator) and finite_number(denominator) and denominator:
        return numerator / denominator
    return None


def format_prompt_value(value, decimals=3):
    if finite_number(value):
        return f"{value:.{decimals}f}"
    return "Not available"


def build_available_patient_context(analysis):
    study = getattr(getattr(analysis, "series", None), "study", None)
    patient = {}
    patient_name = str(getattr(study, "patient_name", "") or "").strip()
    patient_id = str(getattr(study, "patient_id", "") or "").strip()
    if patient_name and patient_name.lower() != "not available":
        patient["patient_name"] = patient_name
    if patient_id and patient_id.lower() != "not available":
        patient["patient_id"] = patient_id
    return patient or {}


def sanitize_llm_summary_text(text):
    if not text:
        return ""

    def normalise_heading(value):
        return re.sub(r"[^a-z ]+", "", str(value or "").strip().lower()).strip()

    def is_patient_section_heading(value):
        return normalise_heading(value) in {"patient information", "patient data"}

    def is_forbidden_metrics_section_heading(value):
        return normalise_heading(value) in {
            "available metrics",
            "metrics",
            "raw metrics",
            "full metrics json",
            "source metrics",
        }

    def is_allowed_report_section_heading(value):
        return normalise_heading(value) in {
            "patient report",
            "patient analysis report",
            "introduction",
            "clinical observations",
            "diagnostic insights based on imat sat and muscle volume",
            "differential diagnosis",
            "treatment and management recommendations",
            "recommended diagnostic tests",
            "overall risk score",
            "conclusion",
        }

    def is_patient_field(value):
        cleaned = re.sub(r"^[\s\-\*\u2022:]+", "", str(value or "").strip()).lower()
        return cleaned.startswith(
            (
                "name:",
                "patient name:",
                "patient id:",
                "id:",
                "age:",
                "gender:",
                "sex:",
                "weight:",
                "height:",
                "bmi:",
            )
        ) or "[insert " in cleaned

    def is_unavailable_patient_line(value):
        cleaned = re.sub(r"^[\s\-\*\u2022:]+", "", str(value or "").strip()).lower()
        unavailable_patterns = (
            "patient has been identified as",
            "lack of patient name",
            "lack of patient id",
            "patient name or id",
            "patient name/id",
            "demographic data is not available",
            "demographics are not available",
        )
        if any(pattern in cleaned for pattern in unavailable_patterns):
            return True
        if "not available" not in cleaned:
            return False
        return cleaned.startswith(
            (
                "patient id:",
                "patient name:",
                "name:",
                "id:",
                "age:",
                "gender:",
                "sex:",
                "weight:",
                "height:",
                "bmi:",
            )
        )

    cleaned_lines = []
    skipping_patient_section = False
    skipping_forbidden_metrics_section = False
    for line in str(text).splitlines():
        stripped_line = line.strip()
        if stripped_line.startswith("```") or stripped_line.lower() == "json":
            continue
        if is_unavailable_patient_line(line):
            continue

        if is_forbidden_metrics_section_heading(line):
            skipping_forbidden_metrics_section = True
            continue

        if skipping_forbidden_metrics_section:
            if not line.strip():
                continue
            if (
                re.match(r"^\d+\)\s+", line.strip())
                or is_allowed_report_section_heading(line)
                or is_forbidden_metrics_section_heading(line)
            ):
                skipping_forbidden_metrics_section = False
            else:
                continue

        if is_patient_section_heading(line):
            skipping_patient_section = True
            continue

        if skipping_patient_section:
            if not line.strip() or is_patient_field(line):
                continue
            skipping_patient_section = False

        cleaned_lines.append(line)

    cleaned = "\n".join(cleaned_lines)
    cleaned = re.sub(
        r"\n*Please note that these recommendations are based on the MRI analysis provided and should be discussed with the patient in more detail\.?",
        "",
        cleaned,
        flags=re.IGNORECASE,
    )
    cleaned = re.sub(
        r"\n*These recommendations are based on the MRI analysis provided and should be discussed with the patient in more detail\.?",
        "",
        cleaned,
        flags=re.IGNORECASE,
    )
    cleaned = re.sub(r"\n{3,}", "\n\n", cleaned)
    return cleaned.strip()


def build_intro_fallback_sentence(analysis=None, source=None):
    patient = build_available_patient_context(analysis) if analysis is not None else {}
    patient_label = patient.get("patient_name") or patient.get("patient_id")
    prefix = f"This report summarizes the imaging-derived findings for {patient_label}, " if patient_label else "This report summarizes the imaging-derived findings, "

    if analysis is not None and is_abdomen_analysis(analysis, source):
        return (
            f"{prefix}with emphasis on abdominal adipose distribution, VAT, DSAT, SSAT, "
            "and imaging-based cardiometabolic risk signals."
        )

    return (
        f"{prefix}with emphasis on adipose distribution, muscle volume, muscle quality, "
        "sub-muscle balance, and imaging-based cardiometabolic risk signals."
    )


def ensure_introduction_section(summary_text, analysis=None, source=None):
    summary_text = sanitize_llm_summary_text(summary_text)
    if not summary_text:
        return summary_text

    def compact_blank_lines(value):
        return re.sub(r"\n{3,}", "\n\n", str(value or "")).strip()

    section_heading_pattern = re.compile(
        r"^\s*(?:\d+\)\s*)?(?:\*\*)?(introduction|clinical observations|diagnostic insights|differential diagnosis|treatment and management recommendations|recommended diagnostic tests|overall risk score)(?:\*\*)?:?\s*$",
        flags=re.IGNORECASE,
    )
    introduction_heading_pattern = re.compile(
        r"^\s*(?:1\)\s*)?(?:\*\*)?introduction(?:\*\*)?:?\s*$",
        flags=re.IGNORECASE,
    )

    lines = summary_text.splitlines()
    introduction_indexes = [
        index
        for index, line in enumerate(lines)
        if introduction_heading_pattern.match(line.strip())
    ]
    if len(introduction_indexes) > 1:
        for index in reversed(introduction_indexes[1:]):
            del lines[index]
        summary_text = compact_blank_lines("\n".join(lines))

    for index, line in enumerate(lines):
        if not introduction_heading_pattern.match(line.strip()):
            continue

        next_content_index = None
        for scan_index in range(index + 1, len(lines)):
            candidate = lines[scan_index].strip()
            if not candidate:
                continue
            next_content_index = scan_index
            break

        intro_is_blank = (
            next_content_index is None
            or section_heading_pattern.match(lines[next_content_index].strip()) is not None
        )
        if intro_is_blank:
            insertion_index = index + 1
            while insertion_index < len(lines) and not lines[insertion_index].strip():
                insertion_index += 1
            lines[insertion_index:insertion_index] = [
                "",
                build_intro_fallback_sentence(analysis, source),
                "",
            ]
            return compact_blank_lines("\n".join(lines))

        return summary_text

    return compact_blank_lines(
        "\n\n".join(
        [
            "1) **Introduction**",
            build_intro_fallback_sentence(analysis, source),
            summary_text,
        ]
        )
    )


def postprocess_llm_summary_text(summary_text, analysis=None, source=None):
    return ensure_introduction_section(summary_text, analysis, source)


def humanise_metric_label(value):
    label = re.sub(r"_volume$", "", normalise_metric_key(value))
    label = re.sub(r"_(left|right)$", "", label)
    return label.replace("_", " ").title()


def first_metric_value(metrics, required_terms, excluded_terms=()):
    for key, value in metrics.items():
        normalised = normalise_metric_key(key)
        if not is_volume_key(key):
            continue
        if any(term in normalised for term in excluded_terms):
            continue
        if all(term in normalised for term in required_terms) and finite_number(value):
            return value
    return None


def sum_metric_values(metrics, required_terms, excluded_terms=()):
    values = []
    for key, value in metrics.items():
        normalised = normalise_metric_key(key)
        if not is_volume_key(key):
            continue
        if any(term in normalised for term in excluded_terms):
            continue
        if all(term in normalised for term in required_terms) and finite_number(value):
            values.append(value)
    return sum(values) if values else None


def infer_muscle_volume(metrics):
    direct = first_metric_value(metrics, ("muscle",))
    if direct is not None:
        return direct

    muscle_values = []
    for key, value in metrics.items():
        normalised = normalise_metric_key(key)
        if not is_volume_key(key) or not finite_number(value):
            continue
        if any(term in normalised for term in NON_MUSCLE_VOLUME_TERMS):
            continue
        if normalised.endswith("_left_volume") or normalised.endswith("_right_volume"):
            muscle_values.append(value)
    return sum(muscle_values) if muscle_values else None


def extract_sub_muscle_metrics(metrics):
    sub_muscles = {}
    for key, value in metrics.items():
        normalised = normalise_metric_key(key)
        if not is_volume_key(key) or not finite_number(value):
            continue
        if any(term in normalised for term in NON_MUSCLE_VOLUME_TERMS):
            continue

        side = None
        base_key = None
        if normalised.endswith("_left_volume"):
            side = "left"
            base_key = normalised[: -len("_left_volume")]
        elif normalised.endswith("_right_volume"):
            side = "right"
            base_key = normalised[: -len("_right_volume")]
        if not side or not base_key:
            continue

        sub_muscle = sub_muscles.setdefault(
            base_key,
            {"name": humanise_metric_label(base_key), "left": None, "right": None},
        )
        sub_muscle[side] = value

    rows = []
    for sub_muscle in sub_muscles.values():
        left = sub_muscle["left"]
        right = sub_muscle["right"]
        total = (left if finite_number(left) else 0) + (
            right if finite_number(right) else 0
        )
        asymmetry = None
        if finite_number(left) and finite_number(right) and max(left, right) > 0:
            asymmetry = abs(left - right) / max(left, right) * 100
        rows.append(
            {
                "name": sub_muscle["name"],
                "left_volume": format_prompt_value(left, 1),
                "right_volume": format_prompt_value(right, 1),
                "combined_volume": format_prompt_value(total, 1),
                "asymmetry_percent": format_prompt_value(asymmetry, 2),
            }
        )

    return sorted(
        rows,
        key=lambda row: parse_float(row["combined_volume"]) or 0,
        reverse=True,
    )


def build_llm_report_context(analysis, source, metrics):
    imf = sum_metric_values(metrics, ("imf",))
    imat = sum_metric_values(metrics, ("imat",))
    sat = sum_metric_values(metrics, ("sat",), ("imat",))
    muscle = infer_muscle_volume(metrics)
    fat_infiltration = (
        (imf if finite_number(imf) else 0) + (imat if finite_number(imat) else 0)
        if finite_number(imf) or finite_number(imat)
        else None
    )
    sub_muscles = extract_sub_muscle_metrics(metrics)
    ratios = {
        "IMF/Muscle": ratio_or_none(imf, muscle),
        "IMAT/Muscle": ratio_or_none(imat, muscle),
        "Fat infiltration/Muscle": ratio_or_none(fat_infiltration, muscle),
        "IMAT/SAT": ratio_or_none(imat, sat),
        "SAT/Muscle": ratio_or_none(sat, muscle),
    }

    return {
        "patient": build_available_patient_context(analysis),
        "scan": {
            "anatomy": analysis.series.anatomy,
            "modality": analysis.series.modality,
            "metric_source": source,
            "units": "Volumes are in cubic centimeters when keys contain Volume. Percentage keys are distribution percentages.",
        },
        "core_volumes": {
            "IMF volume": format_prompt_value(imf, 1),
            "IMAT volume": format_prompt_value(imat, 1),
            "SAT volume": format_prompt_value(sat, 1),
            "Muscle volume": format_prompt_value(muscle, 1),
            "Fat infiltration volume": format_prompt_value(fat_infiltration, 1),
        },
        "ratios": {label: format_prompt_value(value) for label, value in ratios.items()},
        "sub_muscles": sub_muscles,
        "muscle_quality_notes": [
            "IMF represents intramuscular fat within muscle and is a direct imaging marker of myosteatosis/fat infiltration.",
            "IMAT represents intermuscular adipose tissue between muscle groups and supports muscle-quality and cardiometabolic risk interpretation.",
            "MRI volumes do not directly measure muscle strength; discuss strength as an inferred functional risk proxy and recommend objective testing.",
        ],
        "available_metrics": metrics,
    }


def is_abdomen_analysis(analysis, source=None):
    anatomy = str(getattr(getattr(analysis, "series", None), "anatomy", "") or "").lower()
    source_text = str(source or "").lower()
    return anatomy in {"abd", "abdomen", "abdominal"} or "abd" in source_text


def clamp_risk_score(value):
    if not finite_number(value):
        return 5
    return int(max(1, min(10, round(value))))


def score_from_ratio(value, low, medium, high):
    if not finite_number(value):
        return 5
    if value >= high:
        return 8
    if value >= medium:
        return 6
    if value >= low:
        return 4
    return 2


def average_risk_score(*scores):
    valid_scores = [score for score in scores if finite_number(score)]
    if not valid_scores:
        return 5
    return clamp_risk_score(sum(valid_scores) / len(valid_scores))


def has_overall_risk_score(summary_text):
    return bool(
        re.search(
            r"overall\s+(risk\s+)?score|sarcopenia:\s*\*\*\d+\/10|cardiometabolic\s+risk:\s*\*\*\d+\/10",
            str(summary_text or ""),
            flags=re.IGNORECASE,
        )
    )


def build_rule_based_overall_risk_score_section(analysis, source, metrics):
    if is_abdomen_analysis(analysis, source):
        context = build_abdomen_report_context(analysis, source, metrics)
        ratios = {
            label: parse_float(value)
            for label, value in context["ratios"].items()
        }
        visceral_score = max(
            score_from_ratio(ratios.get("VAT/Total abdominal fat"), 0.25, 0.4, 0.55),
            score_from_ratio(ratios.get("VAT/Subcutaneous fat"), 0.25, 0.5, 0.9),
            score_from_ratio(ratios.get("VAT/SSAT"), 0.3, 0.7, 1.2),
        )
        deep_subcutaneous_score = score_from_ratio(
            ratios.get("DSAT/SSAT"), 0.3, 0.7, 1.2
        )
        cardiometabolic_score = max(visceral_score, deep_subcutaneous_score)
        overall_score = average_risk_score(
            visceral_score,
            cardiometabolic_score,
            deep_subcutaneous_score,
        )
        return "\n".join(
            [
                "7) **Overall Risk Score**",
                f"- Visceral Adiposity Risk: **{clamp_risk_score(visceral_score)}/10**",
                f"- Cardiometabolic Risk: **{clamp_risk_score(cardiometabolic_score)}/10**",
                f"- Overall Abdominal Adiposity Risk: **{overall_score}/10**",
                (
                    "These scores are provisional imaging-based estimates derived from VAT, DSAT, SSAT, "
                    "and their ratios, and should be interpreted alongside clinical and laboratory findings."
                ),
            ]
        )

    context = build_llm_report_context(analysis, source, metrics)
    ratios = {
        label: parse_float(value)
        for label, value in context["ratios"].items()
    }
    fat_infiltration_score = score_from_ratio(
        ratios.get("Fat infiltration/Muscle"), 0.05, 0.15, 0.3
    )
    imf_score = score_from_ratio(ratios.get("IMF/Muscle"), 0.03, 0.08, 0.18)
    imat_score = score_from_ratio(ratios.get("IMAT/Muscle"), 0.03, 0.1, 0.25)
    sat_score = score_from_ratio(ratios.get("SAT/Muscle"), 0.4, 0.8, 1.2)
    sarcopenia_score = max(fat_infiltration_score, imf_score)
    cardiometabolic_score = max(fat_infiltration_score, imat_score, sat_score)
    overall_score = average_risk_score(sarcopenia_score, cardiometabolic_score)
    return "\n".join(
        [
            "7) **Overall Risk Score**",
            f"- Sarcopenia: **{clamp_risk_score(sarcopenia_score)}/10**",
            f"- Cardiometabolic Risk: **{clamp_risk_score(cardiometabolic_score)}/10**",
            f"- Overall Health: **{overall_score}/10**",
            (
                "These scores are provisional imaging-based estimates derived from the available fat-to-muscle "
                "ratios and should be interpreted alongside objective strength, function, and metabolic testing."
            ),
        ]
    )


def ensure_overall_risk_score(summary_text, analysis, source, metrics):
    summary_text = postprocess_llm_summary_text(summary_text, analysis, source)
    if has_overall_risk_score(summary_text):
        return summary_text
    return "\n\n".join(
        [
            summary_text.rstrip(),
            build_rule_based_overall_risk_score_section(analysis, source, metrics),
        ]
    ).strip()


def first_or_sum_metric(metrics, required_terms, excluded_terms=()):
    direct = first_metric_value(metrics, required_terms, excluded_terms)
    if direct is not None:
        return direct
    return sum_metric_values(metrics, required_terms, excluded_terms)


def build_abdomen_report_context(analysis, source, metrics):
    vat = first_or_sum_metric(metrics, ("vat",), ("ssat", "dsat"))
    dsat = first_or_sum_metric(metrics, ("dsat",))
    ssat = first_or_sum_metric(metrics, ("ssat",))
    generic_sat = first_or_sum_metric(metrics, ("sat",), ("vat", "dsat", "ssat", "imat"))

    total_subcutaneous = (
        (ssat if finite_number(ssat) else 0) + (dsat if finite_number(dsat) else 0)
        if finite_number(ssat) or finite_number(dsat)
        else generic_sat
    )
    total_abdominal_fat = (
        (vat if finite_number(vat) else 0)
        + (ssat if finite_number(ssat) else 0)
        + (dsat if finite_number(dsat) else 0)
        if finite_number(vat) or finite_number(ssat) or finite_number(dsat)
        else None
    )

    ratios = {
        "VAT/Total abdominal fat": ratio_or_none(vat, total_abdominal_fat),
        "VAT/Subcutaneous fat": ratio_or_none(vat, total_subcutaneous),
        "VAT/SSAT": ratio_or_none(vat, ssat),
        "DSAT/SSAT": ratio_or_none(dsat, ssat),
        "DSAT/Subcutaneous fat": ratio_or_none(dsat, total_subcutaneous),
    }

    return {
        "patient": build_available_patient_context(analysis),
        "scan": {
            "anatomy": analysis.series.anatomy,
            "modality": analysis.series.modality,
            "metric_source": source,
            "units": "Volumes are in cubic centimeters when keys contain Volume. Percentage keys are distribution percentages.",
        },
        "core_volumes": {
            "VAT volume": format_prompt_value(vat, 1),
            "DSAT volume": format_prompt_value(dsat, 1),
            "SSAT volume": format_prompt_value(ssat, 1),
            "Total subcutaneous fat volume": format_prompt_value(total_subcutaneous, 1),
            "Total abdominal fat volume": format_prompt_value(total_abdominal_fat, 1),
        },
        "ratios": {label: format_prompt_value(value) for label, value in ratios.items()},
        "adipose_notes": [
            "VAT represents visceral adipose tissue within the abdominal cavity and is strongly associated with cardiometabolic risk when elevated.",
            "DSAT represents deep subcutaneous adipose tissue and may carry higher metabolic risk than superficial subcutaneous fat.",
            "SSAT represents superficial subcutaneous adipose tissue and should be interpreted alongside VAT and DSAT distribution.",
            "Imaging volumes alone cannot diagnose diabetes, metabolic syndrome, cardiovascular disease, or liver disease; they should prompt clinical correlation and laboratory testing.",
        ],
        "available_metrics": metrics,
    }


def extract_volume_summary_sources(prediction):
    if not isinstance(prediction, dict):
        return []

    sources = []
    volume_csv = prediction.get("volume_csv") or {}
    if isinstance(volume_csv, dict):
        for variant_key, files in volume_csv.items():
            summary = files.get("summary") if isinstance(files, dict) else None
            if isinstance(summary, dict) and summary.get("b64_data"):
                parsed = parse_summary_csv_b64(summary.get("b64_data"))
                if parsed:
                    sources.append((str(variant_key), parsed))

    for variant_key in ("47class", "48class", "5class", "abd_mr", "abdomen", "abd"):
        value = prediction.get(variant_key)
        if isinstance(value, list) and value and isinstance(value[0], dict):
            sources.append((variant_key, value[0]))
        elif isinstance(value, dict):
            sources.append((variant_key, value))

    def source_priority(item):
        key = item[0].lower()
        if "47class" in key or "48class" in key:
            return 0
        if "5class" in key:
            return 1
        if "abd" in key or "abdomen" in key:
            return 2
        return 3

    return sorted(sources, key=source_priority)


def extract_llm_volume_metrics(prediction):
    for source, summary in extract_volume_summary_sources(prediction):
        metrics = {}
        for key, value in summary.items():
            number = parse_float(value)
            metrics[key] = number if number is not None else value

        if metrics:
            return source, metrics
    return None, {}


def build_volumetric_summary_prompt(analysis, source, metrics):
    if is_abdomen_analysis(analysis, source):
        return build_abdomen_volumetric_summary_prompt(analysis, source, metrics)
    return build_thigh_volumetric_summary_prompt(analysis, source, metrics)


def build_overall_risk_score_prompt(analysis, source, metrics):
    if is_abdomen_analysis(analysis, source):
        context = build_abdomen_report_context(analysis, source, metrics)
        return f"""
You are a clinical assistant. Generate ONLY the missing section below, using only the supplied abdominal imaging metrics.

Required exact output format:
7) **Overall Risk Score**
- Visceral Adiposity Risk: **X/10**
- Cardiometabolic Risk: **Y/10**
- Overall Abdominal Adiposity Risk: **Z/10**
One brief concluding sentence.

Rules:
- X, Y, and Z must be integers from 1 to 10.
- Base the scores on VAT, DSAT, SSAT, total abdominal fat, and their ratios.
- These are imaging-based risk estimates only, not diagnoses.
- Do not include patient demographics, placeholders, or extra sections.
- Do not wrap the answer in JSON or code fences.

Full metrics JSON:
{json.dumps(context, indent=2)}
""".strip()

    context = build_llm_report_context(analysis, source, metrics)
    return f"""
You are a clinical assistant. Generate ONLY the missing section below, using only the supplied thigh/body-composition imaging metrics.

Required exact output format:
7) **Overall Risk Score**
- Sarcopenia: **X/10**
- Cardiometabolic Risk: **Y/10**
- Overall Health: **Z/10**
One brief concluding sentence.

Rules:
- X, Y, and Z must be integers from 1 to 10.
- Base the scores on IMF, IMAT, SAT, muscle volume, sub-muscle asymmetry, and the supplied ratios.
- These are imaging-based risk estimates only, not diagnoses.
- Do not include patient demographics, placeholders, or extra sections.
- Do not wrap the answer in JSON or code fences.

Full metrics JSON:
{json.dumps(context, indent=2)}
""".strip()


def build_thigh_volumetric_summary_prompt(analysis, source, metrics):
    context = build_llm_report_context(analysis, source, metrics)
    volumes = context["core_volumes"]
    ratios = context["ratios"]
    sub_muscle_text = (
        json.dumps(context["sub_muscles"], indent=2)
        if context["sub_muscles"]
        else "No side-specific sub-muscle volumes are available."
    )
    return f"""
You are a clinical assistant. Generate a structured cardiometabolic risk report
based on the following patient data, imaging volumes including IMF, sub-muscle volumes, and ratios.
Use professional formatting: bold all numeric values (e.g., **123.45**), use bullet points for lists,
and ensure clear spacing between sections.

Important constraints:
- Use only the supplied data. Do not invent gender, age, weight, height, BMI, or BComp19_FM values.
- Do not include a separate Patient Information, Patient Data, demographics, Name, Age, Gender, Weight, Height, or BMI section.
- In the Introduction only, briefly identify the patient when patient_name or patient_id is available. If neither is available, omit patient identification silently.
- Do not output placeholders such as "[Insert Name]" or "[Insert Age]".
- Do not write sentences such as "The patient has been identified as Not available", "due to lack of patient name or ID", "Unfortunately, the patient's demographic data is not available", or "without available BComp19_FM classification, we cannot confirm these diagnoses."
- Do not include a disclaimer sentence telling the user to discuss recommendations with the patient in more detail.
- Do not include an "Available Metrics", "Metrics", "Raw Metrics", or similar section.
- Do not copy/paste the input data as a list. Synthesize and interpret only the relevant values inside the seven requested sections.
- Output ONLY the seven requested report sections below, plus the concluding statement inside section 7.
- Imaging volumes alone cannot diagnose sarcopenia, cardiometabolic disease, diabetes, frailty, or reduced strength.
- Discuss muscle strength as an inferred functional risk proxy only; recommend objective testing such as grip strength, chair-stand, gait speed, or dynamometry.
- Include clinical risk factors beyond sarcopenia, such as myosteatosis/fatty infiltration, insulin resistance, type 2 diabetes risk, metabolic syndrome, mobility limitation, fall/frailty risk, cardiovascular risk, and functional decline when supported by the supplied imaging pattern.
- You must include section 7, titled exactly "7) **Overall Risk Score**", even if earlier sections are brief.
- Omit references to "Tree-of-Thought."

**Imaging Volumes** (summed left and right when side-specific values are available):
- IMF volume: {volumes["IMF volume"]}
- IMAT volume: {volumes["IMAT volume"]}
- SAT volume: {volumes["SAT volume"]}
- Muscle volume: {volumes["Muscle volume"]}
- Total fat infiltration volume (IMF + IMAT when available): {volumes["Fat infiltration volume"]}

**Ratios**:
- IMF/Muscle: {ratios["IMF/Muscle"]}
- IMAT/Muscle: {ratios["IMAT/Muscle"]}
- Fat infiltration/Muscle: {ratios["Fat infiltration/Muscle"]}
- IMAT/SAT: {ratios["IMAT/SAT"]}
- SAT/Muscle: {ratios["SAT/Muscle"]}

**Sub-Muscle Volumes and Asymmetry**:
{sub_muscle_text}

Use the supplied data above as source material only. Do not reproduce it as a raw metric list.

Please produce a multi-section "Patient Report" with these sections:

1) **Introduction**: Briefly identify the patient when patient name/ID are available, then summarize the overall imaging-based health status. Do not narrate missing demographic fields.

2) **Clinical Observations**: Discuss the IMAT, SAT, and Muscle volumes, interpreting their implications. Include muscle quality and muscle analysis by discussing IMF when available, fat infiltration, muscle volume, and sub-muscle volumes/asymmetry. Bold all numeric values.

3) **Diagnostic Insights based on IMAT, SAT, and Muscle volume**: Use the imaging volumes, ratios, and sub-muscle asymmetry to provide insights into cardiometabolic risk, muscle quality, and muscle analysis. Bold all numeric values and ratios.

4) **Differential Diagnosis**: Discuss potential considerations such as sarcopenia risk, sarcopenic obesity risk, myosteatosis/fatty infiltration, insulin resistance/type 2 diabetes risk, metabolic syndrome risk, cardiovascular risk, mobility limitation, fall/frailty risk, and functional decline based on the supplied imaging volumes and ratios. Do not mention missing BComp19_FM classification.

5) **Treatment and Management Recommendations**: Provide recommendations based on the findings. Use bullet points.

6) **Recommended Diagnostic Tests**: Suggest tests to further evaluate cardiometabolic risk, muscle quality, and muscle strength/function. Use bullet points.

7) **Overall Risk Score**: Assign a risk score (1-10) for sarcopenia, cardiometabolic risk, and overall health, considering IMF, IMAT, SAT, muscle volume, sub-muscle asymmetry, and ratios. Format as:
   - Sarcopenia: **X/10**
   - Cardiometabolic Risk: **Y/10**
   - Overall Health: **Z/10**
   Follow with a concluding statement summarizing the patient's risk profile and next steps.

Explain each item, referencing the numeric data above.
Write your text in a professional clinical style with clear spacing between sections.
""".strip()


def build_abdomen_volumetric_summary_prompt(analysis, source, metrics):
    context = build_abdomen_report_context(analysis, source, metrics)
    volumes = context["core_volumes"]
    ratios = context["ratios"]

    return f"""
You are a clinical assistant. Generate a structured abdominal adipose tissue and cardiometabolic risk report
based on the following patient data, abdominal imaging volumes including VAT, DSAT, SSAT, and ratios.
Use professional formatting: bold all numeric values (e.g., **123.45**), use bullet points for lists,
and ensure clear spacing between sections.

Important constraints:
- Use only the supplied data. Do not invent gender, age, weight, height, BMI, BComp19_FM values, liver fat values, lab results, or diagnoses.
- Do not include a separate Patient Information, Patient Data, demographics, Name, Age, Gender, Weight, Height, or BMI section.
- In the Introduction only, briefly identify the patient when patient_name or patient_id is available. If neither is available, omit patient identification silently.
- Do not output placeholders such as "[Insert Name]" or "[Insert Age]".
- Do not write sentences such as "The patient has been identified as Not available", "due to lack of patient name or ID", "Unfortunately, the patient's demographic data is not available", or "without available BComp19_FM classification, we cannot confirm these diagnoses."
- Do not include a disclaimer sentence telling the user to discuss recommendations with the patient in more detail.
- Imaging volumes alone cannot diagnose diabetes, metabolic syndrome, cardiovascular disease, fatty liver disease, insulin resistance, or visceral obesity.
- Discuss VAT, DSAT, and SSAT as imaging-based risk markers and body-fat distribution markers only.
- Recommend clinical correlation with objective cardiometabolic testing.
- Include clinical risk factors such as visceral adiposity, insulin resistance, type 2 diabetes risk, metabolic syndrome, cardiovascular risk, fatty liver risk, systemic inflammation risk, and functional/metabolic decline when supported by the supplied imaging pattern.
- Do not include an "Available Metrics", "Metrics", "Raw Metrics", or similar section.
- Do not copy/paste the input data as a list. Synthesize and interpret only the relevant values inside the requested sections.
- Output ONLY the seven requested report sections below, plus the concluding statement inside section 7.
- You must include section 7, titled exactly "7) **Overall Risk Score**", even if earlier sections are brief.
- Omit references to "Tree-of-Thought."

**Abdominal Adipose Volumes**:
- VAT volume: {volumes["VAT volume"]}
- DSAT volume: {volumes["DSAT volume"]}
- SSAT volume: {volumes["SSAT volume"]}
- Total subcutaneous fat volume (DSAT + SSAT when available): {volumes["Total subcutaneous fat volume"]}
- Total abdominal fat volume (VAT + DSAT + SSAT when available): {volumes["Total abdominal fat volume"]}

**Adipose Distribution Ratios**:
- VAT/Total abdominal fat: {ratios["VAT/Total abdominal fat"]}
- VAT/Subcutaneous fat: {ratios["VAT/Subcutaneous fat"]}
- VAT/SSAT: {ratios["VAT/SSAT"]}
- DSAT/SSAT: {ratios["DSAT/SSAT"]}
- DSAT/Subcutaneous fat: {ratios["DSAT/Subcutaneous fat"]}

Use the supplied data above as source material only. Do not reproduce it as a raw metric list.

Please produce a multi-section "Patient Report" with these sections:

1) **Introduction**: Briefly identify the patient when patient name/ID are available, then summarize the overall abdomen imaging-based adipose distribution. Do not narrate missing demographic fields.

2) **Clinical Observations**: Discuss VAT, DSAT, SSAT, total subcutaneous fat, and total abdominal fat, interpreting their implications. Interpret VAT as visceral adipose tissue, DSAT as deep subcutaneous adipose tissue, and SSAT as superficial subcutaneous adipose tissue. Bold all numeric values.

3) **Diagnostic Insights based on VAT, DSAT, and SSAT**: Use the abdominal adipose volumes and ratios to explain fat distribution, visceral-to-subcutaneous balance, and possible cardiometabolic risk signals. Make clear that these are imaging-based risk signals, not diagnoses. Bold all numeric values and ratios (e.g., **0.123**).

4) **Differential Diagnosis**: Discuss potential considerations such as central adiposity, visceral adiposity risk, insulin resistance/type 2 diabetes risk, metabolic syndrome risk, cardiovascular risk, fatty liver risk, systemic inflammation risk, and functional/metabolic decline based on the supplied abdominal adipose volumes and ratios. Do not claim any condition is confirmed by imaging volumes alone.

5) **Treatment and Management Recommendations**: Provide recommendations based on the findings, such as lifestyle intervention, nutrition review, aerobic and resistance exercise, weight-management planning, sleep and alcohol review when relevant, and clinician-led cardiometabolic risk management. Use bullet points.

6) **Recommended Diagnostic Tests**: Suggest tests to further evaluate cardiometabolic and abdominal adiposity risk, such as fasting glucose, HbA1c, fasting insulin when clinically appropriate, lipid profile, blood pressure, waist circumference, liver enzymes, hs-CRP when clinically appropriate, and liver imaging/fat quantification if fatty liver risk is suspected. Use bullet points.

7) **Overall Risk Score**: Assign a risk score (1-10) for visceral adiposity risk, cardiometabolic risk, and overall abdominal adiposity risk, considering VAT, DSAT, SSAT, and their ratios. Format as:
   - Visceral Adiposity Risk: **X/10**
   - Cardiometabolic Risk: **Y/10**
   - Overall Abdominal Adiposity Risk: **Z/10**
   Follow with a concluding statement summarizing the patient's imaging-based risk profile and next steps.

Explain each item, referencing the numeric data above.
Write your text in a professional clinical style with clear spacing between sections.
""".strip()


def build_fallback_volumetric_summary(source, metrics, llm_error=None, analysis=None):
    if analysis is None:
        fallback_study = SimpleNamespace(
            patient_name="Not available",
            patient_id="Not available",
        )
        fallback_series = SimpleNamespace(
            anatomy="unknown",
            modality="unknown",
            study=fallback_study,
        )
        analysis = SimpleNamespace(series=fallback_series)

    if is_abdomen_analysis(analysis, source):
        return build_abdomen_fallback_volumetric_summary(source, metrics, llm_error, analysis)
    return build_thigh_fallback_volumetric_summary(source, metrics, llm_error, analysis)


def build_thigh_fallback_volumetric_summary(source, metrics, llm_error=None, analysis=None):
    context = build_llm_report_context(analysis, source, metrics)
    volumes = context["core_volumes"]
    ratios = context["ratios"]
    sub_muscles = context["sub_muscles"]
    sub_muscle_lines = [
        (
            f"- {row['name']}: left **{row['left_volume']}** cc, right **{row['right_volume']}** cc, "
            f"combined **{row['combined_volume']}** cc, asymmetry **{row['asymmetry_percent']}%**."
        )
        for row in sub_muscles[:8]
    ] or ["- No side-specific sub-muscle volumes are available for asymmetry review."]

    lines = [
        "Patient Report",
        "",
        "1) **Introduction**",
        (
            "This report summarizes the computed imaging measurements as clinical-support context "
            "for body-composition and cardiometabolic risk review."
        ),
        "",
        "2) **Clinical Observations**",
        (
            f"- IMF volume is **{volumes['IMF volume']}** cc. IMF represents intramuscular fat and supports "
            "muscle-quality/myosteatosis interpretation."
        ),
        (
            f"- IMAT volume is **{volumes['IMAT volume']}** cc. Higher IMAT can indicate fatty infiltration "
            "between muscle groups and may reflect reduced muscle quality when elevated relative to muscle volume."
        ),
        f"- SAT volume is **{volumes['SAT volume']}** cc. SAT reflects subcutaneous adiposity and should be interpreted alongside muscle volume and metabolic markers.",
        f"- Muscle volume is **{volumes['Muscle volume']}** cc. Lower muscle volume may raise concern for sarcopenia risk when supported by strength or function testing.",
        f"- Total fat infiltration volume is **{volumes['Fat infiltration volume']}** cc when IMF and/or IMAT are available.",
        "",
        "Sub-muscle review:",
        *sub_muscle_lines,
        "",
        "3) **Diagnostic Insights based on IMF, IMAT, SAT, Sub-Muscles, and Muscle volume**",
        (
            f"- IMF/Muscle ratio is **{ratios['IMF/Muscle']}**, IMAT/Muscle ratio is **{ratios['IMAT/Muscle']}**, "
            f"fat infiltration/Muscle ratio is **{ratios['Fat infiltration/Muscle']}**, IMAT/SAT ratio is **{ratios['IMAT/SAT']}**, "
            f"and SAT/Muscle ratio is **{ratios['SAT/Muscle']}**. Higher fat-to-muscle ratios can support "
            "concern for poorer muscle quality, myosteatosis, reduced functional reserve, and cardiometabolic risk."
        ),
        "- MRI volume analysis does not directly measure strength; reduced strength should be assessed with objective functional testing.",
        "",
        "4) **Differential Diagnosis and Clinical Risk Factors**",
        (
            "- Consider sarcopenia risk if low muscle volume is confirmed against appropriate reference ranges and paired with reduced strength or performance."
        ),
        "- Consider myosteatosis/fatty infiltration when IMF, IMAT, or fat-to-muscle ratios are elevated.",
        "- Consider sarcopenic obesity or adverse body-composition risk if adipose volume and fat-to-muscle ratios are elevated clinically.",
        "- Consider insulin resistance, type 2 diabetes risk, metabolic syndrome, cardiovascular risk, mobility limitation, fall/frailty risk, and functional decline as correlation targets.",
        "",
        "5) **Treatment and Management Recommendations**",
        "- Progressive resistance training and physiotherapy assessment if weakness, low function, or low muscle volume is suspected.",
        "- Nutrition review with attention to adequate protein intake and weight-management goals.",
        "- Aerobic activity and cardiometabolic risk-factor management as clinically appropriate.",
        "- Review fall risk, mobility limitations, pain, and activities of daily living if sub-muscle asymmetry or low muscle reserve is present.",
        "- Clinician review before making diagnostic or treatment decisions from imaging volumes alone.",
        "",
        "6) **Recommended Diagnostic Tests**",
        "- Lipid profile, fasting glucose, and HbA1c to evaluate cardiometabolic risk.",
        "- Blood pressure, waist circumference, and weight/BMI measurement because demographics/body size are missing.",
        "- Grip strength, gait speed, chair-stand testing, dynamometry, or formal physical performance assessment for muscle strength/function.",
        "- Consider DXA or BIA for appendicular lean mass/body-composition correlation when clinically appropriate.",
        "- Dietary assessment, vitamin D testing, and fall-risk review when clinically relevant.",
        "",
        f"Metric source: {source or 'unknown'}.",
    ]
    if llm_error:
        lines.extend(
            [
                "",
                f"Local LLM note: generation was unavailable, so a rule-based summary was used instead ({llm_error}).",
            ]
        )
    return "\n".join(lines)


def build_abdomen_fallback_volumetric_summary(source, metrics, llm_error=None, analysis=None):
    context = build_abdomen_report_context(analysis, source, metrics)
    volumes = context["core_volumes"]
    ratios = context["ratios"]
    lines = [
        "Patient Report",
        "",
        "1) **Introduction**",
        (
            "This report summarizes the computed abdominal adipose tissue measurements as clinical-support context "
            "for body-fat distribution and cardiometabolic risk review."
        ),
        "",
        "2) **Clinical Observations**",
        f"- VAT volume is **{volumes['VAT volume']}** cc. VAT represents visceral adipose tissue and can support cardiometabolic risk stratification when elevated.",
        f"- DSAT volume is **{volumes['DSAT volume']}** cc. DSAT represents deep subcutaneous adipose tissue and may carry higher metabolic risk than superficial subcutaneous fat.",
        f"- SSAT volume is **{volumes['SSAT volume']}** cc. SSAT represents superficial subcutaneous adipose tissue and should be interpreted alongside VAT and DSAT.",
        f"- Total subcutaneous fat volume is **{volumes['Total subcutaneous fat volume']}** cc when DSAT and/or SSAT are available.",
        f"- Total abdominal fat volume is **{volumes['Total abdominal fat volume']}** cc when VAT, DSAT, and/or SSAT are available.",
        "",
        "3) **Diagnostic Insights based on VAT, DSAT, and SSAT**",
        (
            f"- VAT/Total abdominal fat ratio is **{ratios['VAT/Total abdominal fat']}**, VAT/Subcutaneous fat ratio is "
            f"**{ratios['VAT/Subcutaneous fat']}**, VAT/SSAT ratio is **{ratios['VAT/SSAT']}**, DSAT/SSAT ratio is "
            f"**{ratios['DSAT/SSAT']}**, and DSAT/Subcutaneous fat ratio is **{ratios['DSAT/Subcutaneous fat']}**."
        ),
        "- Higher visceral or deep subcutaneous fat relative to superficial fat can support concern for adverse abdominal fat distribution and cardiometabolic risk.",
        "- Imaging volumes alone do not diagnose diabetes, metabolic syndrome, cardiovascular disease, or fatty liver disease.",
        "",
        "4) **Differential Diagnosis and Clinical Risk Factors**",
        "- Consider central adiposity and visceral adiposity risk when VAT is elevated relative to subcutaneous fat.",
        "- Consider insulin resistance, type 2 diabetes risk, metabolic syndrome risk, cardiovascular risk, fatty liver risk, systemic inflammation risk, and functional/metabolic decline as clinical correlation targets.",
        "",
        "5) **Treatment and Management Recommendations**",
        "- Clinician-led cardiometabolic risk review before making diagnostic or treatment decisions from imaging volumes alone.",
        "- Nutrition review and weight-management planning when abdominal adiposity is clinically elevated.",
        "- Aerobic activity and resistance training as clinically appropriate for cardiometabolic risk reduction.",
        "- Review sleep, alcohol intake, medications, and comorbidities when clinically relevant.",
        "",
        "6) **Recommended Diagnostic Tests**",
        "- Fasting glucose, HbA1c, and lipid profile to evaluate cardiometabolic risk.",
        "- Blood pressure and waist circumference measurement for central adiposity and metabolic syndrome screening.",
        "- Liver enzymes and liver fat assessment when fatty liver risk is suspected.",
        "- Fasting insulin or inflammatory markers such as hs-CRP when clinically appropriate.",
        "",
        f"Metric source: {source or 'unknown'}.",
    ]
    if llm_error:
        lines.extend(
            [
                "",
                f"Local LLM note: generation was unavailable, so a rule-based summary was used instead ({llm_error}).",
            ]
        )
    return "\n".join(lines)
