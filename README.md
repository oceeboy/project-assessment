# Fintech Wallet API — System Design & Security Considerations

A NestJS-based fintech REST API handling user authentication, wallet management, and financial transactions, backed by **MySQL (InnoDB)**. This document explains the core architectural decisions, security model, and production readiness considerations.

---

## Table of Contents

1. [How Race Conditions Are Prevented](#1-how-race-conditions-are-prevented)
2. [How Idempotency Works](#2-how-idempotency-works)
3. [Locking Strategy](#3-locking-strategy)
4. [How SQL Injection Is Prevented](#4-how-sql-injection-is-prevented)
5. [What Would Change in Production](#5-what-would-change-in-production)
6. [How to Scale This System](#6-how-to-scale-this-system)
7. [Handling 1 Million Transactions Per Day](#7-handling-1-million-transactions-per-day)
8. [OWASP Top 10 — Prevention Strategy](#8-owasp-top-10--prevention-strategy)

---

## 1. How Race Conditions Are Prevented

### The Problem

In a financial system, a race condition occurs when two concurrent requests read the same wallet balance at the same time and both proceed to write — each unaware of the other's changes. Without protection, a user with ₦500 could successfully send two simultaneous ₦400 debits, resulting in a ₦-300 balance.

**Example of the broken scenario (no protection):**

```
Request A reads balance → ₦500
Request B reads balance → ₦500   ← both read before either writes
Request A writes        → ₦100   (500 - 400)
Request B writes        → ₦100   (500 - 400)  ← wrong, should be rejected
```

### The Solution — Database-Level Pessimistic Locking Inside a Transaction

Every write operation is wrapped inside an explicit database transaction with a **pessimistic write lock** on the wallet row:

```typescript
// transactions.service.ts
const queryRunner = this.dataSource.createQueryRunner();
await queryRunner.connect();
await queryRunner.startTransaction();

const wallet = await walletRepo.findOne({
  where: { userId },
  lock: { mode: 'pessimistic_write' }, // ← SELECT ... FOR UPDATE
});
```

`pessimistic_write` translates to `SELECT ... FOR UPDATE` in MySQL InnoDB. InnoDB is MySQL's default storage engine and the only engine that supports row-level locking and full ACID transactions — this is why InnoDB must be used (not MyISAM, which has no row locking). The lock is applied at the **row level** for the specific wallet being written, not the whole table. Any concurrent request that tries to read the same row with the same lock will **block and wait** until the first transaction commits or rolls back. Transactions guarantee ACID properties (Atomicity, Consistency, Isolation, Durability).

**What actually happens now:**

```
Request A acquires lock  → reads ₦500
Request B tries to lock  → BLOCKS (waits at the database level)
Request A writes ₦100   → commits, releases lock
Request B acquires lock  → reads ₦100 → rejects (insufficient funds)
```

The `finally` block guarantees the QueryRunner is always released, preventing deadlocks from dangling connections:

```typescript
} finally {
  await queryRunner.release();  // always runs, even on error
}
```

---

## 2. How Idempotency Works

### The Problem

Network failures, client retries, and mobile app reconnections can cause the same payment request to be submitted more than once. Without protection, a single user action could trigger multiple debits.

### The Solution — Idempotency Keys

Every transaction request carries a client-generated `idempotencyKey`. Before any work begins, the system checks whether a transaction with that key already exists:

```typescript
// transactions.service.ts
const existing = await transactionRepo.findOne({
  where: { idempotencyKey },
});

if (existing) {
  await queryRunner.rollbackTransaction();
  return existing; // ← return the original result, do nothing new
}
```

**How the flow works:**

```
Client sends POST /transactions  { amount: 100, type: "credit", idempotencyKey: "order-abc-001" }
  └── First request  → key not found → process transaction → save with key → return result
  └── Second request → key found     → rollback immediately → return same result
  └── Third request  → key found     → rollback immediately → return same result
```

The client receives identical responses for all three requests. From the user's perspective the operation is atomic and happens exactly once, regardless of how many times the request is sent.

**Key design properties:**

- The key is stored on the `Transaction` entity and should have a **unique database index** to prevent two simultaneous requests with the same key from both passing the initial check before either has written
- The check happens **inside the transaction** so the lock and the idempotency check are atomic
- The original transaction (not a duplicate) is always returned, so clients can safely retry without custom retry logic

---

## 3. Locking Strategy

### Why Pessimistic Locking Was Chosen

There are two common locking strategies in distributed systems:

| Strategy        | How it works                                                | Best for                                               |
| --------------- | ----------------------------------------------------------- | ------------------------------------------------------ |
| **Optimistic**  | Read freely, check version at write time, retry on conflict | Low-contention reads, eventual consistency acceptable  |
| **Pessimistic** | Lock the row on read, block all other writers               | High-contention writes, financial correctness required |

**Optimistic locking** uses a version column. If two requests read `version: 5` concurrently, the first to write increments it to `6`. The second write fails because it expected version `5` but found `6`, and must retry. This approach is good for systems where conflicts are rare and retrying is cheap.

**Pessimistic locking** was chosen here because:

1. **Correctness over throughput** — financial transactions must be serialized. An incorrect balance is worse than a slow response.
2. **No retry complexity** — pessimistic locks eliminate the need for application-level retry loops with exponential backoff.
3. **Short transaction duration** — the lock is held only for the duration of one balance read + one balance write, which is milliseconds. The risk of long lock waits is low.
4. **ACID guarantee** — the lock + transaction together provide a full ACID guarantee that optimistic locking alone cannot.

### What the Lock Covers

```typescript
await queryRunner.startTransaction(); // BEGIN
const wallet = await walletRepo.findOne({
  // SELECT ... FOR UPDATE  ← lock acquired
  lock: { mode: 'pessimistic_write' },
});
// ... balance check, transaction creation, balance update
await queryRunner.commitTransaction(); // COMMIT  ← lock released
```

Only the wallet row for the specific `userId` is locked. Other users' wallets are completely unaffected.

---

## 4. How SQL Injection Is Prevented

### TypeORM Parameterized Queries

The application never constructs raw SQL strings. All database queries go through TypeORM's query builder or repository methods, which use **parameterized queries** internally:

```typescript
// Safe — TypeORM binds userId as a parameter, never interpolates it into SQL
await this.walletRepository.findOne({
  where: { userId },
});

// TypeORM generates: SELECT * FROM wallet WHERE user_id = ?
// The value is passed separately as a bound parameter, never concatenated into the query string
```

Even if a user submits `userId: "1' OR '1'='1"`, TypeORM treats the entire string as a literal value — not SQL syntax. The database never sees it as code.

### Input Validation via DTOs and Class-Validator

All incoming request bodies are typed DTOs validated with `class-validator` before they reach the service layer:

```typescript
// auth.dto.ts
export class AuthRegisterDto {
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @IsString()
  @MinLength(8)
  password: string;
}
```

NestJS's `ValidationPipe` rejects any request that fails these rules before it touches the database, providing a second layer of protection:

```typescript
// main.ts
app.useGlobalPipes(
  new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: !isProd,
    transform: true,
    transformOptions: {
      enableImplicitConversion: true,
    },
    stopAtFirstError: true,
    validationError: {
      target: false,
      value: false,
    },
  }),
);
```

`whitelist: true` strips any properties not declared on the DTO. `forbidNonWhitelisted: true` rejects the request entirely if unknown properties are present — preventing property pollution attacks.

### Email Normalization

The `normalizeEmail` utility provides a third layer by sanitizing the email string before it is used in any query:

```typescript
private normalizeEmail(email: string) {
  if (typeof email !== 'string' || email.trim().length === 0) {
    throw new BadRequestException('Email is required');
  }
  return email.trim().toLowerCase();
}
```

This rejects non-strings (including objects and arrays that could be used in NoSQL injection), removes whitespace, and produces a canonical form.

---

## 5. What Would Change in Production

### Environment & Configuration

| Current                        | Production                                                           |
| ------------------------------ | -------------------------------------------------------------------- |
| Secrets hardcoded in `.env`    | Secrets in AWS Secrets Manager / HashiCorp Vault with rotation       |
| Single JWT secret              | Asymmetric RS256 keys (private key signs, public key verifies)       |
| `synchronize: true` in TypeORM | `synchronize: false` — migrations only, never auto-schema changes    |
| Console logging                | Structured JSON logging (Winston / Pino) shipped to a log aggregator |

### Database

| Current                      | Production                                                                        |
| ---------------------------- | --------------------------------------------------------------------------------- |
| Single MySQL instance        | MySQL primary + read replicas with automatic failover (e.g. AWS RDS Multi-AZ)     |
| No connection pooling config | ProxySQL connection pooler or TypeORM pool tuned to instance capacity             |
| No query timeout             | `wait_timeout` and `max_execution_time` set to prevent runaway queries            |
| No backup strategy           | Automated daily snapshots + point-in-time recovery via MySQL binary logs (binlog) |
| Default InnoDB settings      | Tune `innodb_buffer_pool_size` to 70–80% of available RAM for optimal performance |

### Security Hardening

```typescript
// Additional production middleware
app.use(helmet()); // Security headers
app.use(compression()); // Response compression
app.use(express.json({ limit: '10kb' })); // Payload size limit
```

- **HTTPS only** — TLS termination at the load balancer, HTTP redirected to HTTPS
- **Rate limiting** — current `@nestjs/throttler` setup plus a WAF rule at the CDN/load balancer layer
- **Refresh token rotation** — invalidate the old refresh token on every use (store token family hash in Redis)
- **Audit logging** — every financial event written to an immutable audit log table with `userId`, `action`, `amount`, `ip`, `timestamp`

### Observability

- **Metrics** — Prometheus + Grafana dashboards for request rate, error rate, p95/p99 latency, and transaction throughput
- **Tracing** — OpenTelemetry distributed tracing across services
- **Alerting** — PagerDuty alerts for error rate spikes, failed transactions above threshold, and latency degradation

---

## 6. How to Scale This System

### Horizontal Scaling (Stateless API)

The API is stateless — no session state is stored in memory. JWTs carry all authentication context. This means any number of API instances can run behind a load balancer and handle any request:

```
                    ┌──────────────────┐
                    │   Load Balancer  │
                    └────────┬─────────┘
              ┌──────────────┼──────────────┐
              ▼              ▼              ▼
         [API Pod 1]   [API Pod 2]   [API Pod 3]   ← all identical, all stateless
              └──────────────┼──────────────┘
                             ▼
                    ┌─────────────────┐
                    │     MySQL       │
                    │ Primary + Read  │
                    │   Replicas      │
                    └─────────────────┘
```

### Read/Write Separation

Route read queries (transaction history, wallet balance) to read replicas and write queries (process transaction, create wallet) to the primary. MySQL uses **binary log (binlog) based replication** — the primary writes all changes to the binlog and replicas replay them asynchronously.

> **Important for locking:** Always send `SELECT ... FOR UPDATE` (pessimistic lock) to the **primary**, never to a replica. Replicas are read-only and cannot participate in locking. ProxySQL handles this routing automatically by detecting write transactions.

### Caching

- Cache wallet balance reads in **Redis** with a short TTL (e.g. 2 seconds) — most balance checks are reads; the write path always bypasses the cache and invalidates it
- Cache JWT public keys and config values that never change per request

### Database Indexing

```sql
-- Queries that must be fast under load (MySQL syntax)
CREATE INDEX idx_transactions_wallet_id_created ON `transaction`(wallet_id, created_at DESC);
CREATE INDEX idx_wallet_user_id ON wallet(user_id);
CREATE UNIQUE INDEX idx_transaction_idempotency ON `transaction`(idempotency_key);

-- MySQL: transaction is a reserved word — always backtick-quote the table name
```

> **MySQL note:** `transaction` is a reserved keyword in MySQL. The table should be named `transactions` (plural) or always quoted with backticks in raw SQL to avoid parser errors.

---

## 7. Handling 1 Million Transactions Per Day

1M transactions/day ≈ **11.6 transactions/second** on average, with peaks potentially reaching 50–100 TPS during business hours. This is achievable on current architecture with tuning, but production readiness requires the following:

### Async Transaction Processing with a Queue

For non-blocking throughput, move heavy transaction processing off the HTTP request path:

```
POST /transactions
  └── Validate input
  └── Check idempotency key  ← fast DB read
  └── Enqueue job to BullMQ / RabbitMQ / SQS
  └── Return 202 Accepted immediately  ← client gets instant response

Worker pool (separate process):
  └── Dequeue job
  └── Acquire pessimistic lock
  └── Process transaction
  └── Emit event (WebSocket / webhook) to notify client of completion
```

This decouples API response time from transaction processing time, prevents request timeouts under load, and allows the worker pool to scale independently.

### Database Connection Pool Tuning

Each API pod should hold a fixed pool of database connections. With 3 pods and a pool of 20 each, the database sees at most 60 concurrent connections — well within MySQL's default `max_connections` of 151 (tunable based on instance size):

```typescript
// TypeORM data source config (mysql2 driver)
extra: {
  connectionLimit: 20,       // max connections per pod (mysql2 pool option)
  waitForConnections: true,  // queue requests when pool is full
  queueLimit: 0,             // unlimited queue (set a cap in production)
  connectTimeout: 2000,      // fail fast if DB is unreachable
}
```

> **MySQL-specific note:** Unlike PostgreSQL, MySQL does not have a built-in connection pooler like PgBouncer. Use **ProxySQL** in front of MySQL in production to multiplex thousands of application connections into a smaller number of real DB connections, and to route reads to replicas automatically.

### Partitioning the Transaction Table

At 1M transactions/day the `transaction` table will grow to ~365M rows per year. MySQL supports **RANGE partitioning** natively in InnoDB to keep query plans fast and allow old partitions to be dropped cheaply:

```sql
-- MySQL RANGE partitioning by month (uses UNIX timestamp for compatibility)
CREATE TABLE transaction (
  id        VARCHAR(36)  NOT NULL,
  created_at DATETIME    NOT NULL,
  -- other columns ...
  PRIMARY KEY (id, created_at)   -- ← partition key MUST be in primary key in MySQL
) ENGINE=InnoDB
  PARTITION BY RANGE (YEAR(created_at) * 100 + MONTH(created_at)) (
    PARTITION p202501 VALUES LESS THAN (202502),
    PARTITION p202502 VALUES LESS THAN (202503),
    PARTITION p202503 VALUES LESS THAN (202504),
    PARTITION pFuture VALUES LESS THAN MAXVALUE
  );
```

> **MySQL-specific constraint:** The partition key must be part of every unique index (including the primary key). This is stricter than PostgreSQL — plan the schema with this in mind before the table has data.

### Summary of Scaling Steps

| Volume       | Strategy                                                           |
| ------------ | ------------------------------------------------------------------ |
| < 100 TPS    | Single API + single DB, horizontal pod scaling                     |
| 100–500 TPS  | Add read replicas, Redis cache, BullMQ queue                       |
| 500–2000 TPS | Shard DB by user ID range, async workers, CDN for static responses |
| 2000+ TPS    | Event sourcing, CQRS, dedicated ledger service                     |

---

## 8. OWASP Top 10 — Prevention Strategy

### A01 — Broken Access Control (BOLA / IDOR)

**The threat:** A user queries `/wallet` or `/transactions` and manipulates the request to access another user's data by changing an ID in the URL or body.

**How it is prevented here:** The `userId` is **never trusted from the client**. It is always extracted from the verified JWT payload attached to `req.user` by Passport after signature verification:

```typescript
// transactions.controller.ts
async createTrans(@Body() dto, @Req() req) {
  const user = req.user;  // ← comes from validated JWT, not from the request body

  return this.transactionService.processTransaction({
    userId: user.id,  // ← server-controlled, client cannot override this
    ...dto,
  });
}
```

Even if a client sends `{ "userId": "someone-elses-uuid" }` in the body, it is ignored. The `userId` from the JWT is always used. This prevents **BOLA (Broken Object Level Authorization)** at the architectural level.

**Additional enforcement at the service layer:**

```typescript
// wallets.service.ts — wallet is fetched by the authenticated userId only
const wallet = await this.walletRepository.findOne({ where: { userId } });
// userId here is always from the JWT, never from user input
```

---

### A02 — Cryptographic Failures

| Risk                        | Mitigation                                                                          |
| --------------------------- | ----------------------------------------------------------------------------------- |
| Weak password storage       | `bcrypt` with cost factor 10 — resistant to GPU cracking                            |
| JWT secret exposure         | Secrets loaded from environment variables, never committed to source control        |
| Weak JWT algorithm          | HS256 (current) → RS256 in production (asymmetric, public key can be shared safely) |
| Plaintext passwords in logs | Service never logs `dto.password`; only hashed values are persisted                 |

---

### A03 — Injection

Covered in full in [Section 4](#4-how-sql-injection-is-prevented). Summary:

- TypeORM parameterized queries — no raw SQL string concatenation
- `class-validator` DTO validation — rejects malformed or unexpected input
- `whitelist: true` on `ValidationPipe` — strips undeclared properties

---

### A04 — Insecure Design

- **Principle of least privilege** — each service only has access to its own repository; `TransactionsService` accesses wallets only within a locked transaction scope
- **Fail secure** — if the wallet is not found, the transaction rolls back entirely rather than proceeding with a default or zero balance
- **No debug endpoints in production** — Swagger UI should be disabled or access-restricted in production

---

### A05 — Security Misconfiguration

- `forbidNonWhitelisted: true` on `ValidationPipe` rejects unexpected fields
- CORS should be an explicit allowlist of origins — never `*` in production
- `helmet()` middleware sets security headers (`X-Frame-Options`, `X-Content-Type-Options`, `Strict-Transport-Security`, etc.)
- `synchronize: false` in production TypeORM config — never auto-apply schema changes to a live database

---

### A06 — Vulnerable and Outdated Components

- Pin dependency versions in `package-lock.json`
- Run `npm audit` in CI pipeline — fail the build on critical vulnerabilities
- Use Dependabot or Renovate for automated dependency update PRs
- Do not install development dependencies in the production Docker image

---

### A07 — Identification and Authentication Failures

| Risk                     | Mitigation                                                                                     |
| ------------------------ | ---------------------------------------------------------------------------------------------- |
| Brute-force login        | `@Throttle({ limit: 5, ttl: 60000 })` on the login endpoint — 5 attempts per minute            |
| Brute-force registration | `@Throttle({ limit: 3, ttl: 60000 })` on register                                              |
| Credential stuffing      | Rate limiting + CAPTCHA for repeat failures in production                                      |
| Weak tokens              | JWT signed with secret + expiry enforced (`15m` access, `1d` refresh)                          |
| Token theft              | Short-lived access tokens limit the blast radius; refresh tokens should be rotated on each use |

---

### A08 — Software and Data Integrity Failures

- Never deserialize untrusted data without validation (DTOs + `class-validator` enforce this)
- Verify npm package integrity via `package-lock.json` and `npm ci` in CI (not `npm install`)
- In production: sign Docker images and verify signatures before deployment

---

### A09 — Security Logging and Monitoring Failures

Every financial operation should produce a structured audit log entry:

```typescript
// Example audit log structure (to be added in production)
{
  timestamp: "2025-01-01T12:00:00Z",
  event: "TRANSACTION_PROCESSED",
  userId: "user-uuid",
  walletId: "wallet-uuid",
  amount: 100,
  type: "DEBIT",
  status: "SUCCESS",
  ip: "197.x.x.x",
  idempotencyKey: "idem-key-001"
}
```

Alerts should fire on:

- More than N failed login attempts from the same IP in a rolling window
- Transaction failure rate exceeding a threshold
- Any attempt to access a resource belonging to a different `userId`

---

### A10 — Server-Side Request Forgery (SSRF)

Not directly applicable to this API (no URL-fetching endpoints), but relevant if webhooks or external payment provider callbacks are added:

- Validate and allowlist external URLs before making outbound requests
- Never follow redirects to internal network addresses (`169.254.x.x`, `10.x.x.x`, `localhost`)
- Use a dedicated egress proxy that enforces the allowlist at the network level

---

## Architecture Summary

```
┌─────────────────────────────────────────────────────────────┐
│                        Client                               │
└─────────────────────────┬───────────────────────────────────┘
                          │ HTTPS
┌─────────────────────────▼───────────────────────────────────┐
│              Load Balancer + WAF + Rate Limiting             │
└─────────────────────────┬───────────────────────────────────┘
                          │
┌─────────────────────────▼───────────────────────────────────┐
│                   NestJS API (stateless)                     │
│  ValidationPipe → Guards (JWT) → Controller → Service       │
│  Throttler | Helmet | CORS allowlist                        │
└────────────┬──────────────────────────┬─────────────────────┘
             │                          │
┌────────────▼────────┐     ┌───────────▼──────────────┐
│    ProxySQL         │     │     Redis Cache           │
│  (connection pool   │     │  (balance cache, tokens)  │
│   + read routing)   │     └──────────────────────────┘
└────────────┬────────┘
             │
┌────────────▼────────┐     ┌─────────────────────┐
│   MySQL Primary     │────▶│  MySQL Read Replica  │
│  (writes + locks)   │     │  (reads only)        │
│  InnoDB engine      │     └─────────────────────┘
└─────────────────────┘
```
