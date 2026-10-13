import React from 'react';

interface Props {
  children: React.ReactNode;
  onClose: () => void;
  title?: string;
}

export default function Modal({ children, onClose, title }: Props) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="bg-slate-900 border border-white/10 rounded-2xl w-full max-w-md max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-white/10">
          {title && <h3 className="font-bold text-lg">{title}</h3>}
          <button onClick={onClose} className="text-gray-400 hover:text-white text-2xl leading-none mr-auto">×</button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}
