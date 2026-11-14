# HackForge System Architecture & API Reference

## Database Schema (15 Normalized Tables)
Defined in `src/db/schema.ts`:
- `users`, `profiles`, `skills`, `user_skills`
- `teams`, `team_members` (with `UNIQUE(team_id, user_id)`), `team_requirements`
- `invitations`, `waitlist_entries`
- `compatibility_scores`, `team_health`
- `leadership_history`, `notifications`, `audit_logs`, `event_settings`

## Key API Endpoints
- **Auth**: `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/firebase`, `POST /api/auth/logout`, `GET /api/auth/me`, `POST /api/auth/refresh`, `POST /api/auth/forgot-password`, `POST /api/auth/reset-password`
- **Profiles & Skills**: `GET/PUT /api/users/profile`, `GET /api/users`, `GET/POST /api/skills`, `GET /api/notifications`
- **Teams & Race-Proof Join**: `GET/POST /api/teams`, `GET/PUT/DELETE /api/teams/:id`, `POST /api/teams/:id/join`, `POST /api/teams/:id/leave`, `GET/POST /api/teams/:id/health`
- **Compatibility, Waitlist & Invitations**: `GET /api/compatibility/users/:id`, `GET /api/compatibility/teams/:id`, `POST/GET /api/teams/:id/waitlist`, `POST /api/waitlist/:id/accept`, `POST /api/waitlist/:id/decline`, `POST/GET /api/invitations`
- **Leadership**: `POST /api/teams/:id/leadership/secondary`, `POST /api/teams/:id/leadership/transfer`, `GET /api/teams/:id/leadership/history`
- **Admin & Concurrency Lab**: `GET /api/admin/dashboard`, `GET /api/admin/fairness`, `GET /api/admin/audit-logs`, `GET/PUT /api/admin/settings`, `POST /api/admin/concurrency-test`
