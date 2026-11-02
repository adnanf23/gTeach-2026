## Daftar Isi

1. [Alur Pembuatan Fitur Baru](#alur-pembuatan-fitur-baru)
2. [Detail Fungsi Tiap Folder & Layer](#detail-fungsi-tiap-folder--layer)
3. [Gambaran Arsitektur & Alur Data](#gambaran-arsitektur--alur-data)
4. [Tabel Cepat Dependency](#tabel-cepat-dependency)
5. [3 Prinsip Utama](#3-prinsip-utama)

---

## Alur Pembuatan Fitur Baru

Saat Anda ingin menambahkan fitur baru ke dalam aplikasi, ikuti urutan hierarki dari bawah ke atas berikut ini:

```
1. Tentukan bentuk datanya          →  types/
2. Bikin validasi formatnya         →  validators/
3. Bikin query ke database          →  repositories/
4. Bikin logika bisnisnya           →  services/
5. Bikin pintu masuk dari React     →  actions/
6. Bikin tampilannya                →  components/
```

**Contoh: Fitur "Lupa Password"**

1. **`types/auth.ts`** → Mendefinisikan tipe data form email.
2. **`validators/auth.validator.ts`** → Membuat fungsi pengecekan apakah format email valid.
3. **`repositories/user.repository.ts`** → Membuat query database untuk mencari user berdasarkan email.
4. **`services/auth.service.ts`** → Menulis logika bisnis (misal: cek apakah email terdaftar, lalu generate token reset).
5. **`actions/auth.action.ts`** → Server action sebagai jembatan yang menerima data dari client, memvalidasinya, lalu memanggil service.
6. **`components/auth/ForgotPasswordForm.tsx`** → Komponen UI form input email dan tombol submit.

---

## Detail Fungsi Tiap Folder & Layer

Berikut adalah penjabaran mendalam mengenai tugas, aturan, serta batasan dari masing-masing folder di dalam project:

### 1. `types/` — Definisi Bentuk Data

- **Fungsi Utama:** Menyimpan seluruh definisi tipe data TypeScript (`type` dan `interface`) yang digunakan secara global maupun spesifik di dalam aplikasi.
- **Tanggung Jawab:** Menjadi sumber kebenaran tunggal (_single source of truth_) untuk struktur objek, payload API, bentuk data database, dan state form.
- **Aturan Ketat:**
  - ✅ Hanya boleh berisi deklarasi tipe data (`type` / `interface`).
  - ❌ Dilarang keras menuliskan fungsi, logika, atau implementasi kode apa pun.
  - ❌ Dilarang mengimpor library eksternal yang berkaitan dengan framework (React, Next.js) atau database (PocketBase).
  - 🟢 Boleh saling mengimpor antar file di dalam folder `types/`.

### 2. `validators/` — Pengecekan Format & Sanitasi Input

- **Fungsi Utama:** Memastikan bahwa data mentah yang dimasukkan oleh pengguna atau dari sumber luar memiliki format yang benar (_pure functions_).
- **Tanggung Jawab:**
  - Mengecek format string (contoh: apakah email memiliki karakter `@`, apakah panjang password minimal 8 karakter).
  - Mengembalikan pesan error validasi per field jika format tidak sesuai.
- **Aturan Ketat:**
  - ✅ Hanya bertugas mengecek **format**, bukan aturan bisnis (contoh: validasi format email benar VS cek apakah email sudah dipakai orang lain di database).
  - ✅ Wajib dapat digunakan di dua sisi: **Client-side** (untuk instan feedback/UX) dan **Server-side** (untuk keamanan mutlak).
  - ❌ Dilarang melakukan query database atau mengakses `services/` dan `repositories/`.
  - 🟢 Hanya boleh mengimpor dari folder `types/`.

### 3. `repositories/` — Lapisan Akses Data (Database Layer)

- **Fungsi Utama:** Menjadi satu-satunya pintu gerbang komunikasi antara aplikasi dengan database (PocketBase).
- **Tanggung Jawab:**
  - Melakukan operasi CRUD murni (`create`, `read`, `update`, `delete`).
  - Membungkus fungsi-fungsi bawaan SDK database agar kode aplikasi bersih dari detail implementasi driver database.
- **Aturan Ketat:**
  - ✅ Penamaan fungsi sebaiknya mencerminkan operasi data/SQL (contoh: `findByEmail`, `createPost`, `updateUserStatus`).
  - ❌ Dilarang menyelipkan logika bisnis atau validasi format di sini. Lapisan ini asumsikan data yang masuk sudah bersih.
  - ❌ Dilarang dipanggil langsung dari UI (`components/`) atau Server Actions (`actions/`). Harus lewat `services/`.
  - **Keuntungan:** Jika suatu saat Anda ingin mengganti database (misal dari PocketBase ke Supabase atau Prisma), Anda **hanya perlu mengubah kode di dalam folder `repositories/`** saja tanpa merusak logika aplikasi yang lain.

### 4. `services/` — Logika Bisnis (Business Logic Layer)

- **Fungsi Utama:** Menjadi jantung atau otak dari aplikasi tempat seluruh aturan main, proses, dan skenario bisnis dijalankan.
- **Tanggung Jawab:**
  - Menggabungkan data dari repository, menjalankan pengecekan aturan bisnis (contoh: "User dengan role 'guest' tidak boleh menghapus produk", "Stok barang harus lebih dari 0 sebelum checkout").
  - Mengatur transaksi data yang kompleks.
- **Aturan Ketat:**
  - ✅ Mengembalikan objek biasa (biasanya berupa response status sukses/gagal beserta data atau pesan error).
  - ❌ **Buta teknologi web:** Lapisan ini tidak boleh tahu tentang React, Next.js, HTTP status code (`NextResponse`), cookie, atau header browser.
  - ❌ Dilarang memanggil database secara langsung; wajib memanggil fungsi dari `repositories/`.

### 5. `actions/` — Server Actions (Pintu Masuk dari React)

- **Fungsi Utama:** Menghubungkan interaksi pengguna di browser (Client Component) dengan logika backend di server menggunakan mekanisme Server Actions Next.js (`"use server"`).
- **Tanggung Jawab:**
  - Menangkap data yang dikirim dari form atau event UI React.
  - Menjalankan validasi server-side wajib menggunakan `validators/`.
  - Memanggil `services/` untuk mengeksekusi logika bisnis.
  - Mengatur revalidasi cache (`revalidatePath`, `revalidateTag`) atau redirect halaman jika diperlukan.
- **Aturan Ketat:**
  - ✅ Wajib menyertakan `"use server"` di baris paling atas file.
  - ✅ File harus dibuat ringkas dan padat (fokus sebagai perantara, bukan tempat menulis logika bisnis).
  - ❌ Dilarang melakukan query database langsung ke `repositories/`.

### 6. `app/api/` — REST API Endpoints (Opsional)

- **Fungsi Utama:** Menyediakan endpoint HTTP standar (Route Handlers) jika aplikasi Anda perlu diakses oleh pihak ketiga, aplikasi mobile, atau webhook eksternal.
- **Tanggung Jawab:** Menerima request HTTP (`GET`, `POST`, `PUT`, `DELETE`), memparsing parameter/body, memanggil `services/`, lalu mengembalikan response HTTP JSON.
- **Aturan Ketat:**
  - ❌ Dilarang menulis logika bisnis langsung di dalam route handler. Semuanya harus didelegasikan ke `services/`.

### 7. `components/` — Tampilan Antarmuka (UI Layer)

- **Fungsi Utama:** Merender elemen visual yang dilihat dan berinteraksi langsung dengan pengguna (Tombol, Form, Modal, Layout).
- **Tanggung Jawab:**
  - Mengelola state lokal komponen React (`useState`, `useTransition`, dll).
  - Memanggil `actions/` saat tombol diklik atau form disubmit.
  - Menampilkan pesan error validasi visual kepada pengguna.
- **Aturan Ketat:**
  - ✅ Hanya berisi kode JSX, styling (Tailwind CSS), dan React hooks.
  - ❌ **Dilarang keras** mengimpor `services/` atau `repositories/`. Mengimpor database/service di komponen client akan membocorkan kredensial rahasia ke browser pengguna!

### 8. `hooks/` — Custom React Hooks

- **Fungsi Utama:** Wadah untuk mengekstrak dan menggunakan kembali logika stateful React antar komponen (contoh: `useDebounce`, `useAuth`, `useLocalStorage`).
- **Tanggung Jawab:** Menyederhanakan kode di dalam `components/` agar tidak terlalu panjang oleh logika state management yang kompleks.

### 9. `lib/` — Utility & Konfigurasi Pihak Ketiga

- **Fungsi Utama:** Menyimpan fungsi-fungsi pembantu umum (_helper functions_) dan inisialisasi klien library eksternal.
- **Contoh Isi:**
  - `pocketbase.ts` (inisialisasi instance koneksi PocketBase).
  - `utils.ts` (fungsi penggabung class Tailwind seperti `cn()`, format tanggal, format mata uang).

### 10. `constants/` — Konstanta Global

- **Fungsi Utama:** Menyimpan nilai tetap yang tidak boleh berubah-ubah selama aplikasi berjalan guna menghindari _magic strings_.
- **Contoh Isi:** Daftar routing URL aplikasi (`ROUTES.LOGIN`, `ROUTES.DASHBOARD`), konfigurasi pagination, atau daftar role user.

---

## Gambaran Arsitektur & Alur Data

### Alur Eksekusi Data

```
[User / Browser]
│  (1. Submit Form / Klik)
▼
components/     ← Menerima input, menampilkan UI
│  (2. Kirim data via Server Action)
▼
actions/        ← Validasi server & panggil service
│  (3. Jalankan proses bisnis)
▼
services/       ← Aturan main & logika aplikasi
│  (4. Query CRUD data)
▼
repositories/   ← Eksekusi perintah database
│  (5. Simpan/Ambil data)
▼
[Database / PocketBase]
```

### Aturan Dependency (Satu Arah)

```
components/  ──>  actions/  ──>  services/  ──>  repositories/  ──>  [Database]
│                 │              │
└─> validators/ ──┘              │
                                 │
types/   <── Digunakan oleh SEMUA layer di atas
lib/     <── Digunakan oleh SEMUA layer di atas
```

**Aturan Emas:** Panah dependency **hanya boleh satu arah ke kanan/bawah**. Layer atas boleh memanggil layer di bawahnya, tetapi layer bawah **haram hukumnya** memanggil layer di atasnya (untuk mencegah siklus circular dependency).

---

## Tabel Cepat Dependency

| Posisi Anda di Folder... | Boleh Mengimpor Dari...                               | Dilarang Keras Mengimpor Dari...                    |
| ------------------------ | ----------------------------------------------------- | --------------------------------------------------- |
| `types/`                 | `types/` lainnya                                      | Semua layer lain                                    |
| `validators/`            | `types/`                                              | `services/`, `repositories/`, `components/` (React) |
| `repositories/`          | `types/`, `lib/pocketbase`                            | `services/`, `validators/`, `components/` (React)   |
| `services/`              | `types/`, `validators/`, `repositories/`, `lib/`      | React, Next.js, `NextResponse`                      |
| `actions/`               | `types/`, `validators/`, `services/`                  | `repositories/` secara langsung                     |
| `app/api/`               | `types/`, `validators/`, `services/`                  | `repositories/` secara langsung                     |
| `components/`            | `types/`, `validators/`, `actions/`, `lib/`, `hooks/` | `services/`, `repositories/`, PocketBase            |

---

## 3 Prinsip Utama

1. **Single Responsibility** — 1 file memiliki 1 tugas spesifik saja. Jika file terlalu panjang, pecah menjadi file-file kecil.
2. **Dependency Satu Arah** — Alur data mengalir terstruktur ke bawah, tidak saling silang secara sembarangan.
3. **Know Your Neighbor** — Sebuah layer hanya perlu tahu dan berinteraksi dengan layer tetangga langsungnya di dalam hierarki.

---

**Ada pertanyaan atau keraguan saat menyusun kode?** Silakan diskusikan di grup chat tim sebelum meletakkan file di folder yang salah. 🚀
