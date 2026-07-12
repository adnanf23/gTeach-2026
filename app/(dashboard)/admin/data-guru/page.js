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
    password: "",
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
          filter: `role = "guru walikelas" || role = "guru pendamping"`,
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
      password: "",
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
      role: item.role || "",
      kelas_id: kelasGuru?.id || "",
      jenis_kelamin: item.jenis_kelamin || "",
      password: "",
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
        username: form.username,
        email: form.email,
        no_whatsapp: form.no_whatsapp,
        role: form.role,
        jenis_kelamin: form.jenis_kelamin,
      };

      let guruRecord;

      if (modalMode === "edit") {
        if (form.password) payload.password = form.password;
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
          if (form.role === "guru_walikelas") {
            updateKelasPayload.walikelas_id = form.id;
          } else if (form.role === "guru_pendamping") {
            updateKelasPayload.pendamping_id = form.id;
          } else {
            updateKelasPayload.walikelas_id = form.id;
          }
          await pb
            .collection("kelas")
            .update(form.kelas_id, updateKelasPayload);
        }
      } else {
        payload.password = form.password || "PasswordGuru123";
        payload.passwordConfirm = payload.password;
        guruRecord = await pb.collection("users").create(payload);

        if (form.kelas_id && guruRecord) {
          const updateKelasPayload = {};
          if (form.role === "guru_walikelas") {
            updateKelasPayload.walikelas_id = guruRecord.id;
          } else if (form.role === "guru_pendamping") {
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

      // 1. SIMPAN SESI LOGIN OPERATOR SAAT INI
      const currentUserAuth = pb.authStore.token;
      const currentUserRecord = pb.authStore.record;

      // 2. MASUK SEBAGAI SUPERUSER / ADMIN
      try {
        await pb
          .collection("_superusers")
          .authWithPassword("adnanfauzanm.career@gmail.com", "admin@gTeach");
      } catch (authError) {
        console.error(
          "Gagal Login Admin. Periksa kembali email/password kamu:",
          authError.message,
        );
        alert("Gagal masuk sistem sebagai Admin. Proses import dibatalkan.");
        setLoading(false);
        return;
      }

      // 3. MULAI PROSES LOOPING IMPORT DATA
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

          // Normalisasi nama role
          if (role === "guru_walikelas") role = "guru walikelas";
          if (role === "guru_pendamping") role = "guru pendamping";
          if (role === "guru_mapel") role = "guru mapel";

          if (email === "") email = null;

          // Cek apakah user sudah terdaftar (berdasarkan Email atau Nama Lengkap saja)
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

          // Payload Utama dengan Password Statis & Tanpa Field Username (Biarkan PocketBase generate otomatis)
          const payload = {
            nama_lengkap,
            role,
            password: "gTeach2026",
            passwordConfirm: "gTeach2026",
            is_aktif: true,
            verified: true,
          };

          if (email) payload.email = email;
          if (no_whatsapp) payload.no_whatsapp = no_whatsapp;
          if (jenis_kelamin) payload.jenis_kelamin = jenis_kelamin;

          // Buat user baru di PocketBase
          const newGuru = await pb.collection("users").create(payload);

          // Masukkan ke array lokal untuk pengecekan baris excel berikutnya
          allUsers.push({
            id: newGuru.id,
            nama_lengkap: payload.nama_lengkap,
            email: email || "",
          });

          // Hubungkan otomatis ke tabel Kelas jika kolom nama_kelas tersedia di Excel
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
              if (role === "guru walikelas") {
                updateKelasPayload.walikelas_id = newGuru.id;
              } else if (role === "guru_walikelas") {
                updateKelasPayload.walikelas_id = newGuru.id;
              } else if (role === "guru pendamping") {
                updateKelasPayload.pendamping_id = newGuru.id;
              } else if (role === "guru_pendamping") {
                updateKelasPayload.pendamping_id = newGuru.id;
              }

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

      // 4. KEMBALIKAN SESI LOGIN OPERATOR SEMULA
      if (currentUserAuth && currentUserRecord) {
        pb.authStore.save(currentUserAuth, currentUserRecord);
      } else {
        pb.authStore.clear();
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

      const dataToExport = dataGuru.map((item) => {
        const kelasGuru = getKelasGuru(item.id);
        let statusKelas = "-";
        if (kelasGuru) {
          const tipe =
            kelasGuru.walikelas_id === item.id ? "Wali" : "Pendamping";
          statusKelas = `${kelasGuru.nama_kelas} (${tipe})`;
        }

        return {
          "Nama Lengkap": item.nama_lengkap || "",
          Role: item.role || "",
          "Kelas Diampu": statusKelas,
        };
      });

      const ws = XLSX.utils.json_to_sheet(dataToExport);
      ws["!cols"] = [{ wch: 30 }, { wch: 20 }, { wch: 25 }];

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Data Guru");
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
          username: "ahmadsubarjo",
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
        { wch: 15 },
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

  const filteredSiswa = dataGuru.filter((item) => {
    const matchesSearch =
      item.nama_lengkap?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.username?.toLowerCase().includes(searchQuery.toLowerCase());

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
              ) : dataGuru.length === 0 ? (
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
                      Coba ubah filter atau tambah siswa baru
                    </p>
                  </td>
                </tr>
              ) : (
                dataGuru.map((item) => {
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
              ? "Hapus Siswa"
              : modalMode === "import"
                ? "Import Data Siswa"
                : modalMode === "edit"
                  ? "Edit Data Siswa"
                  : "Tambah Siswa"
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
              <Field label="Username">
                <Input
                  name="username"
                  value={form.username}
                  onChange={handleChange}
                  placeholder="Opsional (Otomatis jika kosong)"
                />
              </Field>
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
                  <option value="guru_walikelas">Guru Wali Kelas</option>
                  <option value="guru_pendamping">Guru Pendamping</option>
                  <option value="guru_mapel">Guru Mapel</option>
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
                <Field label="Password">
                  <Input
                    type="password"
                    name="password"
                    value={form.password}
                    onChange={handleChange}
                    placeholder="Minimal 8 karakter"
                    required
                  />
                </Field>
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
          {selectedTingkat !== "semua" && (
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
