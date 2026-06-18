# Briefly — Product Requirements (Living)

## Original Problem Statement
User shared a Flask AI chat application (`Briefly`) with auth, conversations, Gemini-powered chat with RAG, and a Document Analyzer. Requested progressively:
1. Modern UI + mobile responsive + auto-create conversation + fix search highlight.
2. New Document Maker (real downloadable docx/xlsx/pdf/pptx/txt/md using Python libs).
3. SSE streaming + full markdown rendering + new chat bubble layout (right-aligned user, left-aligned AI, names + timestamps + date dividers) + drag-and-drop on the Analyzer + persistent Analyzer history.
4. (This iteration) Multi-template resume (default = simple, black text, only hyperlinks colored); icon for Document Analyzer; rename "Chats" → "AI Chat"; **NEW: Scribe (Word-like text editor)** and **Gridly (Excel-like spreadsheet)** under Document Maker concept — both with renamed menu tabs, save-as-draft persistence, history list, edit/delete, and exports (Scribe → PDF/DOCX/DOC/TXT; Gridly → XLSX/CSV).

## Architecture
- **Backend (`/app/backend`, port 8001)** — Flask wrapped as ASGI via `a2wsgi`, served by `uvicorn server:app`. SQLite at `src/chat_app.db`.
- **Frontend (`/app/frontend`, port 3000)** — Static HTML/CSS/JS served by `serve` (Node). All API calls go to `/api/*` via ingress.
- **LLM** — Google Gemini (`gemini-2.5-flash`) via `google-genai`. Streaming via `generate_content_stream`.

## Tables (SQLite)
- `users`, `conversations`, `messages` (original)
- `analyzed_documents` (added) — Document Analyzer history
- `editor_drafts` (added) — Scribe + Gridly drafts, columns `(id, user_id, kind, title, content, created_at, updated_at)`

## Endpoints
- Auth & profile (`/api/login`, `/api/register`, `/api/logout`, `/api/user`, `/api/profile/*`)
- Conversations (`/api/conversations*`) and **SSE chat** (`/api/chat/stream`)
- Document Analyzer: `/api/upload-document`, `/api/document-chat`, `/api/documents` (list/get/delete)
- Document Maker: `/api/document-maker/types`, `/api/document-maker/generate` (11 types × 6 formats)
- **Scribe + Gridly drafts**: `/api/editor/drafts` (GET list, POST create), `/api/editor/drafts/<id>` (GET/PUT), `/api/editor/drafts/<id>/delete`
- **Scribe export**: `POST /api/editor/export/text` → `pdf` | `docx` | `doc` | `txt`
- **Gridly export**: `POST /api/editor/export/sheet` → `xlsx` | `csv`

## Implemented (Jan 2026)
- Modern dark UI (emerald accent, Fraunces + Manrope + JetBrains Mono), mobile responsive, animated composer.
- Auto-create conversation on first message; SSE streaming with caret; markdown rendering (marked + DOMPurify).
- Chat bubbles redesigned: user right + name + initial avatar + time; AI left + "AI" label + sparkle avatar + time; date dividers (Today / Yesterday / Day before yesterday / weekday / formatted date).
- Document Analyzer: drag-and-drop upload, persistent history with delete, summary + topics + chat.
- Document Maker: 11 types × 6 formats. **Resume now has 3 templates** (Classic = default simple all-black, Modern = centered + divider, Compact = uppercase headings + bullets). Emails/phones/URLs are auto-detected and rendered as **blue underlined hyperlinks** in DOCX/PDF; everything else is plain black text.
- **Scribe (Text Editor)** — Word-like rich text editor:
  - Tabs renamed: **Style / Structure / Embed / Compose**.
  - Toolbar: bold/italic/underline/strike, font family + size, text + highlight color (Style); H1-H3 + paragraph + bullet/numbered list + indent + alignment + blockquote (Structure); link, table 2×2, image, HR (Embed); undo/redo/clear-format/clear-all (Compose).
  - Title bar, "New", "Save draft", "Export" dropdown (PDF / DOCX / DOC / TXT).
  - Drafts saved per user and shown in sidebar (SCRIBE DRAFTS). Click to load, trash to delete.
- **Gridly (Spreadsheet)** — Excel-like:
  - Tabs renamed: **Cells / Grid / Numbers**.
  - Cells: bold, italic, alignment (L/C/R), fill colors (none/yellow/blue/green).
  - Grid: add/remove rows & columns, clear all.
  - Numbers: format % / currency / SUM column above / AVG of column.
  - A1-style cell reference + formula bar.
  - Drafts saved per user as JSON `{rows, cols, cells}`; shown in sidebar (GRIDLY SHEETS).
  - Export: XLSX (openpyxl, numeric auto-detection), CSV (Python csv).

## Files of Interest
- `backend/app_flask.py` — All routes incl. `/api/editor/*`, `_html_to_docx_bytes`, `_html_to_pdf_bytes`, resume template helpers.
- `backend/src/database.py` — Added `analyzed_documents` + `editor_drafts` tables and helpers.
- `frontend/public/index.html` — Added Scribe & Gridly view sections + sidebar nav items + sidebar history sections.
- `frontend/public/static/css/style.css` — Added editor shell, tabs, toolbar, paper-styled canvas, spreadsheet table.
- `frontend/public/static/js/main.js` — New `ScribeEditor`/`GridlyEditor` classes; `loadDrafts`/`displayDrafts`; resume form with template selector.

## Next / Backlog
- P2: Cross-document search across saved Analyzer summaries.
- P2: Image upload (file) in Scribe (currently URL-only).
- P2: Real cell formulas in Gridly (SUM/AVG/MAX/MIN with reference syntax `=SUM(A1:A5)`).
- P2: Multi-sheet support in Gridly (tabs at bottom).
- P2: Public share link for generated documents.

## Notes for Future Sessions
- reCAPTCHA secret is real. Dev bypass: `DEBUG=True` in `.env` + `recaptcha_response="dev-bypass"`.
- Supervisor command lines are READ-ONLY. Frontend `yarn start` invokes `serve -s public -l tcp://0.0.0.0:3000` (defined in `frontend/package.json`).
- Gemini free tier: 20 req/day cap. Errors flow back through SSE as `event: error`.
