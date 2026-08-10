"use client";

import { useState, useEffect } from "react";
import { pb } from "@/lib/pocketbase";

// Helper: ambil nama & role dari record user yang di-expand.
// Menyesuaikan beberapa kemungkinan nama field di koleksi "users"
// (name/nama/username/email) supaya tetap tampil walau field belum pasti.
function getUserInfo(userRecord) {
  if (!userRecord) {
    return { name: "System / Guest", role: "SYSTEM" };
  }
  const name =
    userRecord.name ||
    userRecord.nama ||
    userRecord.username ||
    userRecord.email ||
    "Unknown User";
  const role = userRecord.role || "USER";
  return { name, role };
}

// Helper: format payload_json biar rapi & tidak meledak kalau kosong/invalid
function formatPayload(payload) {
  if (payload === null || payload === undefined) return "-";
  if (typeof payload === "string") return payload || "-";
  try {
    const str = JSON.stringify(payload);
    return str === "{}" || str === "[]" ? "-" : str;
  } catch {
    return "-";
  }
}

// Helper: tentukan warna badge status berdasarkan status_code (prioritas)
// dengan fallback ke field "type" kalau status_code tidak ada
function getStatusStyle(statusCode, type) {
  const code = Number(statusCode);

  if (!Number.isNaN(code) && code > 0) {
    if (code >= 500) {
      return {
        badge: "bg-red-50 text-red-600 border-red-200/60",
        dot: "bg-red-500",
        text: "text-red-600",
      };
    }
    if (code >= 400) {
      return {
        badge: "bg-amber-50 text-amber-600 border-amber-200/60 font-bold",
        dot: "bg-amber-500",
        text: "text-amber-600",
      };
    }
    return {
      badge: "bg-emerald-50 text-emerald-600 border-emerald-200/60",
      dot: "bg-emerald-500",
      text: "text-emerald-600",
    };
  }

  // Fallback ke "type" kalau status_code kosong
  if (type === "succes") {
    return {
      badge: "bg-emerald-50 text-emerald-600 border-emerald-200/60",
      dot: "bg-emerald-500",
      text: "text-emerald-600",
    };
  }
  if (type === "warning") {
    return {
      badge: "bg-amber-50 text-amber-600 border-amber-200/60 font-bold",
      dot: "bg-amber-500",
      text: "text-amber-600",
    };
  }
  return {
    badge: "bg-blue-50 text-blue-600 border-blue-200",
    dot: "bg-blue-500",
    text: "text-blue-600",
  };
}

// Helper: susun satu objek log siap-pakai dari record PocketBase (baik dari
// getList maupun dari event realtime), supaya logikanya tidak ditulis 2x
function buildLogEntry(record) {
  const { name, role } = getUserInfo(record.expand?.user_id);
  const created = new Date(record.created);

  return {
    id: record.id,
    userName: name,
    userRole: role,
    aktivitas: record.aktivitas || record.msg || "Tidak ada aktivitas tercatat",
    endpoint: record.endpoint || "-",
    payload: formatPayload(record.payload_json),
    statusCode:
      record.status_code ??
      (record.type === "succes" ? 200 : record.type === "warning" ? 400 : 200),
    type: record.type || "info",
    time: created.toLocaleTimeString("id-ID"),
    date: created.toLocaleDateString("id-ID", {
      day: "numeric",
      month: "short",
      year: "numeric",
    }),
  };
}

export default function IctDashboard() {
  const [stats, setStats] = useState({
    totalUsers: 0,
    activeTeachers: 0,
    activeAdmins: 0,
    dbStatus: "CONNECTING",
  });

  const [logs, setLogs] = useState([]);

  useEffect(() => {
    if (!pb.authStore.isValid) return;

    async function fetchInitialStats() {
      try {
        const [allUsers, activeTeachers, activeAdmins] = await Promise.all([
          pb.collection("users").getList(1, 1, {
            filter: "is_aktif = true",
            requestKey: null,
          }),
          pb.collection("users").getList(1, 1, {
            filter: "is_aktif = true && role ~ 'guru_'",
            requestKey: null,
          }),
          pb.collection("users").getList(1, 1, {
            filter: "is_aktif = true && role = 'admin'",
            requestKey: null,
          }),
        ]);

        setStats({
          totalUsers: allUsers.totalItems,
          activeTeachers: activeTeachers.totalItems,
          activeAdmins: activeAdmins.totalItems,
          dbStatus: "ONLINE",
        });
      } catch (error) {
        if (!error.isAbort) {
          console.error("Gagal mengambil statistik database:", error);
          setStats((prev) => ({ ...prev, dbStatus: "ERROR" }));
        }
      }
    }

    async function fetchInitialLogs() {
      try {
        const records = await pb.collection("system_logs").getList(1, 15, {
          sort: "-created",
          expand: "user_id",
          requestKey: null,
        });

        setLogs(records.items.map(buildLogEntry));
      } catch (error) {
        if (!error.isAbort) {
          console.error("Gagal mengambil data log awal:", error);
        }
      }
    }

    fetchInitialStats();
    fetchInitialLogs();

    // Subscribe realtime — expand juga disertakan agar nama user langsung
    // tersedia tanpa perlu fetch ulang tiap ada log baru masuk
    pb.collection("system_logs").subscribe(
      "*",
      function (e) {
        if (e.action === "create") {
          const newLog = buildLogEntry(e.record);
          setLogs((prevLogs) => [newLog, ...prevLogs.slice(0, 14)]);
        }
      },
      { expand: "user_id" },
    );

    return () => {
      pb.collection("system_logs").unsubscribe("*");
    };
  }, []);

  return (
    <div className="space-y-6 text-slate-900">
      {/* ── ROW 1: KARTU MONITORING STATISTIK REAL ── */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
            Status Database
          </p>
          <div className="flex items-center gap-2 mt-1">
            <span
              className={`h-2.5 w-2.5 rounded-full ${
                stats.dbStatus === "ONLINE"
                  ? "bg-emerald-500 animate-pulse"
                  : stats.dbStatus === "CONNECTING"
                    ? "bg-amber-500 animate-pulse"
                    : "bg-red-500"
              }`}
            ></span>
            <span className="text-lg font-bold text-slate-800">
              {stats.dbStatus}
            </span>
          </div>
          <p className="text-[11px] text-slate-400 mt-2">
            PocketBase Live Connection
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
            Total Akun Aktif
          </p>
          <p className="text-lg font-bold text-slate-800 mt-1">
            {stats.totalUsers}{" "}
            <span className="text-xs text-slate-400 font-normal">User</span>
          </p>
          <p className="text-[11px] text-slate-400 mt-2">
            Seluruh ekosistem gTeach Space
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
            Guru Terintegrasi
          </p>
          <p className="text-lg font-bold text-blue-600 mt-1">
            {stats.activeTeachers}{" "}
            <span className="text-xs text-slate-400 font-normal">Akun</span>
          </p>
          <p className="text-[11px] text-slate-400 mt-2">
            Mapel, Wali Kelas, & Pendamping
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
            Administrator
          </p>
          <p className="text-lg font-bold text-slate-800 mt-1">
            {stats.activeAdmins}{" "}
            <span className="text-xs text-slate-400 font-normal">Staff</span>
          </p>
          <p className="text-[11px] text-slate-400 mt-2">
            Pemegang hak akses manajemen
          </p>
        </div>
      </div>

      {/* ── ROW 2: LIVE LOGS TRACKER CONSOLE STYLE ── */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
          <div>
            <h3 className="text-sm font-bold text-slate-800">
              Aktivitas Sistem Terkini (Real-time Logs)
            </h3>
            <p className="text-[11px] text-slate-400">
              Log sinkron otomatis dari server tanpa perlu reload halaman
            </p>
          </div>
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-600 text-white animate-pulse">
            ● Live Stream Active
          </span>
        </div>

        <div className="p-6 bg-white text-[12px] text-slate-600 min-h-[400px] overflow-y-auto rounded-2xl border border-slate-200/80 font-sans shadow-sm">
          {logs.length === 0 ? (
            <div className="text-slate-400 text-center py-20 font-mono">
              [Belum ada aktivitas log tercatat di database...]
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[1000px]">
                <thead>
                  <tr className="border-b border-slate-100 text-slate-400 uppercase tracking-wider text-[10.5px] font-bold">
                    <th className="pb-4 px-4 font-semibold w-[220px]">User</th>
                    <th className="pb-4 px-4 font-semibold">Aktivitas</th>
                    <th className="pb-4 px-4 font-semibold w-[120px]">
                      Endpoint
                    </th>
                    <th className="pb-4 px-4 font-semibold w-[220px]">
                      Payload
                    </th>
                    <th className="pb-4 px-4 font-semibold w-[90px]">Status</th>
                    <th className="pb-4 px-4 font-semibold w-[100px]">Tipe</th>
                    <th className="pb-4 px-4 font-semibold w-[110px] text-right">
                      Waktu
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {logs.map((log) => {
                    const style = getStatusStyle(log.statusCode, log.type);
                    const initials = log.userName
                      .split(" ")
                      .filter(Boolean)
                      .map((n) => n[0])
                      .join("")
                      .slice(0, 2)
                      .toUpperCase();

                    return (
                      <tr
                        key={log.id}
                        className="hover:bg-slate-50/80 transition-colors group"
                      >
                        {/* 1. USER */}
                        <td className="py-4 px-4 flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-emerald-50 border border-emerald-100 flex items-center justify-center text-[11px] font-bold text-emerald-600 font-mono shrink-0">
                            {initials || "?"}
                          </div>
                          <div className="flex flex-col min-w-0">
                            <span className="font-semibold text-slate-700 truncate">
                              {log.userName}
                            </span>
                            <span className="text-[10px] text-slate-400 uppercase tracking-wider mt-0.5">
                              {log.userRole}
                            </span>
                          </div>
                        </td>

                        {/* 2. AKTIVITAS */}
                        <td className="py-4 px-4 text-slate-600 leading-relaxed max-w-[280px]">
                          {log.aktivitas}
                        </td>

                        {/* 3. ENDPOINT */}
                        <td className="py-4 px-4">
                          <span className="px-2 py-0.5 rounded bg-slate-50 border border-slate-200/60 text-slate-500 font-mono text-[11px]">
                            {log.endpoint}
                          </span>
                        </td>

                        {/* 4. PAYLOAD */}
                        <td
                          className="py-4 px-4 font-mono text-[11px] text-slate-500 max-w-[220px] truncate"
                          title={log.payload}
                        >
                          {log.payload}
                        </td>

                        {/* 5. STATUS */}
                        <td className="py-4 px-4 font-bold">
                          <div className="flex items-center gap-1.5">
                            <span
                              className={`w-1.5 h-1.5 rounded-full ${style.dot}`}
                            />
                            <span className={style.text}>{log.statusCode}</span>
                          </div>
                        </td>

                        {/* 6. TIPE */}
                        <td className="py-4 px-4">
                          <span
                            className={`px-2.5 py-0.5 rounded-md border text-[10px] font-bold tracking-wider uppercase ${style.badge}`}
                          >
                            {log.type}
                          </span>
                        </td>

                        {/* 7. WAKTU */}
                        <td className="py-4 px-4 text-right">
                          <div className="flex flex-col font-mono text-[11px]">
                            <span className="text-slate-700 font-semibold">
                              {log.time}
                            </span>
                            <span className="text-[10px] text-slate-400 mt-0.5">
                              {log.date}
                            </span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
