"use client";

import {
  cn,
  TINGKAT_CONFIG,
  Badge,
  Avatar,
  Select,
  ActionIconBtn,
  KelasToolbarButtons,
  Modal,
  Toast,
  ConfirmDeleteModal,
  ImportModal,
  FormMentahan,
  Input,
  Field,
} from "@/components/organism/dashboard Comp/component";
import { pb } from "@/lib/pocketbase";
import { useEffect, useState } from "react";

const DEFAULT_PASSWORD = "gTeach2026";

// Generate username random 5-6 karakter (huruf kecil + angka)
function generateRandomUsername() {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  const length = Math.random() < 0.5 ? 5 : 6;
  let result = "";
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

export default function DataGuru() {
  const [loadData, setLoadData] = useState(false);
  const [loading, setLoading] = useState(false);
  const [dataGuru, setDataGuru] = useState([]);
  const [kelasList, setKelasList] = useState([]);

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTingkat, setSelectedTingkat] = useState("semua");

  const [openModal, setOpenModal] = useState(false);
  const [modalMode, setModalMode] = useState(false);
  const [detailTarget, setDetailTarget] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const [form, setForm] = useState({
    id: "",
    nama_siswa: "",
    username: "",
    email: "",
    no_whatsapp: "",
    role: "",
    kelas_id: "",
    jenis_kelamin: "",
  });

  const getKelasGuru = (guruId) => {
    return kelasList.find(
      (k) => k.walikelas_id === guruId || k.pendamping_id === guruId,
    );
  };

  async function fetchGuruDanKelas() {
    try {
      setLoadData(true);
      setLoading(true);

      const [guru, kelas] = await Promise.all([
        pb.collection("users").getFullList({
          requestKey: null,
          filter: `role = "guru walikelas" || role = "guru pendamping" || role = "guru mapel"`,
        }),
        pb.collection("kelas").getFullList({
          expand: "walikelas_id,pendamping_id",
          requestKey: null,
        }),
      ]);

      setDataGuru(guru);
      setKelasList(kelas);
    } catch (error) {
      console.error("Gagal mengambil data guru & kelas:", error);
    } finally {
      setLoadData(false);
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchGuruDanKelas();
  }, []);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const resetForm = () => {
    setForm({
      id: "",
      nama_siswa: "",
      username: "",
      email: "",
      no_whatsapp: "",
      role: "",
      kelas_id: "",
      jenis_kelamin: "",
    });
  };

  const OpenModalForm = () => {
    resetForm();
    setModalMode("tambah");
    setOpenModal(true);
  };

  const handleEdit = (item) => {
    const kelasGuru = getKelasGuru(item.id);
    setForm({
      id: item.id,
      nama_siswa: item.nama_lengkap || "",
      username: item.username || "",
      email: item.email || "",
      no_whatsapp: item.no_whatsapp || "",
      // role di PocketBase disimpan pakai spasi ("guru walikelas", dst),
      // jadi value ini HARUS persis sama dengan value <option> di Select role.
      role: item.role || "",
      kelas_id: kelasGuru?.id || "",
      jenis_kelamin: item.jenis_kelamin || "",
    });
    setModalMode("edit");
    setOpenModal(true);
    setDetailTarget(null);
  };

  const openDelete = (item) => {
    setDeleteTarget(item);
    setModalMode("hapus");
    setOpenModal(true);
    setDetailTarget(null);
  };

  const openImport = () => {
    setModalMode("import");
    setOpenModal(true);
  };

  const openDetail = (item) => {
    setDetailTarget(item);
  };

  const closeDetail = () => {
    setDetailTarget(null);
  };

  const handleCloseModal = () => {
    setOpenModal(false);
    setModalMode(false);
    setDeleteTarget(null);
    resetForm();
  };

  const handlSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const payload = {
        nama_lengkap: form.nama_siswa,
        email: form.email,
        no_whatsapp: form.no_whatsapp,
        role: form.role,
        jenis_kelamin: form.jenis_kelamin,
        is_aktif: true,
        verified: true,
      };

      let guruRecord;

      if (modalMode === "edit") {
        // Edit: username & password tidak diubah dari sini
        guruRecord = await pb.collection("users").update(form.id, payload);

        const kelasLama = kelasList.filter(
          (k) => k.walikelas_id === form.id || k.pendamping_id === form.id,
        );
        for (const k of kelasLama) {
          const updateData = {};
          if (k.walikelas_id === form.id) updateData.walikelas_id = "";
          if (k.pendamping_id === form.id) updateData.pendamping_id = "";
          await pb.collection("kelas").update(k.id, updateData);
        }

        if (form.kelas_id) {
          const updateKelasPayload = {};
          // FIX: value role sekarang pakai spasi, samain dengan value <option>
          if (form.role === "guru walikelas") {
            updateKelasPayload.walikelas_id = form.id;
          } else if (form.role === "guru pendamping") {
            updateKelasPayload.pendamping_id = form.id;
          } else {
            updateKelasPayload.walikelas_id = form.id;
          }
          await pb
            .collection("kelas")
            .update(form.kelas_id, updateKelasPayload);
        }
      } else {
        // Tambah: username digenerate random, password pakai default tetap
        payload.username = generateRandomUsername();
        payload.password = DEFAULT_PASSWORD;
        payload.passwordConfirm = DEFAULT_PASSWORD;

        guruRecord = await pb.collection("users").create(payload);

        if (form.kelas_id && guruRecord) {
          const updateKelasPayload = {};
          // FIX: value role sekarang pakai spasi, samain dengan value <option>
          if (form.role === "guru walikelas") {
            updateKelasPayload.walikelas_id = guruRecord.id;
          } else if (form.role === "guru pendamping") {
            updateKelasPayload.pendamping_id = guruRecord.id;
          } else {
            updateKelasPayload.walikelas_id = guruRecord.id;
          }
          await pb
            .collection("kelas")
            .update(form.kelas_id, updateKelasPayload);
        }
      }

      await fetchGuruDanKelas();
      handleCloseModal();
    } catch (error) {
      console.error("Gagal menyimpan data:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setLoading(true);
    try {
      const kelasTerkait = kelasList.filter(
        (k) =>
          k.walikelas_id === deleteTarget.id ||
          k.pendamping_id === deleteTarget.id,
      );
      for (const k of kelasTerkait) {
        const updateData = {};
        if (k.walikelas_id === deleteTarget.id) updateData.walikelas_id = "";
        if (k.pendamping_id === deleteTarget.id) updateData.pendamping_id = "";
        await pb.collection("kelas").update(k.id, updateData);
      }

      await pb.collection("users").delete(deleteTarget.id);
      await fetchGuruDanKelas();
      handleCloseModal();
    } catch (error) {
      console.error("Gagal menghapus data:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleImport = async (rows) => {
    setLoading(true);
    try {
      let successCount = 0;
      let allUsers = await pb
        .collection("users")
        .getFullList({ requestKey: null });

      // Tidak perlu lagi login sebagai _superusers,
      // karena operator (admin/ict) sudah punya izin create langsung.

      for (const row of rows) {
        try {
          const nama_lengkap = (
            row.nama_lengkap ||
            row["Nama Lengkap"] ||
            row["nama"] ||
            ""
          ).trim();
          let email = String(row.email || row["Email"] || "")
            .toLowerCase()
            .trim();
          const no_whatsapp = String(
            row.no_whatsapp || row["No WhatsApp"] || row["whatsapp"] || "",
          ).trim();
          let role = row.role || row["Role"] || "guru mapel";
          const jenis_kelamin = row.jenis_kelamin || row["Jenis Kelamin"] || "";

          if (!nama_lengkap) continue;

          // Normalisasi value dari Excel (boleh underscore atau spasi)
          // menjadi value asli PocketBase (pakai spasi)
          if (role === "guru_walikelas") role = "guru walikelas";
          if (role === "guru_pendamping") role = "guru pendamping";
          if (role === "guru_mapel") role = "guru mapel";

          if (email === "") email = null;

          const isExist = allUsers.find((u) => {
            const matchEmail = email && u.email?.toLowerCase() === email;
            const matchNama =
              u.nama_lengkap?.toLowerCase().trim() ===
              nama_lengkap.toLowerCase();
            return matchEmail || matchNama;
          });

          if (isExist) {
            console.warn(`User sudah terdaftar (Skip): ${nama_lengkap}`);
            continue;
          }

          const payload = {
            nama_lengkap,
            username: generateRandomUsername(),
            role,
            password: DEFAULT_PASSWORD,
            passwordConfirm: DEFAULT_PASSWORD,
            is_aktif: true,
            verified: true,
          };

          if (email) payload.email = email;
          if (no_whatsapp) payload.no_whatsapp = no_whatsapp;
          if (jenis_kelamin) payload.jenis_kelamin = jenis_kelamin;

          const newGuru = await pb.collection("users").create(payload);

          allUsers.push({
            id: newGuru.id,
            nama_lengkap: payload.nama_lengkap,
            email: email || "",
          });

          const namaKelasExcel =
            row.nama_kelas || row["Kelas"] || row["Nama Kelas"];
          if (namaKelasExcel && newGuru) {
            const kelasTerkait = kelasList.find(
              (k) =>
                k.nama_kelas?.toLowerCase() ===
                String(namaKelasExcel).toLowerCase(),
            );
            if (kelasTerkait) {
              const updateKelasPayload = {};
              if (role === "guru walikelas")
                updateKelasPayload.walikelas_id = newGuru.id;
              else if (role === "guru pendamping")
                updateKelasPayload.pendamping_id = newGuru.id;

              if (Object.keys(updateKelasPayload).length > 0) {
                await pb
                  .collection("kelas")
                  .update(kelasTerkait.id, updateKelasPayload);
              }
            }
          }

          successCount++;
        } catch (e) {
          console.error(
            "Baris gagal diimpor. Detail Error:",
            e.data || e.message || e,
          );
        }
      }

      alert(
        `${successCount} dari ${rows.length} baris guru berhasil diproses.`,
      );
      handleCloseModal();
      await fetchGuruDanKelas();
    } catch (err) {
      console.error("Gagal total import data:", err);
      alert("Terjadi kesalahan sistem saat mengimport data.");
    } finally {
      setLoading(false);
    }
  };

  const handleExportDefault = async () => {
    if (dataGuru.length === 0) {
      alert("Tidak ada data untuk diexport.");
      return;
    }
    try {
      const XLSX = await import("xlsx");

      // Urutkan kelas berdasarkan tingkat (numerik) lalu nama_kelas
      const sortedKelas = [...kelasList].sort((a, b) => {
        const tingkatA = parseInt(a.tingkat) || 0;
        const tingkatB = parseInt(b.tingkat) || 0;
        if (tingkatA !== tingkatB) return tingkatA - tingkatB;
        return (a.nama_kelas || "").localeCompare(b.nama_kelas || "");
      });

      // --- Sheet 1: Walikelas & Pendamping ---
      const sheet1Data = [];
      for (const kelas of sortedKelas) {
        // Walikelas
        if (kelas.walikelas_id) {
          const guru = dataGuru.find((g) => g.id === kelas.walikelas_id);
          if (guru) {
            sheet1Data.push({
              "Nama Guru": guru.nama_lengkap || "",
              Peran: "Walikelas",
              Kelas: kelas.nama_kelas || "",
              Tingkat: kelas.tingkat || "",
              Username: guru.username || "",
              Password: DEFAULT_PASSWORD,
            });
          }
        }
        // Pendamping
        if (kelas.pendamping_id) {
          const guru = dataGuru.find((g) => g.id === kelas.pendamping_id);
          if (guru) {
            sheet1Data.push({
              "Nama Guru": guru.nama_lengkap || "",
              Peran: "Pendamping",
              Kelas: kelas.nama_kelas || "",
              Tingkat: kelas.tingkat || "",
              Username: guru.username || "",
              Password: DEFAULT_PASSWORD,
            });
          }
        }
      }

      // --- Sheet 2: Guru Mapel ---
      const guruMapel = dataGuru.filter((g) => g.role === "guru mapel");
      const sheet2Data = guruMapel.map((g) => ({
        "Nama Lengkap": g.nama_lengkap || "",
        Username: g.username || "",
        Email: g.email || "",
        "No WhatsApp": g.no_whatsapp || "",
        "Jenis Kelamin": g.jenis_kelamin || "",
        Role: g.role || "",
        Password: DEFAULT_PASSWORD,
      }));

      // Buat workbook dan sheets
      const wb = XLSX.utils.book_new();

      const ws1 = XLSX.utils.json_to_sheet(sheet1Data);
      XLSX.utils.book_append_sheet(wb, ws1, "Walikelas & Pendamping");

      const ws2 = XLSX.utils.json_to_sheet(sheet2Data);
      XLSX.utils.book_append_sheet(wb, ws2, "Guru Mapel");

      // Atur lebar kolom (opsional)
      ws1["!cols"] = [
        { wch: 25 },
        { wch: 15 },
        { wch: 20 },
        { wch: 10 },
        { wch: 15 },
        { wch: 15 },
      ];
      ws2["!cols"] = [
        { wch: 25 },
        { wch: 15 },
        { wch: 25 },
        { wch: 15 },
        { wch: 15 },
        { wch: 15 },
        { wch: 15 },
      ];

      XLSX.writeFile(
        wb,
        `Data_Guru_${new Date().toISOString().split("T")[0]}.xlsx`,
      );
    } catch (error) {
      console.error("Gagal export data:", error);
      alert("Gagal mengexport data ke Excel.");
    }
  };

  const handleDownloadTemplate = async () => {
    try {
      const XLSX = await import("xlsx");
      const templateData = [
        {
          nama_lengkap: "Ahmad Subarjo, S.Pd",
          email: "ahmad@sekolah.sch.id",
          no_whatsapp: "081234567890",
          role: "guru_walikelas",
          jenis_kelamin: "L",
          nama_kelas: "Kelas 1A",
        },
      ];
      const ws = XLSX.utils.json_to_sheet(templateData);
      ws["!cols"] = [
        { wch: 25 },
        { wch: 25 },
        { wch: 15 },
        { wch: 18 },
        { wch: 15 },
        { wch: 15 },
      ];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Template Import");
      XLSX.writeFile(wb, "template_import_guru.xlsx");
    } catch (error) {
      console.error("Gagal mendownload template:", error);
      alert("Gagal mengunduh template.");
    }
  };

  // Daftar tingkat unik dari kelasList, untuk opsi filter
  const daftarTingkat = [
    ...new Set(kelasList.map((k) => String(k.tingkat || "")).filter(Boolean)),
  ].sort();

  const filteredSiswa = dataGuru.filter((item) => {
    const q = searchQuery.toLowerCase();
    const matchesSearch =
      item.nama_lengkap?.toLowerCase().includes(q) ||
      item.username?.toLowerCase().includes(q) ||
      item.email?.toLowerCase().includes(q);

    const kelasGuru = getKelasGuru(item.id);
    const tingkatKelas = String(kelasGuru?.tingkat || "");
    const matchesTingkat =
      selectedTingkat === "semua" || tingkatKelas === selectedTingkat;

    return matchesSearch && matchesTingkat;
  });

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-5">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <KelasToolbarButtons
          onTambah={OpenModalForm}
          onTemplate={handleDownloadTemplate}
          onImport={openImport}
          onExport={handleExportDefault}
        />

        <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
          <div className="relative">
            <svg
              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
              width="14"
              height="14"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              viewBox="0 0 24 24"
            >
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari nama, username, atau email guru..."
              className="pl-8 pr-3 py-2 text-[13px] border border-gray-200 rounded-lg w-full sm:w-64 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 transition"
            />
          </div>

          <Select
            value={selectedTingkat}
            onChange={(e) => setSelectedTingkat(e.target.value)}
            className="w-full sm:w-40"
          >
            <option value="semua">Semua Tingkat</option>
            {daftarTingkat.map((t) => (
              <option key={t} value={t}>
                Tingkat {t}
              </option>
            ))}
          </Select>
        </div>
      </div>

      <div className="w-full bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        <div className="w-full overflow-x-auto">
          <table className="w-full min-w-[760px] text-left border-collapse text-[13px]">
            <thead>
              <tr className="bg-gray-50/80 border-b border-gray-200">
                {[
                  "Nama Guru",
                  "Username",
                  "Role",
                  "Kelas",
                  "Email",
                  "No WhatsApp",
                  "Aksi",
                ].map((h) => (
                  <th
                    key={h}
                    className={cn(
                      "px-5 py-3.5 text-[11px] font-bold text-gray-500 uppercase tracking-wider",
                      h === "Aksi" && "text-center",
                    )}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loadData ? (
                <tr>
                  <td
                    colSpan={7}
                    className="px-6 py-10 text-center text-gray-400"
                  >
                    <div className="flex items-center justify-center gap-2">
                      <div className="w-4 h-4 border-2 border-gray-300 border-t-transparent rounded-full animate-spin" />
                      <span className="text-[13px]">Mengambil data...</span>
                    </div>
                  </td>
                </tr>
              ) : filteredSiswa.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className="px-6 py-12 text-center text-gray-400"
                  >
                    <div className="text-2xl mb-2">📁</div>
                    <p className="font-medium text-gray-500 text-sm">
                      Data tidak ditemukan
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      Coba ubah filter atau tambah guru baru
                    </p>
                  </td>
                </tr>
              ) : (
                filteredSiswa.map((item) => {
                  const kelasGuru = getKelasGuru(item.id);
                  return (
                    <tr
                      key={item.id}
                      className="hover:bg-blue-50/30 transition-colors group"
                    >
                      <td className="px-5 py-3.5 text-gray-600">
                        <div className="flex items-center gap-2">
                          <Avatar name={item.nama_lengkap || "?"} size="sm" />
                          <strong>
                            {item.nama_lengkap || (
                              <span className="text-gray-400 italic font-normal">
                                Belum ditetapkan
                              </span>
                            )}
                          </strong>
                        </div>
                      </td>

                      <td className="px-5 py-3.5 text-gray-600">
                        {item.username || "-"}
                      </td>

                      <td className="px-5 py-3.5 text-gray-600">
                        {item.role || "-"}
                      </td>

                      <td className="px-5 py-3.5 text-gray-600">
                        {kelasGuru
                          ? `${kelasGuru.nama_kelas} (${kelasGuru.walikelas_id === item.id ? "Wali" : "Pendamping"})`
                          : "Bukan Wali/Pendamping"}
                      </td>

                      <td className="px-5 py-3.5 text-gray-600">
                        {item.email || "-"}
                      </td>

                      <td className="px-5 py-3.5 text-gray-600">
                        {item.no_whatsapp || "-"}
                      </td>

                      <td className="px-4 py-3.5">
                        <div className="flex items-center justify-center gap-0.5">
                          <ActionIconBtn
                            onClick={() => openDetail(item)}
                            title="Lihat Detail"
                            color="blue"
                            label="Detail"
                          >
                            <svg
                              width="14"
                              height="14"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              viewBox="0 0 24 24"
                            >
                              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                              <polyline points="15 3 21 3 21 9" />
                              <line x1="10" y1="14" x2="21" y2="3" />
                            </svg>
                          </ActionIconBtn>
                          <div className="w-px h-4 bg-gray-200 mx-0.5" />
                          <ActionIconBtn
                            onClick={() => handleEdit(item)}
                            title="Edit"
                            color="amber"
                            label="Edit"
                          >
                            <svg
                              width="14"
                              height="14"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              viewBox="0 0 24 24"
                            >
                              <path d="m11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                            </svg>
                          </ActionIconBtn>
                          <ActionIconBtn
                            onClick={() => openDelete(item)}
                            title="Hapus"
                            color="red"
                            label="Hapus"
                          >
                            <svg
                              width="14"
                              height="14"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              viewBox="0 0 24 24"
                            >
                              <polyline points="3 6 5 6 21 6" />
                              <path d="m19 6-.867 12.142A2 2 0 0 1 16.138 20H7.862a2 2 0 0 1-1.995-1.858L5 6m5 0V4a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v2" />
                            </svg>
                          </ActionIconBtn>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <Modal
          isOpen={openModal}
          title={
            modalMode === "hapus"
              ? "Hapus Guru"
              : modalMode === "import"
                ? "Import Data Guru"
                : modalMode === "edit"
                  ? "Edit Data Guru"
                  : "Tambah Guru"
          }
          onClose={handleCloseModal}
        >
          {modalMode === "hapus" ? (
            <ConfirmDeleteModal
              kelas={deleteTarget}
              onConfirm={handleDelete}
              onCancel={handleCloseModal}
            />
          ) : modalMode === "import" ? (
            <ImportModal onClose={handleCloseModal} onImport={handleImport} />
          ) : (
            <FormMentahan onSubmit={handlSubmit}>
              <Field label="Nama Lengkap">
                <Input
                  name="nama_siswa"
                  value={form.nama_siswa}
                  onChange={handleChange}
                  required
                />
              </Field>

              {/* Username hanya ditampilkan saat edit. Saat tambah, digenerate otomatis di belakang layar. */}
              {modalMode === "edit" && (
                <Field label="Username">
                  <Input
                    name="username"
                    value={form.username}
                    onChange={handleChange}
                    disabled
                  />
                </Field>
              )}

              <Field label="Email">
                <Input
                  type="email"
                  name="email"
                  value={form.email}
                  onChange={handleChange}
                />
              </Field>
              <Field label="No WhatsApp">
                <Input
                  name="no_whatsapp"
                  value={form.no_whatsapp}
                  onChange={handleChange}
                />
              </Field>
              <Field label="Role">
                <Select
                  name="role"
                  value={form.role}
                  onChange={handleChange}
                  required
                >
                  <option value="">Pilih Role</option>
                  <option value="guru walikelas">Guru Wali Kelas</option>
                  <option value="guru pendamping">Guru Pendamping</option>
                  <option value="guru mapel">Guru Mapel</option>
                  <option value="admin">Admin</option>
                  <option value="ict">ICT</option>
                </Select>
              </Field>
              <Field label="Kelas Pengampu">
                <Select
                  name="kelas_id"
                  value={form.kelas_id}
                  onChange={handleChange}
                >
                  <option value="">
                    Pilih Kelas (Kosongkan jika bukan wali/pendamping)
                  </option>
                  {kelasList.map((k) => (
                    <option key={k.id} value={k.id}>
                      {k.nama_kelas || `Tingkat ${k.tingkat}`}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Jenis Kelamin">
                <Select
                  name="jenis_kelamin"
                  value={form.jenis_kelamin}
                  onChange={handleChange}
                >
                  <option value="">Pilih Jenis Kelamin</option>
                  <option value="L">Laki-Laki</option>
                  <option value="P">Perempuan</option>
                </Select>
              </Field>

              {modalMode === "tambah" && (
                <p className="text-xs text-gray-400 -mt-2">
                  Username akan dibuat otomatis dan password default adalah{" "}
                  <strong>{DEFAULT_PASSWORD}</strong>.
                </p>
              )}

              <div className="flex justify-end gap-2 pt-4 border-t border-gray-100 mt-4">
                <button
                  type="button"
                  onClick={handleCloseModal}
                  disabled={loading}
                  className="px-4 py-2 text-[13px] font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition disabled:opacity-50"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-4 py-2 text-[13px] font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg flex items-center gap-2 transition shadow-sm disabled:bg-blue-400"
                >
                  {loading ? "Menyimpan..." : "Simpan"}
                </button>
              </div>
            </FormMentahan>
          )}
        </Modal>

        {detailTarget && (
          <DetailSiswaModal
            item={detailTarget}
            kelasGuru={getKelasGuru(detailTarget.id)}
            onClose={closeDetail}
            onEditSiswa={handleEdit}
            onDeleteSiswa={openDelete}
          />
        )}

        <div className="bg-gray-50/50 border-t border-gray-100 px-5 py-3 text-[12px] text-gray-500 flex justify-between items-center">
          <span>
            Menampilkan <strong>{filteredSiswa.length}</strong> dari{" "}
            <strong>{dataGuru.length}</strong> Guru
          </span>
          {(selectedTingkat !== "semua" || searchQuery) && (
            <button
              onClick={() => {
                setSelectedTingkat("semua");
                setSearchQuery("");
              }}
              className="text-[12px] text-blue-500 hover:text-blue-700 transition"
            >
              Reset filter
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function DetailSiswaModal({
  item,
  kelasGuru,
  onClose,
  onEditSiswa,
  onDeleteSiswa,
}) {
  if (!item) return null;
  return (
    <Modal isOpen={!!item} title="Detail Guru" onClose={onClose}>
      <div className="space-y-4 text-sm text-gray-600">
        <div>
          <strong>Nama Lengkap:</strong> {item.nama_lengkap || "-"}
        </div>
        <div>
          <strong>Username:</strong> {item.username || "-"}
        </div>
        <div>
          <strong>Role:</strong> {item.role || "-"}
        </div>
        <div>
          <strong>Kelas Diampu:</strong>{" "}
          {kelasGuru
            ? `${kelasGuru.nama_kelas} (${kelasGuru.walikelas_id === item.id ? "Wali Kelas" : "Pendamping Kelas"})`
            : "Bukan Wali/Pendamping Kelas"}
        </div>
        <div>
          <strong>Email:</strong> {item.email || "-"}
        </div>
        <div>
          <strong>No WhatsApp:</strong> {item.no_whatsapp || "-"}
        </div>
        <div className="flex justify-end gap-2 pt-4 border-t border-gray-100">
          <button
            onClick={() => onEditSiswa(item)}
            className="px-3 py-1.5 bg-amber-500 text-white rounded-lg text-xs font-medium"
          >
            Edit
          </button>
          <button
            onClick={() => onDeleteSiswa(item)}
            className="px-3 py-1.5 bg-red-600 text-white rounded-lg text-xs font-medium"
          >
            Hapus
          </button>
        </div>
      </div>
    </Modal>
  );
}
