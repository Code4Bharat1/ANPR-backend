# API Testing Document

**Project:** ANPR SaaS Platform — Backend  
**Base URL:** `https://api-anpr.nexcorealliance.com` (production) / `http://localhost:5000` (local)  
**Auth:** All protected endpoints require `Authorization: Bearer <accessToken>` header.  
**Scope:** Only endpoints implemented in the current development sessions (FR-3, FR-4, FR-5, FR-7, FR-9, Dedicated DB).

---

## Auth Notes

| Role               | Who                            |
| ------------------ | ------------------------------ |
| `superadmin`       | Platform operator              |
| `admin` / `client` | Subscribing company            |
| `project_manager`  | Client employee managing sites |
| `supervisor`       | Site-level operator            |

Feature-gated endpoints return `403 { code: "FEATURE_NOT_IN_PLAN" }` if the client's plan doesn't include the feature.  
Credit-blocked entry returns `402 { code: "INSUFFICIENT_CREDITS" }`.

---

## 1. Trip Management (FR-3)

### GET /api/trips/active

Returns all vehicles currently inside a site.

**Auth:** supervisor, project_manager, admin, client  
**Query params:**

| Param    | Type     | Required            | Description    |
| -------- | -------- | ------------------- | -------------- |
| `siteId` | ObjectId | if no siteId in JWT | Filter by site |

**Response 200**

```json
{
  "success": true,
  "count": 2,
  "siteId": "664abc...",
  "data": [
    {
      "_id": "665...",
      "tripId": "TR-A1B2C3",
      "vehicleNumber": "TN01AB1234",
      "vehicleType": "TIPPER",
      "vendor": "ABC Constructions",
      "driver": "Ravi Kumar",
      "driverPhone": "9876543210",
      "entryTimeIST": "25 Mar 2026, 09:15 AM",
      "duration": "1h 23m",
      "durationMinutes": 83,
      "isOverstay": false,
      "overstayThreshold": 240,
      "status": "loading",
      "loadStatus": "FULL",
      "entryGate": "Main Gate"
    }
  ]
}
```

---

### GET /api/trips/history

Trip history with filters and pagination.

**Auth:** supervisor, project_manager, admin, client  
**Query params:**

| Param           | Type                                              | Description                         |
| --------------- | ------------------------------------------------- | ----------------------------------- |
| `siteId`        | ObjectId                                          | Filter by site (or uses JWT siteId) |
| `period`        | `today` \| `last7days` \| `last30days`            | Preset date range                   |
| `startDate`     | ISO date                                          | Custom range start                  |
| `endDate`       | ISO date                                          | Custom range end                    |
| `status`        | `INSIDE` \| `EXITED` \| `OVERSTAY` \| `CANCELLED` | Filter by status                    |
| `vehicleNumber` | string                                            | Partial plate match                 |
| `vendorId`      | ObjectId                                          | Filter by vendor                    |
| `page`          | number                                            | Default 1                           |
| `limit`         | number                                            | Default 50, max 200                 |

**Response 200**

```json
{
  "success": true,
  "data": [
    {
      "_id": "665...",
      "tripId": "TR-A1B2C3",
      "vehicleNumber": "TN01AB1234",
      "vendor": "ABC Constructions",
      "entryTime": "25/03/2026, 9:15:00 am",
      "exitTime": "25/03/2026, 11:30:00 am",
      "duration": "2h 15m",
      "durationMinutes": 135,
      "isOverstay": false,
      "overstayThreshold": 240,
      "status": "completed",
      "rawStatus": "EXITED",
      "creditUsed": 2,
      "entryGate": "Main Gate",
      "exitGate": "Main Gate"
    }
  ],
  "total": 142,
  "page": 1,
  "pages": 3
}
```

---

### GET /api/trips/stats

Trip statistics summary.

**Auth:** supervisor, project_manager, admin, client  
**Query params:** `siteId`

**Response 200**

```json
{
  "success": true,
  "data": {
    "total": 142,
    "active": 3,
    "completed": 138,
    "overstay": 1,
    "avgDurationMinutes": 112
  }
}
```

---

### GET /api/trips/export

Export trip history as CSV or Excel.

**Auth:** supervisor, project_manager, admin, client  
**Query params:** same as `/history` + `format=csv` (default) or `format=excel`

**Response:** File download (`text/csv` or `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`)

Columns: `Trip_ID, Vehicle_Number, Vehicle_Type, Vendor, Driver, Entry_Time, Exit_Time, Duration_Minutes, Overstay, Status, Entry_Gate, Exit_Gate, Credits_Used`

---

### GET /api/trips/:id

Single trip detail.

**Auth:** supervisor, project_manager, admin, client  
**Params:** `:id` — MongoDB ObjectId of the trip

**Response 200**

```json
{
  "success": true,
  "data": {
    "_id": "665...",
    "tripId": "TR-A1B2C3",
    "vehicleNumber": "TN01AB1234",
    "vehicleType": "TIPPER",
    "driverName": "Ravi Kumar",
    "driverPhone": "9876543210",
    "vendor": "ABC Constructions",
    "site": "Site Alpha",
    "supervisor": "Suresh M",
    "entryTime": "25/03/2026, 9:15:00 am",
    "exitTime": "--",
    "status": "INSIDE",
    "loadStatus": "FULL",
    "entryGate": "Main Gate",
    "exitGate": "N/A",
    "entryMedia": {
      "anprImage": "vehicles/entry/...",
      "photos": {}
    },
    "exitMedia": {}
  }
}
```

**Error 400** — invalid ObjectId  
**Error 403** — trip belongs to a different site/client  
**Error 404** — trip not found

---

### POST /api/supervisor/vehicles/entry

Create a vehicle entry (manual trip). Deducts 2 credits. Triggers barrier automatically.

**Auth:** supervisor  
**Middleware:** `checkCreditBalance` (blocks if balance < 2)

**Request body**

```json
{
  "vehicleNumber": "TN01AB1234",
  "vehicleType": "TIPPER",
  "driverName": "Ravi Kumar",
  "driverPhone": "9876543210",
  "vendorId": "664abc...",
  "entryGate": "Main Gate",
  "loadStatus": "FULL",
  "countofmaterials": "50 bags",
  "purpose": "Material delivery",
  "notes": "",
  "media": {
    "anprImage": "vehicles/entry/anpr/123.jpg",
    "photos": {
      "frontView": "vehicles/entry/photos/123-front.jpg",
      "backView": null,
      "loadView": null,
      "driverView": null
    },
    "video": null,
    "challanImage": null
  }
}
```

**Response 201**

```json
{
  "success": true,
  "tripId": "TR-A1B2C3",
  "creditUsed": 2,
  "creditBalance": 48,
  "entryMedia": {
    "anprImage": "...",
    "photos": {}
  }
}
```

**Error 402** — insufficient credits  
**Error 409** — vehicle already inside

---

### POST /api/supervisor/vehicles/exit

Close an active trip (vehicle exit).

**Auth:** supervisor

**Request body**

```json
{
  "vehicleId": "665...",
  "exitLoadStatus": "EMPTY",
  "returnMaterialType": "Sand",
  "papersVerified": true,
  "physicalInspection": true,
  "materialMatched": true,
  "exitNotes": "",
  "exitMedia": {
    "anprImage": "vehicles/exit/anpr/123.jpg",
    "photos": {
      "frontView": null,
      "backView": null,
      "loadView": null,
      "driverView": null
    },
    "video": null,
    "challanImage": null
  }
}
```

**Response 200**

```json
{
  "success": true,
  "message": "Vehicle exited successfully",
  "data": {
    "tripId": "665...",
    "exitAt": "2026-03-25T11:30:00.000Z"
  }
}
```

**Error 400** — invalid vehicleId  
**Error 404** — trip not found

---

## 2. Camera / Device Management (FR-4)

### POST /api/devices/register

Register a new ANPR, TOP_CAMERA, BIOMETRIC, or OVERVIEW device.

**Auth:** superadmin  
**Middleware:** `checkDeviceLimit`

**Request body**

```json
{
  "serialNumber": "SN-CAM-001",
  "deviceName": "Entry Camera 1",
  "deviceType": "ANPR",
  "role": "ENTRY",
  "clientId": "663...",
  "siteId": "664...",
  "gateId": "665...",
  "lane": "Lane 1",
  "ipAddress": "192.168.1.10",
  "notes": "Main gate entry camera"
}
```

`deviceType` enum: `ANPR` | `BIOMETRIC` | `TOP_CAMERA` | `OVERVIEW`  
`role` enum: `ENTRY` | `EXIT` | `ENTRY_EXIT` | `MATERIAL_CAPTURE` | `ACCESS_CONTROL`

**Response 201**

```json
{
  "message": "Device registered successfully",
  "data": {
    "_id": "666...",
    "deviceName": "Entry Camera 1",
    "devicetype": "ANPR",
    "role": "ENTRY",
    "gateId": "665...",
    "lane": "Lane 1",
    "serialNo": "SN-CAM-001",
    "ipAddress": "192.168.1.10",
    "isOnline": false,
    "isEnabled": true
  }
}
```

**Error 400** — missing required fields or invalid gateId  
**Error 403** — device limit exceeded or device type not in plan  
**Error 409** — serial number already exists

---

### GET /api/devices/by-gate/:siteId/:gateId

Get all devices assigned to a specific gate, grouped by role.

**Auth:** superadmin, admin, project_manager, supervisor

**Response 200**

```json
{
  "success": true,
  "data": {
    "gateId": "665...",
    "gateName": "Main Gate",
    "isMainGate": true,
    "isActive": true,
    "entryDevices": [
      {
        "_id": "666...",
        "deviceName": "Entry Camera 1",
        "devicetype": "ANPR",
        "role": "ENTRY",
        "isOnline": true,
        "ipAddress": "192.168.1.10",
        "lane": "Lane 1"
      }
    ],
    "exitDevices": [],
    "topCameraDevices": []
  }
}
```

**Error 404** — gate not found

---

### PATCH /api/devices/:id/assign-gate

Move a device to a different gate within a site.

**Auth:** superadmin, admin

**Request body**

```json
{
  "gateId": "667...",
  "siteId": "664..."
}
```

**Response 200**

```json
{
  "success": true,
  "message": "Device assigned to gate",
  "data": { "_id": "666...", "gateId": "667...", ... }
}
```

**Error 400** — gateId does not exist on this site  
**Error 404** — device not found

---

### PATCH /api/devices/:id/heartbeat

Agent marks a device as online. Called by the Raspberry Pi agent on a schedule.

**Auth:** any valid JWT

**Response 200**

```json
{
  "success": true,
  "lastActive": "2026-03-25T09:15:00.000Z"
}
```

**Error 404** — device not found

---

## 3. Barrier Automation (FR-5)

> The barrier is physically part of the ANPR camera. Commands route via WebSocket to the on-site Raspberry Pi agent. State is tracked by persisting the agent's response as a `BarrierEvent`.

### POST /api/barrier/open

Manually open the barrier.

**Auth:** supervisor, project_manager, admin  
**Feature gate:** `barrierAutomation` (CORE plan and above)

**Request body**

```json
{
  "tripId": "665..."
}
```

`tripId` is optional — links the event to a trip for audit purposes.

**Response 200**

```json
{
  "success": true,
  "state": "OPEN",
  "message": "Barrier opened",
  "timestamp": "2026-03-25T09:15:00.000Z"
}
```

**Response 503** — agent offline, timeout, or camera error

```json
{
  "success": false,
  "state": "ERROR",
  "message": "Agent timeout",
  "timestamp": "2026-03-25T09:15:00.000Z"
}
```

**Error 403** — `FEATURE_NOT_IN_PLAN` if plan is LITE

---

### POST /api/barrier/close

Manually close the barrier.

**Auth:** supervisor, project_manager, admin  
**Feature gate:** `barrierAutomation`

> **Note:** Agent does not yet implement `CLOSE_BARRIER`. This will return 503 until the Pi-side agent is updated.

**Request body:** `{}` (empty)

**Response 200**

```json
{
  "success": true,
  "state": "CLOSED",
  "message": "Barrier closed",
  "timestamp": "2026-03-25T09:15:00.000Z"
}
```

**Response 503** — agent not yet supporting close command

---

### GET /api/barrier/status

Get the last known barrier state for the caller's site.

**Auth:** supervisor, project_manager, admin  
**Query params:**

| Param    | Required           | Description   |
| -------- | ------------------ | ------------- |
| `siteId` | only if not in JWT | Override site |

**Response 200 — event exists**

```json
{
  "success": true,
  "state": "OPEN",
  "action": "OPEN",
  "trigger": "AUTO_ENTRY",
  "lastUpdated": "2026-03-25T09:15:00.000Z"
}
```

`state` enum: `OPEN` | `CLOSED` | `ERROR` | `UNKNOWN`  
`trigger` enum: `MANUAL` | `AUTO_ENTRY` | `AUTO_EXIT` | `BIOMETRIC`

**Response 200 — no events yet**

```json
{
  "success": true,
  "state": "UNKNOWN",
  "lastUpdated": null,
  "message": "No barrier events recorded for this site"
}
```

**Error 400** — siteId missing

---

### POST /api/barrier/login

Authenticate the agent to the camera. Used during initial setup.

**Auth:** none required

**Request body:** `{}` (empty)

**Response 200**

```json
{
  "success": true,
  "message": "Barrier login successful"
}
```

---

## 4. Credit System (FR-7)

### GET /api/credits/balance

Get credit balance for a client.

**Auth:** client, project_manager, superadmin  
**Query params (superadmin only):** `?clientId=663...`

**Response 200**

```json
{
  "success": true,
  "data": {
    "clientId": "663...",
    "companyName": "ABC Corp",
    "balance": 48,
    "threshold": 10,
    "isBelowThreshold": false,
    "lastTopup": {
      "amount": 100,
      "at": "2026-03-20T10:00:00.000Z"
    }
  }
}
```

---

### POST /api/credits/topup

Add credits to a client account.

**Auth:** superadmin only

**Request body**

```json
{
  "clientId": "663...",
  "amount": 100,
  "notes": "Monthly top-up"
}
```

`amount` must be a positive integer.

**Response 201**

```json
{
  "success": true,
  "message": "100 credits added successfully",
  "data": {
    "newBalance": 148,
    "ledgerEntry": {
      "_id": "667...",
      "clientId": "663...",
      "eventType": "TOPUP",
      "credits": 100,
      "balanceBefore": 48,
      "balanceAfter": 148,
      "createdAt": "2026-03-25T10:00:00.000Z"
    }
  }
}
```

**Error 400** — missing fields, non-integer amount, or negative amount  
**Error 404** — client not found

---

### GET /api/credits/ledger

Paginated credit ledger history.

**Auth:** client, project_manager, superadmin  
**Query params:**

| Param      | Default  | Description                        |
| ---------- | -------- | ---------------------------------- |
| `clientId` | from JWT | Superadmin only — query any client |
| `page`     | 1        | Page number                        |
| `limit`    | 20       | Max 100                            |

**Response 200**

```json
{
  "success": true,
  "data": {
    "entries": [
      {
        "_id": "667...",
        "eventType": "ENTRY",
        "credits": -2,
        "balanceBefore": 50,
        "balanceAfter": 48,
        "tripId": "665...",
        "createdAt": "2026-03-25T09:15:00.000Z"
      }
    ],
    "total": 42,
    "page": 1,
    "pages": 3
  }
}
```

`eventType` enum: `ENTRY` | `EXIT` | `TOPUP` | `ADJUSTMENT`

---

### PATCH /api/credits/threshold

Update the low-balance alert threshold for a client.

**Auth:** superadmin only

**Request body**

```json
{
  "clientId": "663...",
  "threshold": 20
}
```

**Response 200**

```json
{
  "success": true,
  "message": "Threshold updated",
  "data": {
    "creditBalance": 48,
    "creditThreshold": 20
  }
}
```

**Error 400** — negative threshold

---

### Superadmin convenience aliases

These are identical to the above but mounted under `/api/superadmin/credits/`:

| Method | Path                                        | Same as                  |
| ------ | ------------------------------------------- | ------------------------ |
| POST   | `/api/superadmin/credits/topup`             | `/api/credits/topup`     |
| GET    | `/api/superadmin/credits/balance?clientId=` | `/api/credits/balance`   |
| GET    | `/api/superadmin/credits/ledger?clientId=`  | `/api/credits/ledger`    |
| PATCH  | `/api/superadmin/credits/threshold`         | `/api/credits/threshold` |

---

## 5. Plan-Based Feature Gating (FR-9)

### GET /api/client-admin/plan-info

Returns the client's current plan, feature flags, and live usage vs limits.

**Auth:** client, admin

**Response 200**

```json
{
  "success": true,
  "data": {
    "plan": "PRO",
    "features": {
      "barrierAutomation": true,
      "biometricOpening": true,
      "topCamera": true,
      "aiAnalytics": false,
      "dedicatedDB": false
    },
    "limits": {
      "sites": {
        "limit": 5,
        "used": 2
      },
      "pm": { "limit": 3, "used": 1 },
      "supervisor": {
        "limit": 6,
        "used": 3
      },
      "devices": {
        "ANPR": {
          "limit": 1,
          "used": 1
        },
        "BIOMETRIC": {
          "limit": 1,
          "used": 0
        },
        "TOP_CAMERA": {
          "limit": 1,
          "used": 0
        },
        "OVERVIEW": {
          "limit": 2,
          "used": 0
        }
      }
    },
    "overrides": {
      "featuresOverride": {},
      "siteLimits": null
    }
  }
}
```

---

### PATCH /api/superadmin/clients/:id/plan-override

Override plan limits or feature flags for a specific client.

**Auth:** superadmin

**Request body** (all fields optional — only send what you want to change)

```json
{
  "featuresOverride": {
    "barrierAutomation": true,
    "aiAnalytics": false
  },
  "deviceLimits": {
    "ANPR": 5
  },
  "userLimits": {
    "pm": 5,
    "supervisor": 10
  },
  "siteLimits": 8
}
```

**Response 200**

```json
{
  "success": true,
  "message": "Plan override updated",
  "data": { ... updated client object ... }
}
```

---

## 6. Dedicated Database Provisioning (SRS §10)

> ENTERPRISE plan only. Connection string is stored AES-256-GCM encrypted.

### POST /api/superadmin/clients/:id/provision-db

Provision a dedicated MongoDB cluster for an ENTERPRISE client.

**Auth:** superadmin

**Request body**

```json
{
  "connectionString": "mongodb+srv://user:pass@cluster.mongodb.net",
  "dbName": "client_abc_prod"
}
```

`dbName` is optional — if omitted, the default DB name from the URI is used.

**Response 200**

```json
{
  "success": true,
  "message": "Dedicated DB provisioned successfully",
  "data": {
    "mode": "dedicated",
    "dbName": "client_abc_prod"
  }
}
```

**Error 400** — connectionString missing  
**Error 403** — client is not on ENTERPRISE plan  
**Error 404** — client not found

---

### DELETE /api/superadmin/clients/:id/provision-db

Revert a client back to the shared database.

**Auth:** superadmin

**Request body:** none

**Response 200**

```json
{
  "success": true,
  "message": "Client reverted to shared DB"
}
```

---

## 7. Common Error Responses

| Status | Code                    | When                                              |
| ------ | ----------------------- | ------------------------------------------------- |
| 400    | —                       | Missing or invalid request fields                 |
| 401    | —                       | No or expired access token                        |
| 402    | `INSUFFICIENT_CREDITS`  | Credit balance < 2 on vehicle entry               |
| 403    | `FEATURE_NOT_IN_PLAN`   | Feature not available in client's plan            |
| 403    | `DEVICE_LIMIT_EXCEEDED` | Device count at plan limit                        |
| 403    | `SITE_LIMIT_EXCEEDED`   | Site count at plan limit                          |
| 403    | `USER_LIMIT_EXCEEDED`   | PM or supervisor count at plan limit              |
| 403    | `CLIENT_INACTIVE`       | Client account deactivated                        |
| 404    | —                       | Resource not found                                |
| 409    | —                       | Duplicate (serial number, vehicle already inside) |
| 503    | —                       | Agent offline, timeout, or barrier command failed |

---

## 8. Testing Notes

**Prerequisite env vars for local testing:**

```
MONGO_URI=mongodb://localhost:27017/anpr_test
ACCESS_TOKEN_SECRET=<any string>
REFRESH_TOKEN_SECRET=<any string>
ACCESS_TOKEN_EXPIRY=12h
REFRESH_TOKEN_EXPIRY=7d
DB_ENCRYPTION_KEY=<64-char hex>   # only needed for dedicated DB endpoints
```

**Login first to get a token:**

```
POST /api/auth/login
{ "identifier": "supervisor@test.com", "password": "password123" }
```

**Barrier endpoints require a connected agent.** Without the Pi agent running, all barrier commands return `503 { state: "ERROR", message: "No agent connected" }` — this is expected behaviour, not a bug.

**Dedicated DB endpoints** require `DB_ENCRYPTION_KEY` to be set. Without it, `POST /provision-db` will throw a 500 error about the missing key.
