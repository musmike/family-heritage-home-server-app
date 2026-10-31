import { useState } from 'react';
import { mediaApi } from '../../api/mediaApi';
import type { PersonSex } from '../../types/biography';
import styles from '../../pages/Biographies/Biographies.module.css';

interface PersonAvatarProps {
  sex: PersonSex | null | undefined;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  avatarMediaId?: number | null;
  avatarMediaType?: 'IMAGE' | 'VIDEO' | null;
  avatarCropX?: number | null;
  avatarCropY?: number | null;
  avatarCropZoom?: number | null;
}

export default function PersonAvatar({
  sex,
  size = 'md',
  avatarMediaId,
  avatarMediaType,
  avatarCropX,
  avatarCropY,
  avatarCropZoom,
}: PersonAvatarProps) {
  const [mediaError, setMediaError] = useState<boolean>(false);

  const genderClass =
    sex === 'MALE'
      ? styles.avatarMale
      : sex === 'FEMALE'
        ? styles.avatarFemale
        : styles.avatarNeutral;

  const sizeClass =
    size === 'sm'
      ? styles.avatarSm
      : size === 'lg'
        ? styles.avatarLg
        : size === 'xl'
          ? styles.avatarXl
          : styles.avatarMd;

  const hasMedia =
    avatarMediaId !== undefined && avatarMediaId !== null && !mediaError;

  const cropX = avatarCropX ?? 50;
  const cropY = avatarCropY ?? 50;
  const cropZoom = avatarCropZoom ?? 1.0;

  const mediaStyle: React.CSSProperties = {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    objectPosition: `${String(cropX)}% ${String(cropY)}%`,
    transform: cropZoom !== 1.0 ? `scale(${String(cropZoom)})` : undefined,
    transformOrigin: `${String(cropX)}% ${String(cropY)}%`,
  };

  return (
    <div
      className={`${styles.avatarBox} ${genderClass} ${sizeClass}`}
      aria-hidden="true"
    >
      {hasMedia ? (
        avatarMediaType === 'VIDEO' ? (
          <video
            src={mediaApi.getFileUrl(avatarMediaId)}
            autoPlay
            loop
            muted
            playsInline
            disablePictureInPicture
            onError={() => {
              setMediaError(true);
            }}
            style={mediaStyle}
          />
        ) : (
          <img
            src={mediaApi.getThumbnailUrl(avatarMediaId)}
            alt=""
            onError={() => {
              setMediaError(true);
            }}
            style={mediaStyle}
          />
        )
      ) : (
        <svg viewBox="0 0 64 64" fill="currentColor" className={styles.avatarSvg}>
          <circle cx="32" cy="22" r="12" />
          <path d="M12 56c0-11 9-18 20-18s20 7 20 18H12z" />
        </svg>
      )}
    </div>
  );
}