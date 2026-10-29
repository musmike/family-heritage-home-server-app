import type { PersonSex } from '../../types/biography';
import styles from '../../pages/Biographies/Biographies.module.css';

interface PersonAvatarProps {
  sex: PersonSex | null | undefined;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

export default function PersonAvatar({ sex, size = 'md' }: PersonAvatarProps) {
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

  return (
    <div className={`${styles.avatarBox} ${genderClass} ${sizeClass}`} aria-hidden="true">
      <svg viewBox="0 0 64 64" fill="currentColor" className={styles.avatarSvg}>
        <circle cx="32" cy="22" r="12" />
        <path d="M12 56c0-11 9-18 20-18s20 7 20 18H12z" />
      </svg>
    </div>
  );
}