"""Streamlit demo app: upload 5MAP and generate evaluation report."""

from __future__ import annotations

import streamlit as st

from app.pipeline import (
    create_session_output_dir,
    run_ui_pipeline,
    save_text_input_document,
    save_uploaded_bytes,
)


# ── Report renderer ────────────────────────────────────────────────────────────

_REPORT_CSS = """
<style>
.report-doc {
    font-family: 'Georgia', serif;
    font-size: 15px;
    line-height: 1.75;
    color: #1a1a1a;
    max-width: 820px;
    margin: 0 auto;
    padding: 40px 48px;
    background: #ffffff;
    border: 1px solid #dde1e7;
    border-radius: 4px;
}
.report-doc h1 {
    font-size: 22px;
    font-weight: 700;
    color: #0f172a;
    border-bottom: 2px solid #0f172a;
    padding-bottom: 10px;
    margin-bottom: 6px;
    letter-spacing: 0.01em;
}
.report-doc .report-meta {
    font-family: 'Courier New', monospace;
    font-size: 12px;
    color: #64748b;
    margin-bottom: 32px;
    line-height: 1.8;
}
.report-doc h2 {
    font-size: 15px;
    font-weight: 700;
    color: #0f172a;
    text-transform: uppercase;
    letter-spacing: 0.07em;
    margin-top: 36px;
    margin-bottom: 10px;
    padding-bottom: 4px;
    border-bottom: 1px solid #cbd5e1;
}
.report-doc p {
    margin: 0 0 14px 0;
    color: #1e293b;
}
.report-doc table {
    width: 100%;
    border-collapse: collapse;
    font-size: 13.5px;
    margin: 12px 0 20px 0;
    font-family: 'Arial', sans-serif;
}
.report-doc th {
    background: #f1f5f9;
    color: #374151;
    font-weight: 700;
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    padding: 9px 12px;
    text-align: left;
    border: 1px solid #cbd5e1;
}
.report-doc td {
    padding: 8px 12px;
    border: 1px solid #e2e8f0;
    color: #1e293b;
    vertical-align: top;
}
.report-doc tr:nth-child(even) td { background: #f8fafc; }
.report-doc ul, .report-doc ol {
    padding-left: 22px;
    margin: 0 0 14px 0;
}
.report-doc li { margin-bottom: 5px; color: #1e293b; }
.report-doc code {
    font-family: 'Courier New', monospace;
    font-size: 12.5px;
    background: #f1f5f9;
    padding: 1px 5px;
    border-radius: 3px;
    color: #0f172a;
}
.report-doc hr {
    border: none;
    border-top: 1px solid #cbd5e1;
    margin: 32px 0;
}
.report-score-banner {
    background: #0f172a;
    color: #f1f5f9;
    border-radius: 6px;
    padding: 18px 24px;
    margin-bottom: 28px;
    display: flex;
    align-items: center;
    gap: 32px;
    flex-wrap: wrap;
}
.report-score-banner .score-num {
    font-size: 38px;
    font-weight: 800;
    line-height: 1;
}
.report-score-banner .score-label {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: #94a3b8;
    margin-bottom: 4px;
}
.report-score-banner .band-text {
    font-size: 14px;
    font-weight: 600;
}
</style>
"""


def _band_colour(total: float) -> str:
    if total >= 4.0:
        return "#16a34a"
    if total >= 3.0:
        return "#d97706"
    return "#dc2626"


def _render_report(result: dict) -> None:
    total = result["total_weighted_score"]
    band = result["interpretation_band"]
    colour = _band_colour(total)

    # Read the generated markdown — this IS the report document
    report_md = result["report_md_path"].read_text(encoding="utf-8")

    if result["low_confidence_sections"]:
        st.warning("Section boundaries were ambiguous — review Q1-Q5 assignments before sharing.")

    # Score banner above the document
    st.markdown(_REPORT_CSS, unsafe_allow_html=True)
    st.markdown(
        f"""
        <div class="report-score-banner">
            <div>
                <div class="score-label">Overall Score</div>
                <div class="score-num" style="color:{colour};">{total:.2f}
                    <span style="font-size:18px;color:#64748b;"> / 5.00</span>
                </div>
            </div>
            <div>
                <div class="score-label">Rating</div>
                <div class="band-text" style="color:{colour};">{band}</div>
            </div>
        </div>
        """,
        unsafe_allow_html=True,
    )

    # Render the full report as one document
    st.markdown(
        f'<div class="report-doc">{_md_to_html(report_md)}</div>',
        unsafe_allow_html=True,
    )

    # Download buttons below the document
    st.markdown("<div style='margin-top:28px;'></div>", unsafe_allow_html=True)
    col1, col2, col3 = st.columns(3)
    with col1:
        st.download_button(
            "⬇ Download PDF",
            data=result["report_pdf_path"].read_bytes(),
            file_name="5map_evaluation.pdf",
            mime="application/pdf",
            use_container_width=True,
        )
    with col2:
        st.download_button(
            "⬇ Download Markdown",
            data=report_md,
            file_name="5map_evaluation.md",
            mime="text/markdown",
            use_container_width=True,
        )
    with col3:
        st.download_button(
            "⬇ Download JSON",
            data=result["report_json_path"].read_text(encoding="utf-8"),
            file_name="5map_evaluation.json",
            mime="application/json",
            use_container_width=True,
        )


def _md_to_html(md: str) -> str:
    """Convert the report markdown to clean HTML for inline rendering."""
    import re

    html = md

    # Headings
    html = re.sub(r"^# (.+)$", r"<h1>\1</h1>", html, flags=re.MULTILINE)
    html = re.sub(r"^## (.+)$", r"<h2>\1</h2>", html, flags=re.MULTILINE)
    html = re.sub(r"^### (.+)$", r"<h3>\1</h3>", html, flags=re.MULTILINE)

    # Metadata block (lines starting with "- Key: `value`")
    html = re.sub(
        r"((?:^- .+$\n?){2,})",
        lambda m: '<div class="report-meta">' + m.group(0).replace("\n", "<br>") + "</div>",
        html,
        flags=re.MULTILINE,
        count=1,
    )

    # Bold
    html = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", html)

    # Inline code
    html = re.sub(r"`([^`]+)`", r"<code>\1</code>", html)

    # Horizontal rule
    html = html.replace("\n---\n", "\n<hr>\n")

    # Tables — convert markdown pipe tables to HTML
    def _table(m: re.Match) -> str:
        lines = [l.strip() for l in m.group(0).strip().splitlines() if l.strip()]
        rows = [
            [c.strip() for c in line.strip("|").split("|")]
            for line in lines
            if not re.match(r"^\|?[-| :]+\|?$", line)
        ]
        if not rows:
            return m.group(0)
        head = rows[0]
        body = rows[1:]
        th = "".join(f"<th>{c}</th>" for c in head)
        trs = "".join(
            "<tr>" + "".join(f"<td>{c}</td>" for c in row) + "</tr>" for row in body
        )
        return f"<table><thead><tr>{th}</tr></thead><tbody>{trs}</tbody></table>"

    html = re.sub(
        r"(^\|.+\|$\n?)+",
        _table,
        html,
        flags=re.MULTILINE,
    )

    # Bullet lists
    def _list_block(m: re.Match) -> str:
        items = re.findall(r"^- (.+)$", m.group(0), re.MULTILINE)
        lis = "".join(f"<li>{i}</li>" for i in items)
        return f"<ul>{lis}</ul>"

    html = re.sub(r"(^- .+$\n?)+", _list_block, html, flags=re.MULTILINE)

    # Paragraphs — wrap orphan lines
    lines = html.splitlines()
    out: list[str] = []
    for line in lines:
        stripped = line.strip()
        if not stripped:
            out.append("")
        elif stripped.startswith("<"):
            out.append(stripped)
        else:
            out.append(f"<p>{stripped}</p>")
    html = "\n".join(out)

    return html


# ── Main ───────────────────────────────────────────────────────────────────────

def main() -> None:
    st.set_page_config(page_title="5MAP Intent Evaluator", layout="wide", page_icon="📊")

    # Global style overrides
    st.markdown(
        """
        <style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
        html, body, [class*="css"] { font-family: 'Inter', sans-serif; }
        .stButton > button { border-radius: 8px; font-weight: 600; }
        .stDownloadButton > button { border-radius: 8px; font-weight: 600; }
        .stTextArea textarea { font-family: 'Inter', sans-serif; font-size: 0.9rem; }
        .stRadio label { font-weight: 500; }
        div[data-testid="metric-container"] {
            background: #f8fafc; border: 1px solid #e2e8f0;
            border-radius: 8px; padding: 16px;
        }
        </style>
        """,
        unsafe_allow_html=True,
    )

    st.markdown(
        "<h1 style='font-size:1.7rem;font-weight:800;color:#0f172a;margin-bottom:4px;'>"
        "5MAP Intent Evaluator</h1>",
        unsafe_allow_html=True,
    )
    st.markdown(
        "<p style='color:#64748b;font-size:0.88rem;margin-top:0;'>"
        "Confidential · Test AI Version · Outputs are local only</p>",
        unsafe_allow_html=True,
    )

    with st.sidebar:
        st.markdown(
            "<div style='font-size:0.82rem;color:#475569;line-height:1.6;'>"
            "<strong>How it works</strong><br/>"
            "Upload a 5MAP (.pptx) or paste the text. "
            "The Test AI Version evaluates all 9 rubric dimensions "
            "and produces a scored report. Allow 2–4 minutes for a full evaluation."
            "</div>",
            unsafe_allow_html=True,
        )

    input_mode = st.radio(
        "Input method",
        ["Upload file (.pptx / .json)", "Paste text"],
        horizontal=True,
    )

    map_file = None
    pasted_text = ""

    if input_mode == "Upload file (.pptx / .json)":
        map_file = st.file_uploader(
            "Upload your 5MAP file",
            type=["pptx", "json"],
            help="Accepted formats: .pptx (PowerPoint) or pre-parsed .json",
        )
    else:
        st.markdown(
            "<p style='font-size:0.88rem;color:#475569;margin:4px 0 8px 0;'>"
            "Paste the full content of your 5MAP. You can include Q labels "
            "(<code>Q1:</code>, <code>Q2:</code> etc.) or paste raw text — "
            "the system will identify sections automatically."
            "</p>",
            unsafe_allow_html=True,
        )
        pasted_text = st.text_area(
            "Paste 5MAP content",
            height=420,
            placeholder=(
                "Paste the full content of your 5MAP here.\n\n"
                "With labels:\nQ1: [Context and higher intent]\nQ2: [Intent and KPIs]\n"
                "Q3: [Implied tasks]\nQ4: [Boundaries]\nQ5: [Backbrief]\n\n"
                "Or just paste raw text — the AI will identify each section."
            ),
            label_visibility="collapsed",
        )

    higher_intent_file = st.file_uploader(
        "Optional: higher intent document (.pptx / .json)",
        type=["pptx", "json"],
        help="If available, upload your boss's intent document for alignment scoring.",
    )

    st.markdown("<div style='margin-top:8px;'></div>", unsafe_allow_html=True)

    if st.button("Generate Evaluation Report", type="primary", use_container_width=True):
        if input_mode == "Upload file (.pptx / .json)" and map_file is None:
            st.warning("Please upload a 5MAP file.")
            return
        if input_mode == "Paste text" and not pasted_text.strip():
            st.warning("Please paste your 5MAP content before generating a report.")
            return

        result = None
        with st.status("Starting evaluation…", expanded=True) as status:
            try:
                status.update(label="Setting up session…")
                st.write("⚙️ Creating session workspace…")
                session_dir = create_session_output_dir()

                if input_mode == "Upload file (.pptx / .json)":
                    st.write("📂 Saving uploaded file…")
                    map_path = save_uploaded_bytes(session_dir, map_file.name, map_file.getvalue())
                else:
                    st.write("🔍 Identifying Q1–Q5 sections from pasted text…")
                    status.update(label="Identifying 5MAP sections…")
                    map_path = save_text_input_document(session_dir, pasted_text=pasted_text)

                higher_path = None
                if higher_intent_file is not None:
                    st.write("📂 Saving higher intent document…")
                    higher_path = save_uploaded_bytes(
                        session_dir, higher_intent_file.name, higher_intent_file.getvalue()
                    )

                st.write("🤖 Scoring all 9 rubric dimensions (this takes 2–4 minutes)…")
                status.update(label="Scoring dimensions with Test AI Version…")
                result = run_ui_pipeline(
                    map_path=map_path,
                    session_dir=session_dir,
                    higher_intent_path=higher_path,
                    use_llm=True,
                )

                st.write("📝 Building report…")
                status.update(label="Evaluation complete ✓", state="complete", expanded=False)

            except Exception as exc:  # pragma: no cover
                status.update(label="Evaluation failed", state="error", expanded=True)
                st.error(f"Error: {exc}")

        if result is not None:
            st.divider()
            _render_report(result)


if __name__ == "__main__":
    main()
