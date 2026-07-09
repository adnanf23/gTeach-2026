import React from 'react';

const Modal = ({ isOpen, onClose, title, children }) => {
  if (!isOpen) return null;

  return (
    // Overlay / Latar belakang gelap
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#00000030]  p-4 transition-opacity duration-300"
      onClick={onClose}
    >
      {/* Box Modal */}
      <div 
        className="w-full max-w-md transform overflow-hidden rounded-lg bg-white p-6 shadow-xl transition-all duration-300"
        onClick={(e) => e.stopPropagation()}
      >
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 pb-4">
          <h3 className="text-xl font-semibold text-gray-900">{title}</h3>
          <button 
            className="text-gray-400 hover:text-gray-600 text-2xl font-bold leading-none focus:outline-none"
            onClick={onClose}
          >
            &times;
          </button>
        </div>

        {/* Body (Tempat Form / Children) */}
        <div className="mt-4 max-h-[70vh] overflow-y-auto pr-1">
          {children}
        </div>

      </div>
    </div>
  );
};

export default Modal;