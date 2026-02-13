# Repository Guidelines

## Project Structure & Module Organization
- Entry point `index.js` runs Express/Socket.IO, wires MongoDB, OpenAI, and LINE/Facebook, and renders admin UI via EJS under `views/`.
- Static assets live in `public/` (`css`, `js`, `assets/`); shared colors and variables in `public/css/theme.css`, base components in `public/css/components.css`, page-specific CSS can live alongside.
- External integrations stay in `services/`; cross-cutting helpers in `utils/`; maintenance scripts (e.g., cleanups) in `scripts/`.
- Design notes and theme specs sit in `docs/`.

## Build, Test, and Development Commands
- `npm install` (Node >=18) installs dependencies.
- `npm run dev` starts the server with nodemon auto-reload for local work.
- `npm start` runs the production-style server.
- `npm run build` placeholder (no build step yet).
- `node scripts/drop-legacy-facebook-comment.js` only when you intentionally need to purge old FB comment data.

## Coding Style & Naming Conventions
- JavaScript: semicolons required, 2-space indentation, prefer `const`/`let`; use `async/await` over promise chains.
- Naming: assets/files use kebab-case; variables/functions in camelCase; classes/constructors in PascalCase.
- UI: use CSS variables from `theme.css` (e.g., `var(--color-primary-500)`) and shared pieces from `components.css`; keep shared layouts/menus as EJS partials in `views/admin/partials/`.

## Testing Guidelines
- No global test suite yet; if adding important logic, place Jest tests near the module (e.g., `services/__tests__/foo.test.js`).
- For UI changes, run `npm run dev` and manually verify key flows (chat, broadcast, orders, settings); include steps or screenshots in PRs.

## Commit & Pull Request Guidelines
- Commits: short imperative titles (Thai/English both okay), one feature/bugfix per commit (e.g., `ปรับ theme chat ใหม่`, `fix follow-up timezone`).
- PRs: state purpose, schema/script changes, new env vars, and testing steps; attach relevant UI screenshots.
- Keep secrets in `.env` (see `env.example`); check `index.js` for any new endpoints/config needs before sharing.

## Security & Configuration Tips
- Never hardcode keys; load via `.env` for OpenAI, Mongo, LINE/Facebook.
- Preserve input sanitization, `helmet`, and rate limiting on new routes.
- If serving assets from a CDN, configure `PUBLIC_BASE_URL` and set SRI/versioning for `public/assets/*`.
