# Unit Test Suite — NestJS Fintech API

This document describes the complete unit test coverage written for the authentication, wallet, and transaction modules of this NestJS application. All tests use **Jest** with `@nestjs/testing` and follow a consistent pattern: mock all dependencies, test one unit at a time, and assert both happy paths and error paths.

---

## Test Philosophy

```
The test suite prioritizes deterministic unit tests over integration tests.
All external dependencies (database, hashing, JWT signing) are mocked
to ensure fast and isolated execution.
Edge cases and financial integrity scenarios are emphasized.

```

---

## Test Files Overview

| File                              | Layer      | Tests  |
| --------------------------------- | ---------- | ------ |
| `users.service.spec.ts`           | Service    | 12     |
| `wallets.service.spec.ts`         | Service    | 8      |
| `transactions.service.spec.ts`    | Service    | 17     |
| `auth.service.spec.ts`            | Service    | 16     |
| `auth.controller.spec.ts`         | Controller | 10     |
| `wallets.controller.spec.ts`      | Controller | 5      |
| `transactions.controller.spec.ts` | Controller | 13     |
| **Total**                         |            | **81** |

---

## How to Run

```bash
# Run all tests
npm run test

# Run a single spec file
npm run test auth.service.spec

# Watch mode
npm run test:watch

# Coverage report
npm run test:cov
```

---

## 1. `users.service.spec.ts`

Tests the `UsersService` which handles user registration, credential validation, and profile retrieval. `bcrypt` is fully mocked so no real hashing occurs.

### `registerUser`

| #   | Test                      | What it verifies                                                                                       |
| --- | ------------------------- | ------------------------------------------------------------------------------------------------------ |
| 1   | Happy path                | Normalizes email, hashes password, calls `create` + `save`, returns `id`, `email`, `role`, `createdAt` |
| 2   | Duplicate email           | Throws `ConflictException` and skips `create` and `save`                                               |
| 3   | Empty email               | Throws `BadRequestException('Email is required')`                                                      |
| 4   | Non-string email (`null`) | Throws `BadRequestException('Email is required')`                                                      |
| 5   | Email normalization       | Trims whitespace and lowercases before persisting                                                      |

### `validateUser`

| #   | Test                | What it verifies                                                               |
| --- | ------------------- | ------------------------------------------------------------------------------ |
| 6   | Happy path          | Returns `id`, `email`, `role` — never `password` — on valid credentials        |
| 7   | User not found      | Throws `BadRequestException('Invalid credentials')` and skips `bcrypt.compare` |
| 8   | Wrong password      | Throws `BadRequestException('Invalid credentials')`                            |
| 9   | Email normalization | Lowercases + trims email before querying                                       |
| 10  | Empty email         | Throws `BadRequestException('Email is required')`                              |

### `userProfile`

| #   | Test           | What it verifies                                   |
| --- | -------------- | -------------------------------------------------- |
| 11  | Happy path     | Returns `id`, `email`, `role` for a valid `userId` |
| 12  | User not found | Throws `NotFoundException('User not found')`       |

---

## 2. `wallets.service.spec.ts`

Tests the `WalletsService` which handles wallet creation and retrieval per user.

### `createWallet`

| #   | Test                  | What it verifies                                                                             |
| --- | --------------------- | -------------------------------------------------------------------------------------------- |
| 1   | Happy path            | Queries for existing wallet, creates with `NGN` / `0.00` defaults, returns `{ savedWallet }` |
| 2   | Wallet already exists | Throws `ConflictException` and skips `create` + `save`                                       |
| 3   | Default values        | Always seeds `balance: '0.00'` and `currency: 'NGN'`                                         |
| 4   | Return shape          | Result is wrapped inside the `savedWallet` key                                               |

### `userWallet`

| #   | Test             | What it verifies                                                 |
| --- | ---------------- | ---------------------------------------------------------------- |
| 5   | Happy path       | Returns `{ success, message, data: { id, balance, currency } }`  |
| 6   | Wallet not found | Throws `NotFoundException('Wallet not found')`                   |
| 7   | `success` flag   | Response always has `success: true`                              |
| 8   | Data shape       | `data` exposes only `id`, `balance`, `currency` — never `userId` |

---

## 3. `transactions.service.spec.ts`

Tests the `TransactionsService` which processes financial transactions inside a database transaction (queryRunner) and handles pagination. The `DataSource`, `QueryRunner`, and both repositories are fully mocked.

### `processTransaction`

#### Idempotency

| #   | Test          | What it verifies                                                                                      |
| --- | ------------- | ----------------------------------------------------------------------------------------------------- |
| 1   | Duplicate key | Returns the existing transaction immediately and calls `rollbackTransaction` — no new records created |

#### CREDIT

| #   | Test           | What it verifies                                                                                           |
| --- | -------------- | ---------------------------------------------------------------------------------------------------------- |
| 2   | Happy path     | Increases wallet balance by the credit amount, calls `save` twice (PENDING → SUCCESS), commits transaction |
| 3   | PENDING status | Transaction is created with `status: PENDING` before the balance update                                    |

#### DEBIT

| #   | Test               | What it verifies                                                        |
| --- | ------------------ | ----------------------------------------------------------------------- |
| 4   | Sufficient funds   | Decreases wallet balance and commits                                    |
| 5   | Insufficient funds | Throws `ConflictException('Insufficient funds')` and rolls back         |
| 6   | Zero balance       | Throws `ConflictException` when balance is `0` and a debit is attempted |
| 7   | Exact balance      | Allows debit when amount equals balance exactly (boundary condition)    |

#### Wallet not found

| #   | Test      | What it verifies                                                |
| --- | --------- | --------------------------------------------------------------- |
| 8   | No wallet | Throws `BadRequestException('Wallet not found')` and rolls back |

#### QueryRunner lifecycle

| #   | Test             | What it verifies                                                            |
| --- | ---------------- | --------------------------------------------------------------------------- |
| 9   | Lifecycle calls  | `connect`, `startTransaction`, and `release` are always called on success   |
| 10  | Release on error | `release` is called in the `finally` block even when an exception is thrown |
| 11  | Reference format | Auto-generated `reference` matches the `TXN_timestamp_random` regex pattern |

### `getTransationsByUser`

| #   | Test               | What it verifies                                                                                |
| --- | ------------------ | ----------------------------------------------------------------------------------------------- |
| 12  | Happy path         | Returns `walletId`, `balance`, `page`, `limit`, `total`, `totalPages`, and `transactions` array |
| 13  | Wallet not found   | Throws `BadRequestException('Wallet not found')` and skips `findAndCount`                       |
| 14  | Default pagination | Defaults to `page=1`, `limit=10` when not provided                                              |
| 15  | Limit cap          | Enforces a maximum of 50 results per page regardless of input                                   |
| 16  | Skip calculation   | Correct `skip = (page - 1) * limit` value is computed                                           |
| 17  | Total pages        | `totalPages` is `Math.ceil(total / limit)`                                                      |

---

## 4. `auth.service.spec.ts`

Tests the `AuthService` which orchestrates user registration, login, and token refresh. `JwtService`, `ConfigService`, `UsersService`, and `WalletsService` are all mocked.

### `registerUser`

| #   | Test                 | What it verifies                                                                               |
| --- | -------------------- | ---------------------------------------------------------------------------------------------- |
| 1   | Happy path           | Registers user, creates wallet, returns `{ success, message, data: { user, tokens, wallet } }` |
| 2   | Token signing count  | `signAsync` is called exactly twice (access + refresh)                                         |
| 3   | Access token config  | Signed with `JWT_SECRET` and `expiresIn: '15m'`                                                |
| 4   | Refresh token config | Signed with `JWT_REFRESH_SECRET` and `expiresIn: '1d'`                                         |
| 5   | Registration error   | Error from `registerUser` propagates and wallet creation is skipped                            |
| 6   | Wallet error         | Error from `createWallet` propagates correctly                                                 |
| 7   | Sensitive fields     | `password` and `createdAt` are never in the response                                           |

### `loginUser`

| #   | Test              | What it verifies                                                |
| --- | ----------------- | --------------------------------------------------------------- |
| 8   | Happy path        | Validates credentials and returns `{ user, tokens }`            |
| 9   | No wallet created | `walletsService.createWallet` is never called during login      |
| 10  | Token signing     | Both access and refresh tokens are signed                       |
| 11  | Validation error  | Error from `validateUser` propagates and `signAsync` is skipped |
| 12  | Sensitive fields  | `password` is never exposed in the login response               |

### `refreshToken`

| #   | Test             | What it verifies                                               |
| --- | ---------------- | -------------------------------------------------------------- |
| 13  | Happy path       | Returns `{ success, message, token: { access_token } }`        |
| 14  | No refresh token | Response contains `access_token` only — no `refresh_token`     |
| 15  | Token payload    | `signAsync` called with correct `{ sub, email, role }` payload |
| 16  | Profile error    | Error from `userProfile` propagates and `signAsync` is skipped |

---

## 5. `auth.controller.spec.ts`

Tests the `AuthController`. Guards (`AuthGuard('jwt-refresh')` and `ThrottlerGuard`) are overridden so tests do not need real tokens or rate-limit context.

### `register`

| #   | Test              | What it verifies                                                    |
| --- | ----------------- | ------------------------------------------------------------------- |
| 1   | Happy path        | Passes the DTO to `authService.registerUser` and returns its result |
| 2   | Error propagation | Errors from the service bubble up to the caller                     |
| 3   | Single call       | `registerUser` is called exactly once per request                   |

### `login`

| #   | Test              | What it verifies                                                 |
| --- | ----------------- | ---------------------------------------------------------------- |
| 4   | Happy path        | Passes the DTO to `authService.loginUser` and returns its result |
| 5   | Error propagation | Errors from the service bubble up to the caller                  |
| 6   | Single call       | `loginUser` is called exactly once per request                   |

### `refreshToken`

| #   | Test              | What it verifies                                                       |
| --- | ----------------- | ---------------------------------------------------------------------- |
| 7   | Happy path        | Extracts `userId` from `req.user` and calls `authService.refreshToken` |
| 8   | Arg shape         | Only `{ userId }` is forwarded — not `email` or `role`                 |
| 9   | Error propagation | Errors from the service bubble up to the caller                        |
| 10  | Single call       | `refreshToken` is called exactly once per request                      |

---

## 6. `wallets.controller.spec.ts`

Tests the `WalletsController`. Both `AuthGuard('jwt')` and `ThrottlerGuard` are bypassed.

### `userWallet`

| #   | Test              | What it verifies                                                                          |
| --- | ----------------- | ----------------------------------------------------------------------------------------- |
| 1   | Happy path        | Passes `{ userId }` from `req.user` to `walletsService.userWallet` and returns the result |
| 2   | Arg shape         | Only `{ userId }` is passed — not `email` or `role`                                       |
| 3   | Single call       | `userWallet` is called exactly once per request                                           |
| 4   | Error propagation | Errors (e.g. `NotFoundException`) bubble up to the caller                                 |
| 5   | Response shape    | Result matches `{ success, message, data: { id, balance, currency } }`                    |

---

## 7. `transactions.controller.spec.ts`

Tests the `TransactionsController`. Both `AuthGuard('jwt')` and `ThrottlerGuard` are bypassed.

### `createTrans`

| #   | Test              | What it verifies                                                            |
| --- | ----------------- | --------------------------------------------------------------------------- |
| 1   | Happy path        | Merges `userId` from `req.user` with the DTO and calls `processTransaction` |
| 2   | UserId source     | `userId` always comes from `req.user`, not the request body                 |
| 3   | Single call       | `processTransaction` is called exactly once per request                     |
| 4   | Error propagation | Errors from the service bubble up to the caller                             |
| 5   | DEBIT type        | Works correctly for `TransactionType.DEBIT` as well as `CREDIT`             |

### `getTransactionsByUserId`

| #   | Test               | What it verifies                                                    |
| --- | ------------------ | ------------------------------------------------------------------- |
| 6   | Happy path         | Returns paginated result with correct `userId`, `page`, and `limit` |
| 7   | Default pagination | Defaults to `page=1`, `limit=10` when no query params are provided  |
| 8   | String parsing     | Parses string query params to integers (`'3'` → `3`)                |
| 9   | UserId source      | `userId` always comes from `req.user`                               |
| 10  | Page only          | Defaults `limit=10` when only `page` is provided                    |
| 11  | Limit only         | Defaults `page=1` when only `limit` is provided                     |
| 12  | Error propagation  | Errors from the service bubble up to the caller                     |
| 13  | Single call        | `getTransationsByUser` is called exactly once per request           |

---

## Common Patterns Used Across All Tests

**Guard bypassing** — Controller tests override guards with `{ canActivate: () => true }` so they run without real JWTs or rate-limit context.

**`jest.clearAllMocks()` in `afterEach`** — Prevents mock call counts and return values from leaking between tests.

**`expect.objectContaining(...)`** — Used for partial argument matching when only a subset of fields matter.

**`expect(result).not.toHaveProperty('password')`** — Explicitly asserts that sensitive fields are never exposed in any response.

**`toHaveBeenCalledTimes(1)`** — Guards against accidental duplicate service calls.

**`toHaveBeenNthCalledWith`** — Used in `auth.service.spec.ts` to assert that the first and second `signAsync` calls use different secrets and expiry values.
