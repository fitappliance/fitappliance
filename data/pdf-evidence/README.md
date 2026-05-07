# PDF evidence storage

This directory is reserved for local manufacturer PDF evidence used by the Phase 53 manual/spec extraction workflow.

Do not commit raw product manuals by default. Store large or copyrighted PDFs on the local evidence disk and commit only extracted, reviewed JSON candidates in a later PR.

Recommended local layout:

```text
data/pdf-evidence/
  fridge/
    bosch-b36fd52sns/
      source.pdf
      extracted.json
      review-notes.md
```

The B1 test fixture is a compact synthetic PDF derived from Bosch public spec-sheet facts and lives under `tests/pdf-pipeline/fixtures/`.
