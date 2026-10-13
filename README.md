# WhatsApp Attendance Bot

A backend application for employee attendance management through WhatsApp, with a manager dashboard planned for a later phase.

## Technology

- Node.js
- TypeScript
- Express 5
- MongoDB and Mongoose
- Zod
- Pino
- Vitest and Supertest

## Development

Install dependencies:

```bash
npm install
```

Start the development server:

```bash
npm run dev
```

Run type checking:

```bash
npm run typecheck
```

Run tests:

```bash
npm test
```

Build for production:

```bash
npm run build
```

Start the production build:

```bash
npm start
```

## Architecture

The application uses a modular monolith architecture. Feature-specific business logic lives under `src/modules`, shared infrastructure lives under `src/common`, and application configuration lives under `src/config`.

## Project status

Initial project scaffolding. Backend foundation and business features have not yet been implemented.
