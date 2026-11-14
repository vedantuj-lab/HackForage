import React from 'react';
import { X, CheckCircle2, AlertCircle, Info } from 'lucide-react';
import { useAuth } from '../context/AuthContext.tsx';

export const ToastBar: React.FC = () => {
  const { toasts, dismissToast } = useAuth();
  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none">
      {toasts.map((t) => (
        <div
          key={t.id}
          className="pointer-events-auto flex items-start gap-3 bg-[#192230] text-[#F7F5EF] px-4 py-3 rounded-lg border border-[#192230]/20 shadow-lg text-sm"
        >
          {t.type === 'success' && <CheckCircle2 className="w-4 h-4 text-[#1E9782] shrink-0 mt-0.5" />}
          {t.type === 'error' && <AlertCircle className="w-4 h-4 text-[#EF6853] shrink-0 mt-0.5" />}
          {t.type === 'info' && <Info className="w-4 h-4 text-[#E6AB43] shrink-0 mt-0.5" />}
          <span className="flex-1 leading-snug">{t.text}</span>
          <button
            onClick={() => dismissToast(t.id)}
            className="text-[#F7F5EF]/60 hover:text-[#F7F5EF] transition-colors shrink-0"
            aria-label="Dismiss notification"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ))}
    </div>
  );
};
