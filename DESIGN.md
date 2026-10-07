# Cartly - Design

## Architecture and request flow

```
Flutter app                          NestJS API (backend/)                     Cloud Firestore
-----------                          ---------------------                     ---------------
ShoppingListScreen / widgets
        |  (no HTTP in widgets)
ShoppingProvider (state)
        |
ShoppingRepository
        |
ApiService ---- HTTP/REST + X-User-ID ---> UserIdGuard (401 if missing/invalid)
                                                |
                                          ItemsController + ValidationPipe (400 before any write)
                                                |
                                          ItemsService (business rules, 404 if not owned/missing)
                                                |
                                          FirestoreService ---- Admin SDK ----> users/{userId}/items/{itemId}
```

Example (US-1): Flutter `GET /api/items` with `X-User-ID: u1`. The guard accepts the ID, and the service queries
`users/u1/items` with `orderBy(bought ASC), orderBy(createdAt DESC)`. Firestore returns the sorted docs, the API returns
`{ items: [...] }`, and Flutter renders them in that order. It only splits them into "Shopping List" and "Bought"
sections and never sorts. Every mutation (add, toggle, delete, clear) is followed by the same re-fetch.

## Firestore collections and fields

`users/{userId}/items/{itemId}`

| Field       | Type      | Notes                                         |
|-------------|-----------|-----------------------------------------------|
| (doc ID)    | string    | Auto-generated item ID                        |
| `name`      | string    | Trimmed, non-empty, max 200 chars             |
| `quantity`  | number    | Integer >= 1                                  |
| `bought`    | boolean   | `false` on create                             |
| `createdAt` | timestamp | `serverTimestamp()` on create                 |

Composite index (`backend/firestore.indexes.json`): `items` collection, `bought ASC, createdAt DESC`.
`backend/firestore.rules` denies all client-SDK access. Only the Admin SDK in NestJS can read or write.

**Why a per-user subcollection:** the user ID is part of the document path, so every query and lookup is scoped by
construction. `itemsCollection(userId)` is the only way the service reaches data, which means a forgotten
`where('userId', ...)` filter cannot leak another user's items. Looking up someone else's item ID under your own path
simply finds nothing, so you get a 404 and nothing about the item is revealed. The sort and the "bought == true" query
also only touch one user's small collection.

## API endpoints

All endpoints require `X-User-ID`. Errors return `{ statusCode, message }`.

| Method | Endpoint                    | Success              | Errors        | Story |
|--------|-----------------------------|----------------------|---------------|-------|
| GET    | `/api/items`                | 200 `{ items }`      | 401           | US-1, US-6 |
| POST   | `/api/items`                | 201 item             | 400, 401      | US-2, US-6 |
| PATCH  | `/api/items/:itemId/toggle` | 200 item             | 401, 404      | US-3, US-6 |
| DELETE | `/api/items/:itemId`        | 204                  | 401, 404      | US-4, US-6 |
| DELETE | `/api/items/bought`         | 204 (also if none)   | 401           | US-5, US-6 |

Clear bought runs one query (`bought == true`) and then a single `WriteBatch` commit, chunked at Firestore's
500-writes-per-batch limit. There is no per-item request loop.

## Trade-offs

1. **Header identity instead of real auth.** `X-User-ID` is trusted as-is, which satisfies the spec's "no
   authentication" scope but is spoofable. The guard and `@UserId()` decorator are the single seam where a verified
   Firebase ID token could later be swapped in without touching controllers or services.
2. **Re-fetch after every mutation instead of optimistic updates.** Each change costs one extra GET and a short
   progress bar. In return, the list always shows the database order, so no ordering logic is duplicated in Dart, and
   items that disappeared (a 404) drop off the list automatically.
