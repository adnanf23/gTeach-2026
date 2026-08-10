import React, { useState, useEffect, useRef } from 'react';
import { Plus, FileSpreadsheet, Download, Upload, FileText, ChevronDown } from 'lucide-react';

export default function ButtonActionGroup({
  onTambah,
  onImport,
  onExport,
  onDownloadTemplate
}) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);
  const fileInputRef = useRef(null);

  // Menutup dropdown otomatis saat klik di luar area button/menu
  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const triggerFileInput = () => {
    setIsOpen(false);
    fileInputRef.current?.click();
  };

  return (
    /* w-fit dan inline-flex memastikan lebar pembungkus hanya sebatas tombolnya saja */
    <div className="inline-flex items-center gap-3 font-sans w-fit" ref={dropdownRef}>
      {/* Input File Tersembunyi untuk Proses Import */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={onImport}
        accept=".xlsx, .xls"
        className="hidden"
      />

      {/* 1. Button Tambah Data (Warna disesuaikan ke Brand Green gTeach) */}
      <button
        onClick={onTambah}
        className="inline-flex items-center gap-2 bg-blue-500 hover:bg-blue-600 active:bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors duration-200 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-2 whitespace-nowrap"
      >
        <Plus size={16} className="stroke-[3]" />
        <span>Tambah Data</span>
      </button>

      {/* 2. Button Excel & Dropdown Menu */}
      <div className="relative">
        {/* Trigger Button Excel (Border dan Icon disamakan warna temanya) */}
        <button
          onClick={() => setIsOpen(!isOpen)}
          className={`inline-flex items-center gap-2 border px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-2 whitespace-nowrap ${
            isOpen
              ? 'bg-slate-100 border-blue-600 text-blue-600'
              : 'bg-white border-slate-300 hover:border-blue-600'}
              : 'bg-white border-slate-300 hover:border-blue-600 text-slate-700 hover:bg-slate-50'
          }`}
        >
          <FileSpreadsheet size={16} className="text-blue-600" />
          <span>Excel</span>
          <ChevronDown
            size={14}
            className={`transition-transform duration-200 text-slate-400 ${isOpen ? 'rotate-180' : ''}`}
          />
        </button>

        {/* Dropdown Menu List */}
        {isOpen && (
          <div className="absolute -left-20 mt-2 w-52 bg-white border border-slate-200 rounded-xl shadow-lg py-1.5 z-50 animate-in fade-in slide-in-from-top-2 duration-150 origin-top-left">
            
            {/* Opsi: Import */}
            <button
              onClick={triggerFileInput}
              className="w-full inline-flex items-center gap-3 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 text-left transition-colors duration-150"
            >
              <Upload size={15} className="text-slate-400" />
              <span className="font-medium">Import Excel</span>
            </button>

            {/* Opsi: Export */}
            <button
              onClick={() => {
                setIsOpen(false);
                onExport();
              }}
              className="w-full inline-flex items-center gap-3 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 text-left transition-colors duration-150"
            >
              <Download size={15} className="text-slate-400" />
              <span className="font-medium">Export Excel</span>
            </button>

            {/* Garis Pembatas */}
            <div className="border-t border-slate-100 my-1.5" />

            {/* Opsi: Download Template */}
            <button
              onClick={() => {
                setIsOpen(false);
                onDownloadTemplate();
              }}
              className="w-full inline-flex items-center gap-3 px-4 py-2 text-sm text-blue-600 hover:bg-teal-50/50 text-left transition-colors duration-150"
            >
              <FileText size={15} className="text-blue-500" />
              <span className="font-semibold">Download Template</span>
            </button>

          </div>
        )}
      </div>
    </div>
  );
}