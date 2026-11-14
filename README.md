# HackForge — Build Balanced Teams. Not Random Teams.

**Problem Statement:** PS1 – Race-Proof Team Formation at Scale  
**Project Owner:** Vedant Dalvi · Shree L.R. Tiwari College of Engineering  

HackForge is an intelligent full-stack team formation platform backed by PostgreSQL (Cloud SQL), Drizzle ORM, Express, Socket.IO, Firebase Authentication, React, Tailwind CSS, and Recharts.

## Six Core Innovations

1. **Race-Proof Team Formation Engine** — Uses PostgreSQL ACID transactions and `SELECT ... FOR UPDATE` row-level locking paired with a `UNIQUE(team_id, user_id)` database constraint to prevent last-seat overbooking under simultaneous requests.
2. **Explainable Compatibility Engine** — Deterministic weighted scoring: `(Skill Match × 0.35) + (Role Complementarity × 0.25) + (Experience × 0.15) + (Project Interest × 0.15) + (Collaboration × 0.10)`.
3. **Team Health Engine** — Continuous team balance diagnostics: `(Skill Coverage × 0.35) + (Role Coverage × 0.30) + (Experience Balance × 0.15) + (Leadership Readiness × 0.10) + (Requirement Fulfillment × 0.10)`.
4. **Smart Waitlist System** — Fair FIFO queue ordering on full teams with automatic seat promotion when vacancies open and race-proof acceptance.
5. **Leadership Succession** — Supports secondary leader designation, transactional authority transfer, and automatic succession if a primary leader exits.
6. **Fairness Dashboard & Audit Logs** — Administrative analytics across waitlist queues, invitation acceptance rates, skill distributions, unassigned roles, and immutable PostgreSQL audit records.

## Architecture & Tech Stack

- **Frontend:** React 19, TypeScript, Tailwind CSS v4, Recharts, Lucide Icons, Socket.IO Client
- **Backend:** Express.js, Socket.IO, Drizzle ORM (`node-postgres` Pool), Firebase Admin SDK, bcryptjs, JWT
- **Database:** Cloud SQL PostgreSQL (15 normalized tables in `src/db/schema.ts`)

## Demo Credentials (Development Only)

All demo accounts share password: `HackForge@2026`

- **Admin Console:** `admin@hackforge.demo`
- **Team Leader:** `leader@hackforge.demo`
- **Participant 1 (AI/ML):** `participant1@hackforge.demo`
- **Participant 2 (UI/UX):** `participant2@hackforge.demo`
- **Participant 3 (Full-Stack):** `participant3@hackforge.demo`

## Running Locally & Testing

```bash
npm install
npm run dev       # Starts Express + Vite + Socket.IO on port 3000
npm test          # Runs 31 automated unit & integration tests (including 50-user concurrency blast)
npm run build     # Production frontend bundle
npm run lint      # TypeScript type-check
```

## Concurrency Lab Verification

Sign in as `admin@hackforge.demo` → **Concurrency Lab** → click **RUN 50-USER TEST**.  
The backend resets `Concurrency Lab Vault` (`maxCapacity = 5`, `4` existing members, `1` open seat) and fires **50 simultaneous HTTP POST `/api/teams/:id/join` requests** using 50 distinct JWTs, verifying `1` winner, `49` rejected (`409 TEAM_FULL`), final count `5`, and `0` overbooking.

## Load Testing

A `k6` script is provided in `load-tests/k6-script.js`. Note that proposed 10,000-user / 2,000-team targets require executing `k6 run load-tests/k6-script.js` against a provisioned production cluster.
