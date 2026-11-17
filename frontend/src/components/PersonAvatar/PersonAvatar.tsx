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
  const [isLandscape, setIsLandscape] = useState<boolean>(true);

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
  const zoomPercent = `${String(Math.round(cropZoom * 10000) / 100)}%`;

  // Maps the circle of diameter min(W, H) / cropZoom centered at (cropX%, cropY%)
  // to 100% of the circular avatarBox
  const mediaStyle: React.CSSProperties = {
    position: 'absolute',
    left: '50%',
    top: '50%',
    width: isLandscape ? 'auto' : zoomPercent,
    height: isLandscape ? zoomPercent : 'auto',
    maxWidth: 'none',
    maxHeight: 'none',
    transform: `translate(-${String(cropX)}%, -${String(cropY)}%)`,
    pointerEvents: 'none',
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
            onLoadedMetadata={e => {
              const v = e.currentTarget;
              if (v.videoWidth > 0 && v.videoHeight > 0) {
                setIsLandscape(v.videoWidth >= v.videoHeight);
              }
            }}
            onError={() => {
              setMediaError(true);
            }}
            style={mediaStyle}
          />
        ) : (
          <img
            src={mediaApi.getThumbnailUrl(avatarMediaId)}
            alt=""
            onLoad={e => {
              const img = e.currentTarget;
              if (img.naturalWidth > 0 && img.naturalHeight > 0) {
                setIsLandscape(img.naturalWidth >= img.naturalHeight);
              }
            }}
            onError={() => {
              setMediaError(true);
            }}
            style={mediaStyle}
          />
        )
      ) : (
        <svg
          viewBox="0 0 64 64"
          fill="currentColor"
          className={styles.avatarSvg}
        >
          <circle cx="32" cy="22" r="12" />
          <path d="M12 56c0-11 9-18 20-18s20 7 20 18H12z" />
        </svg>
      )}
    </div>
  );
}