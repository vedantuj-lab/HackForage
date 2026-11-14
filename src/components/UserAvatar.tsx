import React from 'react';

const AVATAR_PALETTES = [
  { bg: 'bg-[#E5F3ED]', text: 'text-[#1E9782]', border: 'border-[#1E9782]/25' },
  { bg: 'bg-[#EEE9FA]', text: 'text-[#8070C4]', border: 'border-[#8070C4]/25' },
  { bg: 'bg-[#FDECE9]', text: 'text-[#EF6853]', border: 'border-[#EF6853]/25' },
  { bg: 'bg-[#FDF4DF]', text: 'text-[#B57C17]', border: 'border-[#E6AB43]/35' },
  { bg: 'bg-[#E8ECF2]', text: 'text-[#192230]', border: 'border-[#192230]/20' },
];

function getInitials(name: string): string {
  const cleaned = (name || 'HF').replace(/^\d+\s+/, '').trim();
  const parts = cleaned.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
  }
  return cleaned.slice(0, 2).toUpperCase() || 'HF';
}

function getPaletteIndex(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return hash % AVATAR_PALETTES.length;
}

interface UserAvatarProps {
  name: string;
  avatarUrl?: string;
  size?: 'sm' | 'md' | 'lg';
  usePhoto?: boolean;
}

export const UserAvatar: React.FC<UserAvatarProps> = ({
  name,
  avatarUrl,
  size = 'md',
  usePhoto = false,
}) => {
  const sizeClass =
    size === 'sm' ? 'w-8 h-8 text-xs' : size === 'lg' ? 'w-14 h-14 text-base' : 'w-11 h-11 text-sm';

  const palette = AVATAR_PALETTES[getPaletteIndex(name || 'HackForge')];
  const initials = getInitials(name);

  // Only show photo when explicitly desired and not a shared default stock asset across teammates
  if (usePhoto && avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt={name}
        referrerPolicy="no-referrer"
        className={`${sizeClass} rounded-xl object-cover border border-[#192230]/15 shrink-0`}
      />
    );
  }

  return (
    <div
      className={`${sizeClass} ${palette.bg} ${palette.text} border ${palette.border} rounded-xl flex items-center justify-center font-display font-bold tracking-tight shrink-0 select-none`}
      aria-label={name}
    >
      {initials}
    </div>
  );
};
