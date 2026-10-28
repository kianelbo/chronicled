# chronicled

Chronicled is an event marker for your organization. It allows to record the events in your company such as incidents or releases and visualizes
the timeline of events.

## Quick start

You need Node 24+ and a PostgreSQL database.

Create an env file in the repository root:
```bash
cp .env.example .env
```
Set `DATABASE_URL` to your PostgreSQL connection string and replace `JWT_SECRET` with a long secure value. Write `.env` values without surrounding quotes, especially when passing the file to Docker with `--env-file`. The backend loads this root `.env`; the frontend needs no separate environment file.

**Development** — run each command group in its own terminal:

backend (port 5000):
```bash
cd backend
npm ci
npx drizzle-kit push   # create/update the tables
npm run dev
```

frontend (port 5173):
```bash
cd frontend
npm ci
npm run dev
```

Open http://localhost:5173. The frontend sends API requests to same-origin `/api`, and Vite proxies them to the backend during development. Production serves the frontend and API from the same origin as well, so no frontend API URL configuration is needed.

## Deployment

The production backend serves the compiled frontend and API from one process and one origin. Ensure the PostgreSQL database is reachable and its schema is up to date (the development setup's `npx drizzle-kit push` command can create/update the tables). Then build and run the combined Docker image from the repository root:

```bash
cp .env.example .env                 # set production DATABASE_URL and a unique JWT_SECRET
docker build -t chronicled .
docker run --env-file .env -p 5000:5000 chronicled
```

The image contains both the backend and frontend; PostgreSQL remains an external service configured through `DATABASE_URL`. Docker passes the variables from `.env` directly to the container at runtime; the app does not need an `.env` file inside the image. Set `CORS_ORIGINS` only when browser clients on other origins need API access.

When running PostgreSQL locally rather than on a public database host or in a Docker network, use `host.docker.internal` as the database hostname in the connection string (for example, `postgres://user:password@host.docker.internal:5432/chronicled`).

## Concepts

- **Event**: a `release` or an `incident`, with a title, description, tags, a start time and an optional end time. No end time means a point in time.
- **Group**: owns events and members.
- **Access levels**: `viewer` reads, `editor` also creates, edits and deletes events, `owner` also manages members.

## API

All routes are under `/api` and, except register and login, need `Authorization: Bearer <token>`.

| Route | |
| --- | --- |
| `POST /auth/register`, `POST /auth/login`, `GET /auth/me` | Auth (JWT, 7 days) |
| `GET /groups`, `POST /groups` | Your groups, create a group |
| `GET/POST /groups/:id/members`, `PATCH/DELETE /groups/:id/members/:userId` | Manage members (owners) |
| `GET /events`, `POST /events` | List (optional `groupId`, `type`, `from`, `to`), create |
| `GET/PATCH/DELETE /events/:id` | Read, edit, delete |

## Frontend

- Fetches `GET /events` once; filtering, sorting and zoom run in the browser.
- Timeline: lanes, pan and zoom, overview strip, release lines. Log: notebook-style list by day.
- Pages for groups, members and roles, people, and your account.
- Auth lives in `src/stores/auth.ts` and the login and register views, so moving to OAuth touches little else.

## Stack
* Frontend: [Vue3](https://vuejs.org/)
* CSS: [Tailwind](https://tailwindcss.com/)
* Backend: [Express](https://expressjs.com/)
* DB: [Postgres](https://www.postgresql.org/)
* ORM: [Drizzle](https://orm.drizzle.team/)
