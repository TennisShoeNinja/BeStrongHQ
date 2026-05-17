<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes: APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

<!-- BeStrong frontend conventions -->
# BeStrong frontend

- All API calls go through the `APIClient` class in `src/lib/api.ts`. Never use
  raw `fetch`/`axios` in components.
- Match the existing design system and dark-mode-first styling; do not restyle
  existing components or introduce new UI patterns.
- Recharts: always give chart containers a numeric pixel width/height. A `-1`
  on either dimension triggers a runtime warning.
- The athlete detail route renders a separate `MobileAthleteDetail` below the
  `md` breakpoint; some charts are desktop-only. Keep that split intact.
