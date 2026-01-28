# plan.md

## 1. Goal

Build a scalable Telegram Movie Bot with analytics and admin management.

## 2. Core Features

* Welcome menu (inline keyboards)
* Movie search by numeric code
* Random movie
* Unique view counting (one user = one view per movie)
* Mandatory channel subscription
* Feedback (contact form)
* Referral tracking via /start payload
* Role-based admin system (ADMIN / SUPERADMIN)

## 3. User Roles

* USER: regular bot user
* ADMIN: manage movies and mandatory channels
* SUPERADMIN: full access, analytics, admin management

## 4. Development Phases

1. Infrastructure & project setup
2. Database schema design (Prisma)
3. Bot core implementation (grammY)
4. User interaction flows
5. Admin & Superadmin panels
6. Analytics & referral tracking
7. Caching & optimization

---

# architecture.md

## 1. High-level Architecture

Telegram Client
→ Telegram Bot API
→ grammY (Bot Layer)
→ NestJS Application Layer
→ Domain Services
→ Prisma ORM
→ PostgreSQL
→ Redis (state + cache)

## 2. Layers

### Bot Layer

* Update handlers (messages & callbacks)
* Inline keyboard routing
* State transitions

### Application Layer

* Business logic
* Validation & guards
* Role-based access control

### Data Layer

* Prisma ORM
* PostgreSQL (persistent data)
* Redis (ephemeral data)

## 3. State Management (Redis)

User state is stored in Redis:

* IDLE
* WAITING_MOVIE_CODE
* WAITING_FEEDBACK

Key format:

```
state:{telegramId}
```

## 4. Security & Consistency

* RoleGuard (ADMIN / SUPERADMIN)
* ChannelGuard (mandatory subscriptions)
* Database unique constraints
* Transaction-safe updates

---

# infra.md

## 1. Technology Stack

* Node.js 18+
* NestJS
* grammY
* PostgreSQL
* Prisma ORM
* Redis
* Docker (optional but recommended)

## 2. Environment Variables

```env
DATABASE_URL=postgresql://user:pass@host:5432/db
REDIS_URL=redis://host:6379
BOT_TOKEN=telegram_bot_token
SUPERADMIN_IDS=123456,789012
```

## 3. Redis Usage

* User state (FSM)
* Flood control / rate limiting
* Cached random movie

## 4. Deployment

* VPS (Hetzner / DigitalOcean)
* PM2 or Docker
* PostgreSQL managed or self-hosted
* Redis managed or self-hosted

---

# prompt.md

## Bot Behavior Rules

* Each user has exactly one active state
* Old bot messages should be deleted when moving between flows
* All interactions use inline keyboards
* Admins do NOT use slash commands
* User-facing errors are minimal and friendly
* Detailed errors go to logs

## Coding Rules

* Follow NestJS best practices
* Service-oriented architecture
* Use Prisma unique constraints and transactions
* Redis-first strategy for state and cache

---

# task.md (AI instructions)

## Global Task

Build a production-ready Telegram Movie Bot using:
NestJS + grammY + Prisma + PostgreSQL + Redis

## Functional Tasks

1. Implement /start handler with referral payload tracking
2. Welcome message with inline keyboard
3. Movie search flow using state machine
4. Numeric-only movie code validation
5. Random movie feature
6. Unique view system (MovieView table with unique constraint)
7. Feedback / contact system
8. Mandatory channel subscription logic
9. ADMIN & SUPERADMIN inline panels
10. Analytics: users, views, referrals

## Technical Constraints

* One user can increment view count for a movie only once
* Referral source is saved only on first /start
* Redis is mandatory for state handling
* No slash commands for admins

## Expected Output

* Clean NestJS project structure
* Prisma schema
* grammY bot handlers
* Redis integration
* Production-ready, scalable codebase
