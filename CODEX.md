# CODEX.md — Tawseelaiq Web App: Complete Implementation Guide

> **For OpenAI Codex / any AI agent continuing this project.**
> This document contains every detail needed to complete the React web app without further research.

---

## 1. Project Overview

**App:** توصيلة IQ — Iraqi taxi web app  
**Stack:** React 18 + Vite + TypeScript + Tailwind CSS + Mapbox GL JS  
**Live backend:** `https://tawseelaiq.app` (Node.js HTTP, PostgreSQL)  
**VPS:** `root@173.212.206.86`  
**Design:** Arabic RTL, Cairo font, orange `#f97316`, green `#059669`, dark slate `#0f172a`

---

## 2. Completed Files

```
src/
├── api/index.ts          # All API calls (apiFetch + authApi, driverApi, rideApi, routeApi, fleetApi, mapApi, adminApi)
├── components/
│   ├── map/useMapbox.ts  # Mapbox hook — markers, route drawing, driver tracking
│   └── ui/
│       ├── Button.tsx    # Variants: primary/success/danger/ghost
│       ├── Input.tsx
│       ├── Modal.tsx
│       └── Navbar.tsx    # Role-based nav (Customer/Driver/Admin)
├── hooks/
│   ├── useDriverPolling.ts  # 5s poll → fleet/active-drivers
│   └── useAddressSearch.ts  # Debounced geocoding
├── pages/
│   ├── Home.tsx          # Landing page
│   ├── Login.tsx         # Phone OTP → JWT
│   ├── MapPage.tsx       # Short trip booking with Mapbox
│   ├── DailyPage.tsx     # Permanent lines — draw route + match drivers + atomic book
│   ├── DriverPage.tsx    # Driver dashboard (toggle online, draw route, requests, bookings)
│   ├── AdminPage.tsx     # Complete Admin panel (map route drawing, stats, drivers, customers, bookings, routes)
│   └── RidePage.tsx      # Real-time ride tracking + driver GPS live marker
├── store/
│   ├── authStore.ts      # Zustand persist (user, token)
│   └── rideStore.ts      # Zustand (activeRide, nearbyDrivers)
├── types/index.ts        # All TypeScript interfaces
├── utils/
│   └── telegram.ts       # Telegram WebApp SDK integration + deep-links (?role, ?tripType)
├── index.css
├── main.tsx              # Router + ProtectedRoute + Telegram WebApp init
public/
└── manifest.json         # PWA installable manifest
telegram/
├── telegramBot.js        # Telegram Bot engine with Iraqi Governorates, OTP, and atomic booking
└── README.md             # Telegram Bot architecture, webhooks, and WebApp integration
nginx.conf                # Production Nginx reverse proxy with SSL + API routing
Dockerfile                # Multi-stage production container build
```

---

## 3. All API Endpoints

**Base URL:** `https://tawseelaiq.app`  
**Auth header:** `Authorization: Bearer <token>`  
**Token storage:** `localStorage.auth_token`

### Auth
| Method | Path | Body / Params |
|--------|------|---------------|
| GET | `/api/auth/check-phone` | `?phone=` |
| POST | `/api/auth/send-otp` | `{ phone }` |
| POST | `/api/auth/verify-otp` | `{ phone, otp }` → `{ token, user }` |
| POST | `/api/auth/login` | `{ identifier, password, role, autoOtpLogin }` |
| GET | `/api/auth/me` | Bearer token |
| POST | `/api/auth/complete-passenger-registration` | passenger details |
| POST | `/api/auth/complete-driver-registration` | driver + vehicle details |
| POST | `/api/auth/select-role` | `{ role }` |

### Driver
| Method | Path | Notes |
|--------|------|-------|
| POST | `/api/driver/toggle-online` | toggle status |
| POST | `/api/driver/location` | `{ driverId, lat, lon, heading }` |
| GET | `/api/driver/:id/live` | live position |
| GET | `/api/driver/:id/active-ride` | |
| GET | `/api/driver/:id/pending-requests` | |
| GET | `/api/driver/:id/bookings` | |
| POST | `/api/driver/service-type` | `{ mode: 'مشوار قصير' | 'خط دائمي' | 'كلاهما' }` |
| POST | `/api/driver/set-route` | set permanent route |
| GET | `/api/driver/active-routes` | |
| POST | `/api/driver/approve-join` | `{ rideId, accept }` |

### Rides (Short Trip)
| Method | Path | Body |
|--------|------|------|
| POST | `/api/ride/request` | `{ passengerId, pickupLat, pickupLng, dropoffLat, dropoffLng }` |
| GET | `/api/ride/status/:id` | |
| POST | `/api/ride/respond` | `{ rideId, accept }` |
| POST | `/api/ride/arrived` | `{ rideId }` |
| POST | `/api/ride/cancel` | `{ rideId }` |
| POST | `/api/ride/complete` | `{ rideId }` |

### Permanent Lines / Bookings
| Method | Path | Notes |
|--------|------|-------|
| POST | `/api/routes/permanent` | `{ waypoints: [lng,lat][], fromName, toName, totalSeats }` |
| GET | `/api/routes/permanent` | list all |
| PATCH | `/api/routes/permanent/:id` | update |
| DELETE | `/api/routes/permanent/:id` | |
| POST | `/api/passenger/match-route` | `{ waypoints }` → returns `PermanentRoute[]` with `proximity_tier` |
| POST | `/api/bookings/atomic-book` | `{ routeId }` — decrements seat atomically |
| GET | `/api/bookings` | all bookings |
| POST | `/api/passenger/join-request` | |

### Fleet / Map
| Method | Path | Notes |
|--------|------|-------|
| GET | `/api/fleet/active-drivers` | all online drivers with lat/lng |
| GET | `/api/drivers/nearby` | `?tripType=&lat=&lon=&rangeKm=` |
| GET | `/api/routing/route` | `?from=lng,lat&to=lng,lat` → Mapbox Directions |
| GET | `/api/routing/search-address` | `?q=text` → Mapbox Geocoding |
| GET | `/api/pricing/estimate` | `?fromLat=&fromLng=&toLat=&toLng=` |

### Admin
| Method | Path |
|--------|------|
| GET | `/api/admin/stats` |
| GET/POST | `/api/admin/drivers` |
| GET/DELETE | `/api/admin/drivers/:id` |
| POST | `/api/admin/drivers/:id/approve` |
| POST | `/api/admin/drivers/:id/block` |
| GET/DELETE | `/api/admin/customers/:id` |
| GET | `/api/admin/bookings` |
| GET | `/api/admin/routes` |
| GET | `/api/admin/complaints` |
| POST | `/api/admin/complaints/:id/status` |
| GET | `/api/admin/settings` |

---

## 4. Database Schema (PostgreSQL)

```sql
-- users: id, phone, full_name, role (Customer|Driver|Admin), image, created_at
-- drivers: id, user_id, status (Pending|Approved|Rejected|Suspended|Online|Offline),
--          work_mode, vehicle_type, vehicle_color, vehicle_plate, rating, lat, lon, heading
-- customers: id, user_id
-- routes: id, driver_id, from_name, to_name, waypoints (JSONB [[lng,lat]]),
--         available_seats, total_seats, price, is_active
-- bookings: id, driver_id, passenger_id, route_id, platform (web|telegram),
--           status (Pending|Confirmed|Completed|Cancelled), created_at
-- complaints: id, passenger_id, driver_id, message, status, created_at
-- notifications: id, user_id, message, read, created_at
-- audit_logs: id, user_id, action, details, created_at
-- system_settings: key, value
```

---

## 5. Auth Flow

1. User enters phone → `POST /api/auth/send-otp` (WhatsApp OTP)
2. User enters OTP → `POST /api/auth/verify-otp` → receives `{ token, user }`
3. Store token in `localStorage.auth_token` + Zustand authStore
4. All subsequent requests use `Authorization: Bearer <token>`
5. Role-based redirect: Customer→`/map`, Driver→`/driver`, Admin→`/admin`

---

## 6. 3-Tier Proximity System (Permanent Lines)

The backend `/api/passenger/match-route` returns `PermanentRoute[]` each with `proximity_tier`:

| Tier | Color | Distance | Display |
|------|-------|----------|---------|
| 1 | 🟢 Green `#059669` | ≤ 500m | قريب جداً |
| 2 | 🟣 Purple `#7c3aed` | ≤ 1500m | قريب |
| 3 | 🔴 Red `#ef4444` | > 1500m | بعيد نسبياً |

Draw each driver route on map with matching color via `drawRoute()`.

---

## 7. Atomic Booking Flow

```
POST /api/bookings/atomic-book { routeId }
  → Backend: UPDATE routes SET available_seats = available_seats - 1
             WHERE id = $1 AND available_seats > 0
  → Returns: { success, remainingSeats }
  → If seats = 0: driver marked full, removed from results
```

Decrement displayed seat count in UI after successful booking without re-fetching.

---

## 8. Real-Time Driver Tracking

**Current:** Polling every 5s via `GET /api/fleet/active-drivers` (implemented in `useDriverPolling.ts`)

**Future (TODO):** Add Socket.io to backend:
```js
// backend: emit on driver location update
io.emit('driver:location', { driverId, lat, lon, heading });
// frontend: replace polling with socket.io-client listener
```

---

## 9. Mapbox Configuration

```
Token: YOUR_MAPBOX_PUBLIC_TOKEN_HERE
Style: mapbox://styles/mapbox/streets-v12
Center: [44.3168, 31.9961]  (Najaf, Iraq)
Zoom: 12
```

Map hook (`useMapbox.ts`) exposes:
- `flyTo(lng, lat, zoom)` — animate to location
- `addMarker(id, lng, lat, color, label)` — pin marker
- `removeMarker(id)` — remove by id
- `drawRoute(id, [[lng,lat]], color)` — draw polyline
- `removeRoute(id)` — remove layer/source

---

## 10. Three-Way Ecosystem Synchronization Architecture

### A. Admin Dashboard (`src/pages/AdminPage.tsx`)
- **Map Line Locking:** Admin can click on any approved driver, click "✏️ رسم مساره", and click waypoints directly on the Mapbox interactive canvas.
- **Route Persistence:** Saves route waypoints to `/api/routes/permanent` with `totalSeats` and `fromName`/`toName`.
- **Live Seat Monitoring:** As passengers book seats from either Web Client or Telegram Bot, the available seats in the Admin routes list decrement in real time.

### B. Telegram Bot (`telegram/telegramBot.js`)
- **Native WebApp Integration:** Sends inline buttons with `web_app: { url: 'https://tawseelaiq.app/?role=Customer&tripType=daily' }`.
- **Direct Telegram Commute Flow:** Supports fallback native command `/start` -> share location -> searches nearby matching routes -> sends inline keyboard with `book_<driverId>`.
- **Synchronized Atomic Booking:** Deducts seat using the exact same atomic transaction as the web app (`db.executeAtomicBooking`).
- **Driver Alerting:** When a booking occurs (either via Web or Telegram), the bot sends instant push notification to the driver's Telegram chat.

### C. Web Client (`src/pages/DailyPage.tsx`)
- **Commute Drawing Tool:** Commuter drops points on the map.
- **Button Unlock:** "إظهار السائقين القريبين" is disabled until at least 2 waypoints are pinned.
- **Spatial 3-Tier Match:** Sends waypoints to `/api/passenger/match-route`. Drivers are rendered in:
  - 🟢 **Tier 1:** ≤ 500m
  - 🟣 **Tier 2:** ≤ 1500m
  - 🔴 **Tier 3:** > 1500m
- **Atomic Booking:** Clicks driver -> opens Modal -> calls `/api/bookings/atomic-book` -> seats decrement immediately.

---

## 11. Next Features for Codex to Implement

### 1. Registration Screen (`src/pages/Register.tsx`)
- Triggered after OTP verification for new users.
- Role selection (Customer / Driver).
- Customer: `fullName`, `governorate` -> `POST /api/auth/complete-passenger-registration`.
- Driver: `fullName`, `vehicleType`, `vehicleColor`, `vehiclePlate`, document photo upload -> `POST /api/auth/complete-driver-registration`.

### 2. Driver Background Geolocation Watcher
- Inside `DriverPage.tsx`: when driver toggles `Online`, start `navigator.geolocation.watchPosition` posting coordinates to `/api/driver/location` every 5 seconds.

### 3. Socket.io Real-Time Upgrade (Optional)
- Replace 5-second polling in `useDriverPolling.ts` and 3-second polling in `RidePage.tsx` with Socket.io client events (`driver:moved`, `ride:status_changed`, `route:seat_decremented`).

---

## 11. Deployment

### Manual Deploy to VPS
```bash
# Build
npm run build

# Upload dist/ to server
scp -r dist/ root@173.212.206.86:/var/www/tawseelaiq-web/

# Nginx config
scp nginx.conf root@173.212.206.86:/etc/nginx/sites-available/tawseelaiq
ssh root@173.212.206.86 "ln -sf /etc/nginx/sites-available/tawseelaiq /etc/nginx/sites-enabled/ && nginx -t && systemctl reload nginx"
```

### Docker Deploy
```bash
docker build -t tawseelaiq-web .
docker run -d -p 80:80 --name tawseelaiq-web tawseelaiq-web
```

### PM2 + Serve (alternative)
```bash
npm install -g serve pm2
pm2 serve dist 3000 --name tawseelaiq-web --spa
pm2 save
```

---

## 12. Environment Variables

```env
VITE_API_BASE_URL=https://tawseelaiq.app
VITE_MAPBOX_TOKEN=YOUR_MAPBOX_PUBLIC_TOKEN_HERE
VITE_MAP_CENTER_LNG=44.3168
VITE_MAP_CENTER_LAT=31.9961
VITE_MAP_ZOOM=12
```

---

## 13. Design System

| Token | Value |
|-------|-------|
| Primary (orange) | `#f97316` |
| Success (green) | `#059669` |
| Danger (red) | `#ef4444` |
| Background | `#0f172a` |
| Card | `rgba(255,255,255,0.05)` |
| Border | `rgba(255,255,255,0.1)` |
| Font | Cairo (Google Fonts, weights 300–800) |
| Direction | RTL (`dir="rtl"`) |

Tailwind utilities used: `bg-white/5`, `border-white/10`, `rounded-2xl`, `backdrop-blur`

---

## 14. Key Implementation Notes

1. **Never break the existing backend** — it serves the Telegram bot and any other clients
2. **All API errors** return `{ message: "..." }` — already handled in `apiFetch()`
3. **Driver status field** in DB is single string — filter Online drivers for map
4. **Booking decrement** must be atomic — use the dedicated `/api/bookings/atomic-book` endpoint, never client-side
5. **Mapbox GL JS v3** — use `mapboxgl.accessToken = ...` before `new mapboxgl.Map()`
6. **RTL** — all text inputs need `dir="rtl"` except phone numbers (`dir="ltr"`)
