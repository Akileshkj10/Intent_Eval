"""Streamlit demo app: upload 5MAP and generate report artefacts."""

from __future__ import annotations

import streamlit as st

from app.pipeline import (
    create_session_output_dir,
    run_ui_pipeline,
    save_text_input_document,
    save_uploaded_bytes,
)


def main() -> None:
    st.set_page_config(page_title="Intent Evaluator Demo", layout="wide")
    st.title("Intent Evaluator - Consultant Demo")
    st.caption(
        "Confidential: outputs are local-only and must not be stored on shared/unapproved servers."
    )

    with st.sidebar:
        st.header("Run options")
        st.markdown(
            "**Live Claude scoring is mandatory.** Report generation can take a few minutes "
            "because the app scores all dimensions and writes narrative sections."
        )

    input_mode = st.radio(
        "5MAP input mode",
        ["Upload file", "Paste text"],
        horizontal=True,
    )
    map_file = None
    pasted_text = ""
    q_fields = {
        "q1_context": "",
        "q2_intent": "",
        "q3_tasks": "",
        "q4_boundaries": "",
        "q5_backbrief": "",
    }
    if input_mode == "Upload file":
        map_file = st.file_uploader("Upload 5MAP (.pptx or parsed .json)", type=["pptx", "json"])
    else:
        st.markdown("Paste a single labelled block (`Q1:` ... `Q5:`), or fill the Q1-Q5 fields below.")
        pasted_text = st.text_area("Pasted labelled 5MAP text", height=180)
        col_a, col_b = st.columns(2)
        with col_a:
            q_fields["q1_context"] = st.text_area("Q1 Context and Higher Intent", height=120)
            q_fields["q2_intent"] = st.text_area("Q2 Intent and Measures of Success", height=120)
            q_fields["q3_tasks"] = st.text_area("Q3 Tasks and Main Effort", height=120)
        with col_b:
            q_fields["q4_boundaries"] = st.text_area("Q4 Boundaries", height=120)
            q_fields["q5_backbrief"] = st.text_area("Q5 Achievability and Backbrief", height=120)
    higher_intent_file = st.file_uploader(
        "Optional higher intent (.pptx or parsed .json)", type=["pptx", "json"]
    )

    has_text_input = bool(pasted_text.strip() or any(value.strip() for value in q_fields.values()))

    if st.button("Generate report", type="primary"):
        if input_mode == "Upload file" and map_file is None:
            st.warning("Please upload a 5MAP file.")
            return
        if input_mode == "Paste text" and not has_text_input:
            st.warning("Please paste labelled 5MAP text or fill at least one Q1-Q5 field.")
            return
        session_dir = create_session_output_dir()
        try:
            if input_mode == "Upload file":
                map_path = save_uploaded_bytes(session_dir, map_file.name, map_file.getvalue())
            else:
                map_path = save_text_input_document(
                    session_dir,
                    pasted_text=pasted_text,
                    **q_fields,
                )
            higher_path = None
            if higher_intent_file is not None:
                higher_path = save_uploaded_bytes(
                    session_dir, higher_intent_file.name, higher_intent_file.getvalue()
                )

            with st.spinner("Generating report with live Claude scoring..."):
                result = run_ui_pipeline(
                    map_path=map_path,
                    session_dir=session_dir,
                    higher_intent_path=higher_path,
                    use_llm=True,
                )
        except Exception as exc:  # pragma: no cover - UI path
            st.error(f"Run failed: {exc}")
            return

        st.success("Report generated.")
        st.metric("Total weighted score", f"{result['total_weighted_score']:.2f}")
        st.metric("Interpretation band", result["interpretation_band"])
        st.write(f"Session folder: `{result['session_dir']}`")
        if result["low_confidence_sections"]:
            st.warning("Low confidence: Q1-Q5 section boundaries were ambiguous in the input.")

        report_md = result["report_md_path"].read_text(encoding="utf-8")
        report_json = result["report_json_path"].read_text(encoding="utf-8")
        report_pdf = result["report_pdf_path"].read_bytes()
        st.download_button(
            "Download report.md",
            data=report_md,
            file_name="report.md",
            mime="text/markdown",
        )
        st.download_button(
            "Download report.json",
            data=report_json,
            file_name="report.json",
            mime="application/json",
        )
        st.download_button(
            "Download report.pdf",
            data=report_pdf,
            file_name="report.pdf",
            mime="application/pdf",
        )
        with st.expander("Preview report markdown"):
            st.code(report_md[:6000], language="markdown")


if __name__ == "__main__":
    main()
