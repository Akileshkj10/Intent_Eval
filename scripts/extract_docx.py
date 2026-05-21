"""Extract plain text from docx files to UTF-8 .txt for review."""
import zipfile
import xml.etree.ElementTree as ET
import os
import sys

W_NS = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"
W_T = W_NS + "t"


def extract_docx(path: str) -> str:
    with zipfile.ZipFile(path) as z:
        root = ET.fromstring(z.read("word/document.xml"))
    parts = []
    for t in root.iter(W_T):
        if t.text:
            parts.append(t.text)
        if t.tail:
            parts.append(t.tail)
    return " ".join(parts)


def main() -> None:
    base = sys.argv[1] if len(sys.argv) > 1 else os.path.dirname(os.path.dirname(__file__))
    onedrive = os.path.join(base, "OneDrive_1_5-21-2026")
    for name in sorted(os.listdir(onedrive)):
        if not name.endswith(".docx"):
            continue
        path = os.path.join(onedrive, name)
        text = extract_docx(path)
        out = os.path.join(onedrive, name.replace(".docx", "_extracted.txt"))
        with open(out, "w", encoding="utf-8") as f:
            f.write(text)
        print(out, len(text))


if __name__ == "__main__":
    main()
