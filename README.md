# Cartly

A simple shopping-list app: **Flutter** mobile app -> **NestJS** REST API -> **Cloud Firestore**.
The Flutter app talks only to the API. It never touches Firestore directly.

See [DESIGN.md](DESIGN.md) for the architecture, data model, endpoint table, and trade-offs.

```
backend/   NestJS API (Firebase Admin SDK, validation, X-User-ID ownership)
mobile/    Flutter app (provider state, repository + API service layers)
DESIGN.md  One-page design
.env.example
```

## Prerequisites (clean machine)

| Tool | Version | Used for |
|------|---------|----------|
| Node.js | 20+ (tested on 22) | Backend |
| Java JDK | 11+ | Firestore Emulator |
| Firebase CLI | 13+ (`npm i -g firebase-tools`, or use `npx firebase-tools`) | Emulator / index deploy |
| Flutter SDK | 3.19+ (Dart 3.3+) | Mobile app |
| Android Studio emulator or a device | - | Running the app |

## 1. Backend

```bash
cd backend
npm install
cp ../.env.example .env        # Windows: copy ..\.env.example .env
```

### Option A: Firestore Emulator (recommended for development)

Keep `FIRESTORE_EMULATOR_HOST=127.0.0.1:8080` in `backend/.env`. Then:

```bash
# terminal 1 - Firestore Emulator (UI at http://localhost:4000)
cd backend
npx firebase-tools emulators:start --only firestore --project cartly-dev

# terminal 2 - API on http://localhost:3000/api
cd backend
npm run start:dev
```

The emulator doesn't need a Firebase account, credentials, or indexes.

### Option B: A real Firebase project

1. Create a project in the [Firebase console](https://console.firebase.google.com/) and enable **Cloud Firestore**
   (Native mode).
2. Go to **Project settings > Service accounts > Generate new private key** and save the JSON outside the repo,
   or as `backend/service-account.json`, which is git-ignored.
3. In `backend/.env`, set:
   ```
   FIREBASE_PROJECT_ID=<your-project-id>
   GOOGLE_APPLICATION_CREDENTIALS=./service-account.json
   FIRESTORE_EMULATOR_HOST=
   ```
4. Deploy the composite index (`bought ASC, createdAt DESC`) and the deny-all client rules:
   ```bash
   cd backend
   npx firebase-tools login
   npx firebase-tools deploy --only firestore:indexes,firestore:rules --project <your-project-id>
   ```
   If you skip this, the first `GET /api/items` fails, and the Firestore error log contains a link that creates the
   index.
5. Run `npm run start:dev`.

### Try it

```bash
curl -X POST http://localhost:3000/api/items -H "X-User-ID: user-001" -H "Content-Type: application/json" -d "{\"name\":\"Milk\",\"quantity\":2}"
curl http://localhost:3000/api/items -H "X-User-ID: user-001"
```

### Backend tests

```bash
cd backend
npm test                 # unit tests (service, DTO validation, guard) - no Firebase needed
npm run lint
npx firebase-tools emulators:exec --only firestore --project cartly-dev "npm run test:e2e"
                         # full HTTP + Firestore Emulator tests
```

## 2. Mobile app

The repo contains `lib/`, `test/` and `pubspec.yaml`. Generate the platform folders once:

```bash
cd mobile
flutter create . --project-name cartly --platforms android,ios
flutter pub get
flutter test
```

Run it with the API reachable from the device:

```bash
# Android emulator (10.0.2.2 = host machine's localhost) - this is the default
flutter run --dart-define=USER_ID=user-001

# iOS simulator / desktop
flutter run --dart-define=API_BASE_URL=http://localhost:3000/api --dart-define=USER_ID=user-001

# Physical device on the same Wi-Fi
flutter run --dart-define=API_BASE_URL=http://<your-LAN-IP>:3000/api --dart-define=USER_ID=user-001
```

Android blocks plain HTTP by default. For local development, add `android:usesCleartextTraffic="true"` to the
`<application>` tag in `mobile/android/app/src/main/AndroidManifest.xml`.

Run with different `USER_ID` values to see that each user's list is private.

## User-story status

| Story | Description | Status | Where |
|-------|-------------|--------|-------|
| US-1 | See my list: name, quantity, status; DB-side ordering; loading, empty, and error-with-retry states | Done | `ItemsService.findAll`, `ShoppingListScreen`, `EmptyState`, `ErrorState` |
| US-2 | Add an item; starts unbought; backend rejects empty name or quantity < 1 and the message is shown | Done | `CreateItemDto`, `ItemsService.create`, `AddItemDialog` |
| US-3 | Toggle bought/unbought; item moves group; missing item gives a clear 404, no crash | Done | `ItemsService.toggle` (transaction), `ShoppingProvider.toggleItem` |
| US-4 | Delete an item; missing item gives a clear 404 | Done | `ItemsService.remove`, `ShoppingItemTile` |
| US-5 | Clear all bought items in one action via a batched write; no error when there are none | Done | `ItemsService.clearBought`, "Clear Bought" button |
| US-6 | Private lists: `X-User-ID` required; ownership enforced in the backend | Done | `UserIdGuard`, `users/{userId}/items` path scoping, `firestore.rules` |

## Out of scope (per the spec)

Login, sign-up, sharing, notifications, offline mode, real-time sync, deployment, Docker, CI/CD, custom design.
