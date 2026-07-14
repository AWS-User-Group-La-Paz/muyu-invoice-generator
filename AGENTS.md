# Repository Guidelines

## Project Structure & Module Organization

This is a server-rendered Node.js/Express invoice application. Keep application entry points in `src/`: `web.js` serves HTTP routes and `worker.js` processes queued PDF jobs. Put shared integrations in `src/services/` (database, queue, storage, email, PDF, calculations, and logging). EJS templates live in `views/`; browser assets belong in `public/`. Unit tests mirror the code area in `tests/unit/`, for example `src/services/queue.js` is covered by `tests/unit/queue.test.js`.

## Build, Test, and Development Commands

- `npm install` installs locked dependencies.
- `mise run local-setup` starts PostgreSQL, LocalStack, and Mailpit, then creates the local queue.
- `mise run dev` and `mise run dev-worker` run the web process and worker with file watching; use separate terminals.
- `npm test -- --runInBand` runs Jest with coverage without requiring Docker or cloud services.
- `npm run lint` checks formatting and lint rules with Biome; `npm run format` applies safe fixes.
- `mise run local-reset` recreates local services and **deletes local data and volumes**.

## Coding Style & Naming Conventions

Write plain CommonJS JavaScript and keep modules small and direct. Biome is authoritative: use tabs for indentation and double quotes. Name files by role in lowercase (for example, `src/services/email.js`); use `camelCase` for variables and functions. Keep HTTP handling in `web.js`, job orchestration in `worker.js`, and side-effecting integrations in their service module.

## Testing Guidelines

Use Jest and Supertest. Place tests in `tests/unit/` as `*.test.js`, with focused names such as `worker.test.js`. Mock PostgreSQL, AWS SDK, storage, and email boundaries; tests should remain runnable without external services. The Jest configuration enforces 80% global coverage for statements, branches, functions, and lines. Run the relevant test and `npm run lint` before opening a pull request.

## Commit & Pull Request Guidelines

Follow the existing concise Conventional Commit style: `feat: ...`, `fix(docker): ...`, `docs: ...`, `test: ...`, or `ci: ...`. Keep each commit scoped to one change. Pull requests should explain the behavior change, link the issue when applicable, list validation performed, and include screenshots for UI/template changes. Call out environment, schema, queue, storage, or email-impacting changes explicitly.

## Security & Configuration

Do not commit credentials. Production configuration comes from environment variables and AWS IAM roles; see `README.md` for required values and least-privilege permissions. Keep the app private or SES-sandboxed: the editable email cookie is not authentication.
