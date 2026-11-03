import { useState, useRef, useEffect, useCallback } from 'react';
import { mediaApi } from '../../api/mediaApi';
import PersonAvatar from './PersonAvatar';

interface InteractiveAvatarCropperProps {
  mediaId: number;
  mediaType: 'IMAGE' | 'VIDEO';
  initialCropX?: number | null;
  initialCropY?: number | null;
  initialCropZoom?: number | null;
  onSaveCrop: (cropX: number, cropY: number, cropZoom: number) => void;
  onCancel?: () => void;
}

const clamp = (val: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, val));

export default function InteractiveAvatarCropper({
  mediaId,
  mediaType,
  initialCropX,
  initialCropY,
  initialCropZoom,
  onSaveCrop,
  onCancel,
}: InteractiveAvatarCropperProps) {
  const [cropX, setCropX] = useState<number>(initialCropX ?? 50);
  const [cropY, setCropY] = useState<number>(initialCropY ?? 50);
  const [cropZoom, setCropZoom] = useState<number>(initialCropZoom ?? 1.0);
  const [isDragging, setIsDragging] = useState<boolean>(false);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const [containerDim, setContainerDim] = useState<{ width: number; height: number }>({
    width: 360,
    height: 360,
  });

  const updateDimensions = useCallback(() => {
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        setContainerDim({ width: rect.width, height: rect.height });
      }
    }
  }, []);

  useEffect(() => {
    updateDimensions();
    window.addEventListener('resize', updateDimensions);
    return () => {
      window.removeEventListener('resize', updateDimensions);
    };
  }, [updateDimensions]);

  const updateCropPosition = (clientX: number, clientY: number) => {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;

    const relX = clientX - rect.left;
    const relY = clientY - rect.top;
    const nextX = clamp(Math.round((relX / rect.width) * 100), 0, 100);
    const nextY = clamp(Math.round((relY / rect.height) * 100), 0, 100);
    setCropX(nextX);
    setCropY(nextY);
  };

  const handlePointerDown = (clientX: number, clientY: number) => {
    setIsDragging(true);
    updateCropPosition(clientX, clientY);
  };

  const handlePointerMove = (clientX: number, clientY: number) => {
    if (!isDragging) return;
    updateCropPosition(clientX, clientY);
  };

  const handlePointerUp = () => {
    setIsDragging(false);
  };

  const adjustZoom = (delta: number) => {
    setCropZoom(prev => Number(clamp(prev + delta, 1.0, 4.0).toFixed(2)));
  };

  // Aperture sizing: base diameter is 80% of min dimension, shrinking as zoom increases
  const minDim = Math.min(containerDim.width, containerDim.height);
  const baseDiameter = minDim > 0 ? minDim * 0.8 : 240;
  const circleDiameter = Math.max(48, Math.round(baseDiameter / Math.max(1.0, cropZoom)));
  const circleRadius = circleDiameter / 2;

  const circleLeft = Math.round((cropX / 100) * containerDim.width - circleRadius);
  const circleTop = Math.round((cropY / 100) * containerDim.height - circleRadius);

  return (
    <div
      data-testid="avatar-cropper-box"
      style={{
        backgroundColor: '#ffffff',
        border: '1px solid #cbd5e1',
        borderRadius: '12px',
        padding: '1.25rem 1.5rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '1rem',
        boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <strong style={{ fontSize: '1rem', color: '#0f172a' }}>
          🎯 Kadrowanie zdjęcia profilowego (okrągły awatar)
        </strong>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            style={{
              background: 'none',
              border: 'none',
              fontSize: '1.2rem',
              color: '#64748b',
              cursor: 'pointer',
              padding: '0.2rem',
            }}
            aria-label="Zamknij"
          >
            ✕
          </button>
        )}
      </div>

      <p style={{ fontSize: '0.82rem', color: '#475569', margin: 0 }}>
        Całe zdjęcie jest widoczne poniżej. Przesuwaj okrągłe okno wycięcia myszką lub dotykiem i reguluj jego skalę suwakiem, aby precyzyjnie wykadrować twarz.
      </p>

      {/* Main Full-Photo Viewport with Circular Aperture Overlay */}
      <div
        ref={containerRef}
        data-testid="cropper-viewport-container"
        onMouseDown={e => {
          e.preventDefault();
          handlePointerDown(e.clientX, e.clientY);
        }}
        onMouseMove={e => {
          if (isDragging) {
            e.preventDefault();
            handlePointerMove(e.clientX, e.clientY);
          }
        }}
        onMouseUp={handlePointerUp}
        onMouseLeave={handlePointerUp}
        onTouchStart={e => {
          if (e.touches.length === 1) {
            const touch = e.touches[0];
            handlePointerDown(touch.clientX, touch.clientY);
          }
        }}
        onTouchMove={e => {
          if (e.touches.length === 1 && isDragging) {
            const touch = e.touches[0];
            handlePointerMove(touch.clientX, touch.clientY);
          }
        }}
        onTouchEnd={handlePointerUp}
        onWheel={e => {
          e.preventDefault();
          adjustZoom(e.deltaY < 0 ? 0.15 : -0.15);
        }}
        style={{
          position: 'relative',
          width: '100%',
          maxHeight: '400px',
          minHeight: '260px',
          backgroundColor: '#0f172a',
          borderRadius: '8px',
          overflow: 'hidden',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: isDragging ? 'grabbing' : 'crosshair',
          userSelect: 'none',
          touchAction: 'none',
        }}
      >
        {mediaType === 'VIDEO' ? (
          <video
            src={mediaApi.getFileUrl(mediaId)}
            autoPlay
            loop
            muted
            playsInline
            onLoadedData={updateDimensions}
            style={{
              maxWidth: '100%',
              maxHeight: '400px',
              objectFit: 'contain',
              display: 'block',
              pointerEvents: 'none',
            }}
          />
        ) : (
          <img
            src={mediaApi.getFileUrl(mediaId)}
            alt=""
            draggable={false}
            onLoad={updateDimensions}
            style={{
              maxWidth: '100%',
              maxHeight: '400px',
              objectFit: 'contain',
              display: 'block',
              pointerEvents: 'none',
            }}
          />
        )}

        {/* Circular Aperture Cutout Overlay (Facebook style) */}
        <div
          data-testid="cropper-circular-aperture"
          style={{
            position: 'absolute',
            left: `${String(circleLeft)}px`,
            top: `${String(circleTop)}px`,
            width: `${String(circleDiameter)}px`,
            height: `${String(circleDiameter)}px`,
            borderRadius: '50%',
            border: '2px solid #ffffff',
            boxShadow: '0 0 0 9999px rgba(15, 23, 42, 0.65)',
            pointerEvents: 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: isDragging ? 'none' : 'all 0.08s ease-out',
          }}
        >
          {/* Subtle center guide */}
          <div
            style={{
              width: '10px',
              height: '1px',
              backgroundColor: 'rgba(255, 255, 255, 0.75)',
            }}
          />
          <div
            style={{
              position: 'absolute',
              width: '1px',
              height: '10px',
              backgroundColor: 'rgba(255, 255, 255, 0.75)',
            }}
          />
        </div>
      </div>

      {/* Zoom and Size Controls */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '0.5rem',
          backgroundColor: '#f8fafc',
          padding: '0.75rem 1rem',
          borderRadius: '8px',
          border: '1px solid #e2e8f0',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#334155' }}>
            Skala wycięcia / Przybliżenie twarzy (Zoom):
          </span>
          <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#1d4ed8' }}>
            {cropZoom.toFixed(1)}×
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <button
            type="button"
            onClick={() => {
              adjustZoom(-0.2);
            }}
            style={{
              padding: '0.3rem 0.65rem',
              fontSize: '0.82rem',
              fontWeight: 700,
              borderRadius: '6px',
              border: '1px solid #cbd5e1',
              backgroundColor: '#ffffff',
              cursor: 'pointer',
            }}
            title="Oddal (zwiększ obszar wycięcia)"
          >
            🔍 −
          </button>
          <input
            type="range"
            min="1.0"
            max="4.0"
            step="0.05"
            value={cropZoom}
            onChange={e => {
              setCropZoom(Number(parseFloat(e.target.value).toFixed(2)));
            }}
            style={{ flex: 1, accentColor: '#2563eb', cursor: 'pointer' }}
            aria-label="Przybliżenie twarzy"
          />
          <button
            type="button"
            onClick={() => {
              adjustZoom(0.2);
            }}
            style={{
              padding: '0.3rem 0.65rem',
              fontSize: '0.82rem',
              fontWeight: 700,
              borderRadius: '6px',
              border: '1px solid #cbd5e1',
              backgroundColor: '#ffffff',
              cursor: 'pointer',
            }}
            title="Przybliż (zmniejsz obszar wycięcia)"
          >
            🔍 +
          </button>
          <button
            type="button"
            onClick={() => {
              setCropX(50);
              setCropY(50);
              setCropZoom(1.0);
            }}
            style={{
              padding: '0.3rem 0.65rem',
              fontSize: '0.78rem',
              fontWeight: 600,
              borderRadius: '6px',
              border: '1px solid #cbd5e1',
              backgroundColor: '#ffffff',
              color: '#475569',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            ↺ Resetuj
          </button>
        </div>
      </div>

      {/* Live Preview Side-by-Side */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '1rem',
          padding: '0.4rem 0',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#64748b' }}>
            Podgląd efektu na żywo:
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            <PersonAvatar
              sex="UNKNOWN"
              size="lg"
              avatarMediaId={mediaId}
              avatarMediaType={mediaType}
              avatarCropX={cropX}
              avatarCropY={cropY}
              avatarCropZoom={cropZoom}
            />
            <PersonAvatar
              sex="UNKNOWN"
              size="md"
              avatarMediaId={mediaId}
              avatarMediaType={mediaType}
              avatarCropX={cropX}
              avatarCropY={cropY}
              avatarCropZoom={cropZoom}
            />
            <PersonAvatar
              sex="UNKNOWN"
              size="sm"
              avatarMediaId={mediaId}
              avatarMediaType={mediaType}
              avatarCropX={cropX}
              avatarCropY={cropY}
              avatarCropZoom={cropZoom}
            />
          </div>
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'flex', gap: '0.65rem', marginLeft: 'auto' }}>
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              style={{
                padding: '0.48rem 0.95rem',
                fontSize: '0.84rem',
                fontWeight: 600,
                borderRadius: '8px',
                border: '1px solid #cbd5e1',
                backgroundColor: '#ffffff',
                color: '#334155',
                cursor: 'pointer',
              }}
            >
              Anuluj
            </button>
          )}
          <button
            type="button"
            data-testid="save-cropped-avatar-button"
            onClick={() => {
              onSaveCrop(cropX, cropY, cropZoom);
            }}
            style={{
              padding: '0.48rem 1.15rem',
              fontSize: '0.84rem',
              fontWeight: 600,
              borderRadius: '8px',
              border: '1px solid #1d4ed8',
              backgroundColor: '#2563eb',
              color: '#ffffff',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.35rem',
            }}
          >
            ✓ Zapisz kadr portretu
          </button>
        </div>
      </div>
    </div>
  );
}
