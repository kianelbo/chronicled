# chronicled

Chronicled is an event marker for your organization. It allows to record the events in your company such as incidents or releases and visualizes
the timeline of events.

## Quick start

You need Node 24+ and a PostgreSQL database.

**Backend** (port 5000)
```bash
cd backend
cp env.sample .env        # set DATABASE_URL and JWT_SECRET
npm install
npx drizzle-kit push      # create the tables (for the first time)
npm run dev
```

**Frontend** (port 5173)
```bash
cd frontend
cp env.sample .env        # VITE_API_URL defaults to http://localhost:5000/api
npm install
npm run dev
```

Open http://localhost:5173 and register. The backend's CORS only allows that origin, so keep the dev server on port 5173.

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
* DB: Postgres via [Supabase](https://supabase.com/)
* ORM: [Drizzle](https://orm.drizzle.team/)
