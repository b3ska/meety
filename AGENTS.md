<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

PROJECT OVERVIEW:

AI meeting intelligence platform (web dashboard) with a persistent memory layer across employees, projects, and the company.

Core Features:

Meeting transcription + storage (the memory backbone) — Muninn DB
Context-aware summaries tailored to meeting type, department, and project
Personal performance tracker — talk time %, participation quality, KPIs, personalised recommendations
Automated task generation (editable by the employee)
Self-reflection / mental health layer — burnout signals, communication pattern trends — for MVP, simplest tracking only, or skip entirely
Web dashboard with a personalised AI chat interface (aware of employee projects and company context; likely separate Muninn vaults — needs research on efficient setup)

MVP scope — upload recording → transcribe (AssemblyAI Universal-3 Pro, with speaker diarization) → summarise (meeting-type-aware, Gemini 3.5 flash via OpenRouter) → participation metrics (from diarized utterances + timestamps) → per-employee snapshot + tasks → Muninn memory DB → dashboard UI.

Post-MVP — Google Meet / Zoom live integration, realtime streaming transcription, burnout detection, video analysis, speaker-to-employee auto-mapping from calendar.

Hackathon angle — covers all three required pillars (Input / Agent / Output), solves a universally relatable pain point, and the demo flow is clean and end-to-end deliverable within scope.