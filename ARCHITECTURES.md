# Arsitektur gTeach

Dokumen ini menjelaskan arsitektur **sebagaimana yang benar-benar diimplementasikan** di project ini (bukan rencana ideal). Semua nama folder, pola, dan aturan di bawah ini tercermin di kode.

---

## Daftar Isi

1. [Gambaran Umum](#1-gambaran-umum)
2. [Struktur Folder & Fungsi Tiap Layer](#2-struktur-folder--fungsi-tiap-layer)
3. [Alur Data](#3-alur-data)
4. [Aturan Dependency](#4-aturan-dependency)
5. [Pola Khusus yang Dipakai](#5-pola-khusus-yang-dipakai)
6. [Alur Pembuatan Fitur Baru](#6-alur-pembuatan-fitur-baru)
7. [Prinsip Utama](#7-prinsip-utama)

---

## 1. Gambaran Umum

| Aspek | Pilihan aktual |
|---|---|
| Framework | Next.js 16 (App Router) + React 19, **JavaScript (JSX)** — tanpa TypeScript |
| Database & Auth | PocketBase (self-hosted, data di `pb_data/`), SDK `pocketbase` |
| Auth session | Cookie `pb_auth` (JSON berisi `token` + `record`), dibaca oleh `proxy.js` dan server |
| Styling | Tailwind CSS v4 (`app/globals.css`) |
| Server Actions | Next.js Server Actions (`"use server"`) sebagai jembatan client → server |
| REST API | Hanya `app/api/ocr/route.js` (OCR nilai via Groq vision) |
| Export/Cetak | ExcelJS + file-saver (Excel), jsPDF + html2canvas + html-to-image (PDF/gambar rapor) |
| OCR | Tesseract.js (client) + Groq API (`GROQ_API_KEY`) untuk baca nilai tulisan tangan |
| Role | `admin`, `ict`, `guru walikelas`, `guru pendamping`, `guru mapel`, `wali murid` |

---

## 2. Struktur Folder & Fungsi Tiap Layer

```
gteach/
├── app/                  # Next.js App Router: halaman (page.js) & layout per role
│   ├── (auth)/           #   login & login-wali-murid (login via pb langsung di client)
│   ├── (dashboard)/      #   admin/ ict/ walikelas/ guru-mapel/ wali-murid/ — tiap role punya layout.js (sidebar) + page.js
│   └── api/ocr/          #   SATU-satunya REST route handler (POST gambar → hasil OCR JSON)
├── actions/              # Server Actions ("use server") — jembatan tipis client → services
├── services/             # Logika bisnis; selalu mengembalikan objek polos { data, error } / { success, error }
├── repositories/         # Satu-satunya layer yang menyentuh PocketBase di server ("server-only")
├── components/           # Komponen UI reusable (pola Atomic Design, jumlahnya masih sedikit)
│   ├── atoms/  molecules/  organism/  template/
├── lib/                  # Koneksi & utilitas bersama
├── proxy.js              # Pengganti middleware (Next ≥ 15.5): auth + otorisasi per role via cookie pb_auth
├── pb_data/              # Data & skema PocketBase (pb_schema.json)
└── ARCHITECTURES.md      # Dokumen ini
```

> **Catatan:** Folder `types/`, `validators/`, `hooks/`, dan `constants/` **belum ada** — project ini masih JavaScript polos tanpa deklarasi tipe terpisah.

### `app/` — Halaman & Layout (UI Layer)

- Setiap halaman adalah **Client Component** (`"use client"`) dan mengelola state lokalnya sendiri (`useState`, `useEffect`, `useTransition`).
- `layout.js` per role membangun **sidebar navigasi** + cek sesi (`pb.authStore.isValid`) + tombol logout.
- Halaman memanggil **dua jalur**:
  1. **Server Actions** (`@/actions/...`) untuk data yang butuh logika bisnis/logging, dan
  2. **`lib/db.js`** (CRUD generik) atau **`lib/pocketbase.js`** langsung untuk query sederhana — ini penyimpangan pragmatis yang memang dipakai (65 file memakai `pb` langsung, 47 memakai `lib/db`).
- Halaman login (`app/(auth)/`) memanggil `pb.authWithPassword(...)` **langsung di client**, lalu token disimpan ke cookie lewat `pb.authStore.onChange`.

### `actions/` — Server Actions

- Diawali `"use server"`, dan **sangat tipis**: menerima argumen dari client lalu meneruskan ke `services/`.
- Contoh pola (`actions/ict-system-logs.action.js`):
  ```js
  "use server";
  import * as ictSystemLogsService from "@/services/ict-system-logs.service";

  export async function getSystemLogs(params) {
    return ictSystemLogsService.getSystemLogs(params);
  }
  ```
- Aturan: **jangan tulis logika bisnis di sini**, jangan query database langsung (wajib lewat `services/`). Tidak ada `revalidatePath` — halaman memuat ulang data via pemanggilan action ulang.

### `services/` — Logika Bisnis

- Menggabungkan beberapa query dari `repositories/`, lalu mapping/filter/sorting/validasi aturan bisnis.
- **Konvensi return value wajib objek polos** (serializable untuk crossing server-action boundary):
  - `{ data, error }` — pola umum (`record.service.js`, `ict-system-logs.service.js`)
  - `{ success, error, record }` — pola untuk operasi dengan hasil spesifik (`profile.service.js`)
- Memakai `describeError()` dari `lib/app-error.js` untuk menormalisasi pesan error PocketBase.
- **Boleh memanggil service lain** untuk efek samping bersama, mis. `import { writeLog } from "@/services/systemLog.service"` untuk mencatat aktivitas ke `system_log`.
- Dilarang mengembalikan `NextResponse`, mengakses cookie/headers langsung.

### `repositories/` — Lapisan Akses Data

- Diawali `import "server-only"` — dijamin tidak akan ikut ter-bundle ke client.
- Tidak membuat instance PocketBase sendiri; selalu lewat `lib/pocketbase.server.js`:
  - `getServerPb()` → instance dengan **token user pemanggil** (dibaca dari cookie `pb_auth`), sehingga **rules/permissions koleksi PocketBase tetap berlaku**.
  - `getAdminPb()` → instance **superuser** (`_superusers`), hanya untuk operasi khusus yang memang perlu bypass rules (mis. `repositories/user.repository.js` untuk update profil/TTD user, `repositories/onboarding.repository.js` untuk backup database).
- `repositories/record.repository.js` adalah repository **generik**: `findFullList/findList/findOne/findFirst/insert/modify/remove(collection, ...)` dengan `assertAllowedCollection()` — hanya koleksi yang terdaftar di `ALLOWED_COLLECTIONS` yang boleh diakses lewat jalur generik.
- Satu file repository per fitur, nama fungsi bernada query (`findKelasByWalikelas`, `findMapelByTingkat`).

### `lib/` — Koneksi & Utilitas

| File | Fungsi |
|---|---|
| `lib/pocketbase.js` | Singleton `pb` untuk **client** (`NEXT_PUBLIC_POCKETBASE_URL`); `authStore.onChange` → sync otomatis ke cookie `pb_auth`; helper `isAuthenticated()`, `getCurrentUser()`, `logout()` |
| `lib/pocketbase.server.js` | `getServerPb()`, `getAdminPb()`, `assertAllowedCollection()` + `ALLOWED_COLLECTIONS` (allowlist koleksi untuk server action) |
| `lib/db.js` | Wrapper CRUD generik di atas `actions/record.action.js` — membuka `{ data, error }` menjadi nilai langsung atau exception, sehingga pemakaian di halaman terasa seperti SDK |
| `lib/logger.js` | `createSystemLog({ type, msg, endpoint, statusCode, payload })` → memanggil `actions/systemLog.action.js` (client-side logging) |
| `lib/app-error.js` | `describeError(error)` — ambil pesan ramah dari `error.response.data` PocketBase |
| `lib/excel-export.js` | `"use client"` — helper ExcelJS (`newWorkbook`, `addSheet`, `saveWorkbook`) + `HEADER_LABELS` untuk export Excel dari halaman |

### `components/` — Komponen Reusable

- Mengikuti pola **Atomic Design**: `atoms/` (heading, paragraph, modal), `molecules/` (button), `organism/` (table, dashboard card), `template/` (template mapel).
- Saat ini masih sedikit (7 file); mayoritas UI halaman masih ditulis langsung di `app/.../page.js` dan `layout.js`.
- Aturan keras: komponen client **tidak boleh mengimpor `services/` atau `repositories/`** (akan membocorkan kredensial server ke browser).

### `proxy.js` — Auth & Otorisasi (pengganti middleware)

- Next ≥ 15.5 memakai `proxy.js` (bukan `middleware.js`), diekspor sebagai `export function proxy(request)`.
- Membaca cookie `pb_auth` → dapat `token` + `record` (role dari `record.role`, atau `"wali murid"` bila `collectionName === "wali_murid"`).
- Tiga "benteng":
  1. Belum login mengakses route terproteksi → redirect ke `/login` (atau `/login-wali-murid` untuk `/wali-murid`).
  2. Sudah login membuka halaman login → redirect ke dashboard sesuai role (`ROLE_REDIRECTS`).
  3. Role tidak berhak atas prefix route (`ROUTE_ACCESS`) → redirect ke dashboardnya sendiri.

---

## 3. Alur Data

**Alur utama (via Server Actions):**

```
[Client: app/ page.js]
   │  (1. panggil action)
   ▼
actions/*.action.js      ("use server", tipis)
   │  (2. jalankan logika bisnis)
   ▼
services/*.service.js    (gabung beberapa query, return { data, error })
   │  (3. query CRUD)
   ▼
repositories/*.repository.js   ("server-only", getServerPb()/getAdminPb())
   │  (4. HTTP ke PocketBase dengan token user / superuser)
   ▼
[PocketBase — rules koleksi tetap berlaku]
```

**Alur cepat (CRUD generik tanpa logika khusus):**

```
[Client page]
   │  import { db } from "@/lib/db"
   ▼
lib/db.js ──► actions/record.action.js ──► services/record.service.js ──► repositories/record.repository.js
                    │                          │  • auto isi tahun_ajaran_id (semester aktif, cache 60 dtk)
                    │                          │  • auto tulis system_log untuk setiap create/update/delete
                    ▼
              return { data, error } → di-unwrap menjadi nilai langsung / throw
```

**Alur REST (pengecualian):**

```
[Client] ──POST { imageBase64 }──► app/api/ocr/route.js ──► Groq API ──► JSON hasil OCR
```

**Alur auth:**

```
login page (client) ──pb.authWithPassword──► PocketBase
        └─ authStore.onChange ──► cookie pb_auth ──► dibaca proxy.js (tiap request) & getServerPb() (tiap server action)
```

---

## 4. Aturan Dependency

```
app/ (client)  ──►  actions/  ──►  services/  ──►  repositories/  ──►  PocketBase
   │    └────────►  lib/db.js ─┘        │                │
   │                                       │                └──► lib/pocketbase.server.js
   └────────────►  lib/pocketbase.js (client, untuk auth & query langsung)

lib/app-error.js, lib/logger.js  <── dipakai semua layer server
lib/excel-export.js              <── dipakai client (halaman)
```

| Posisi | Boleh mengimpor | Catatan |
|---|---|---|
| `app/` (client) | `actions/`, `lib/db`, `lib/pocketbase`, `lib/excel-export`, `components/` | Boleh juga `pb.collection(...)` langsung untuk query/realtime sederhana (dipakai 65 file) — tidak membocorkan kredensial karena rules PocketBase tetap berlaku via token user di cookie |
| `actions/` | `services/` | Tipis saja; tanpa logika bisnis |
| `services/` | `repositories/`, `lib/app-error`, **service lain** (mis. `systemLog.service` untuk logging) | Return selalu objek polos |
| `repositories/` | `lib/pocketbase.server` | Wajib `"server-only"`; koleksi generik dibatasi `ALLOWED_COLLECTIONS` |
| `components/` | `lib/`, `actions/` | Jangan impor `services/`/`repositories/` |
| `app/api/` | `services/` (saat ini hanya OCR yang memanggil API eksternal langsung) | |

---

## 5. Pola Khusus yang Dipakai

1. **CRUD generik + auto-log** — `record.action/service/repository` + `lib/db.js`: untuk koleksi apa pun yang sudah ada di `ALLOWED_COLLECTIONS`, cukup `db.getList("siswa", 1, 20, {...})`. Setiap create/update/delete otomatis mencatat ke `system_log`, dan `tahun_ajaran_id` diisi otomatis dari semester aktif.
2. **Dua jalur koneksi PocketBase** — `getServerPb()` (token user, rules berlaku) vs `getAdminPb()` (superuser, hanya untuk yang benar-benar perlu bypass rules seperti update user & backup DB).
3. **Audit log bawaan** — `systemLog.service` / `lib/logger.js`; service fitur biasanya memanggil `writeLog(...)` setelah aksinya berhasil.
4. **Auth via cookie + proxy** — tidak ada session server; `proxy.js` membaca cookie `pb_auth` untuk semua keputusan redirect.
5. **Client-side export** — Excel via `lib/excel-export.js` (ExcelJS + file-saver), PDF/gambar rapor via jsPDF/html2canvas langsung di halaman print.
6. **OCR nilai** — `app/api/ocr/route.js` memanggil Groq dengan prompt khusus membaca lembar nilai tulisan tangan (NIS + nilai K1–K4 per TP).

---

## 6. Alur Pembuatan Fitur Baru

1. **Query data** → `repositories/<fitur>.repository.js` (fungsi bernama `findXxx/createXxx/...`, pakai `getServerPb()`).
2. **Logika bisnis** → `services/<fitur>.service.js` (gabungkan repository, panggil `writeLog` bila perlu, return `{ data, error }`).
3. **Pintu masuk client** → `actions/<fitur>.action.js` (`"use server"`, tipis, teruskan ke service).
4. **Tampilan** → `app/(dashboard)/<role>/<fitur>/page.js` (client component, panggil action; untuk CRUD sederhana bisa langsung `db` dari `lib/db.js`).
5. **Bila koleksi baru**: tambahkan ke `ALLOWED_COLLECTIONS` di `lib/pocketbase.server.js` bila perlu diakses via CRUD generik.
6. **Bila butuh route non-action** (webhook, upload eksternal): buat `app/api/<nama>/route.js`.
7. **Bila perlu komponen yang dipakai di banyak tempat**: letakkan di `components/` sesuai level atomiknya.

---

## 7. Prinsip Utama

1. **Satu file satu fitur** — penamaan `actions/`, `services/`, `repositories/` selalu berpasangan per fitur (`<fitur>.action.js` ↔ `<fitur>.service.js` ↔ `<fitur>.repository.js`).
2. **Server-only dijaga ketat** — semua akses DB server melewati `repositories/` yang bertanda `"server-only"`; client hanya lewat action / `lib/db` / `pb` dengan rules PocketBase sebagai pengaman.
3. **Respons selalu objek polos** — `{ data, error }` / `{ success, error }` agar aman melintasi batas server action.
4. **Pragmatisme terukur** — memakai `pb` langsung di client untuk query/realtime sederhana itu disengaja dan aman (token user + rules), selama logika bisnis tetap di `services/`.
