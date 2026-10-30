# MD Decision Lab — working rules

## V2 workspace boundary
- This is the V2 development copy. The sibling `MD_Decision_Lab` directory is the frozen V1; never edit or run write operations against V1.
- Local H&M source ZIPs are shared read-only originals. Use this copy's independent database and extracted photos.
- Preserve analytical services and SQLite table definitions. Hosted isolation is provided by a separate SQLite database per validated Supabase user or signed demo session.
- Keep local databases, H&M images/data and credentials out of Git and deployment images. No production Supabase project or public host is configured yet.

## Product objective
Help a small commerce MD turn product-level sales and stock data into traceable replenishment, promotion, and live-exposure decisions. The first version is a portfolio demonstrator and must not claim proven revenue gains.

## Roles
- Codex owns product decisions, architecture, domain logic, and primary implementation.
- Gemini is a reviewer and secondary helper. Ask it to inspect changes, identify edge cases, and suggest focused fixes. Do not let two agents edit the same files at the same time.

## Domain rules
- Show the numbers and rule behind every stock-risk label and recommendation.
- Clearly distinguish measured input data from estimates and suggested actions.
- Do not describe a recommendation as an observed business result.
- Do not add automatic publishing, real customer data, or external AI API calls in the MVP.

## Implementation
- Frontend: React + TypeScript + Vite.
- Backend: FastAPI + SQLAlchemy + SQLite for the local demonstrator.
- Keep calculations in backend services, not in React components.
- Use synthetic demonstration data and label it as such.
- Prefer small, reviewable changes. Preserve existing user data and never overwrite an existing database on startup.

## Portfolio honesty
Describe the project owner's role as problem framing, workflow and rule definition, AI-assisted implementation direction, and output review unless they personally performed additional coding. Never attribute AI-generated code to the owner as unaided coding work.
