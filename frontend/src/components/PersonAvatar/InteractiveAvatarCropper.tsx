import { useState } from 'react';
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
  const [dragRef, setDragRef] = useState<{
    startX: number;
    startY: number;
    origCropX: number;
    origCropY: number;
  } | null>(null);

  const handlePointerStart = (clientX: number, clientY: number) => {
    setDragRef({
      startX: clientX,
      startY: clientY,
      origCropX: cropX,
      origCropY: cropY,
    });
  };

  const handlePointerMove = (clientX: number, clientY: number) => {
    if (!dragRef) return;
    const dx = clientX - dragRef.startX;
    const dy = clientY - dragRef.startY;
    // Sensitivity scales inversely with zoom so dragging feels natural
    const factor = 0.65 / Math.max(1, cropZoom * 0.65);
    const nextX = clamp(Math.round(dragRef.origCropX - dx * factor), 0, 100);
    const nextY = clamp(Math.round(dragRef.origCropY - dy * factor), 0, 100);
    setCropX(nextX);
    setCropY(nextY);
  };

  const handlePointerEnd = () => {
    setDragRef(null);
  };

  const adjustZoom = (delta: number) => {
    setCropZoom(prev => Number(clamp(prev + delta, 1.0, 4.0).toFixed(2)));
  };

  const previewStyle: React.CSSProperties = {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    objectPosition: `${String(cropX)}% ${String(cropY)}%`,
    transform: cropZoom !== 1.0 ? `scale(${String(cropZoom)})` : undefined,
    transformOrigin: `${String(cropX)}% ${String(cropY)}%`,
    pointerEvents: 'none',
    userSelect: 'none',
  };

  return (
    <div
      data-testid="avatar-cropper-box"
      style={{
        backgroundColor: '#f8fafc',
        border: '1px solid #cbd5e1',
        borderRadius: '10px',
        padding: '1rem 1.25rem',
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: '1.25rem',
      }}
    >
      {/* Interactive Drag & Wheel Viewport */}
      <div
        title="Przeciągnij zdjęcie myszką lub palcem, aby ustawić kadr; użyj kółka myszy, aby przybliżyć"
        onMouseDown={e => {
          e.preventDefault();
          handlePointerStart(e.clientX, e.clientY);
        }}
        onMouseMove={e => {
          if (dragRef) {
            e.preventDefault();
            handlePointerMove(e.clientX, e.clientY);
          }
        }}
        onMouseUp={handlePointerEnd}
        onMouseLeave={handlePointerEnd}
        onTouchStart={e => {
          if (e.touches.length === 1) {
            handlePointerStart(e.touches[0].clientX, e.touches[0].clientY);
          }
        }}
        onTouchMove={e => {
          if (e.touches.length === 1 && dragRef) {
            handlePointerMove(e.touches[0].clientX, e.touches[0].clientY);
          }
        }}
        onTouchEnd={handlePointerEnd}
        onWheel={e => {
          e.preventDefault();
          adjustZoom(e.deltaY < 0 ? 0.15 : -0.15);
        }}
        style={{
          width: '150px',
          height: '150px',
          borderRadius: '50%',
          overflow: 'hidden',
          position: 'relative',
          border: '3px solid #2563eb',
          boxShadow: '0 4px 12px rgba(37, 99, 235, 0.22)',
          cursor: dragRef ? 'grabbing' : 'grab',
          flexShrink: 0,
          touchAction: 'none',
          backgroundColor: '#0f172a',
        }}
      >
        {mediaType === 'VIDEO' ? (
          <video
            src={mediaApi.getFileUrl(mediaId)}
            autoPlay
            loop
            muted
            playsInline
            style={previewStyle}
          />
        ) : (
          <img
            src={mediaApi.getThumbnailUrl(mediaId)}
            alt=""
            draggable={false}
            style={previewStyle}
          />
        )}
      </div>

      {/* Instructions & Zoom Buttons */}
      <div
        style={{
          flex: '1 1 220px',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.55rem',
        }}
      >
        <strong style={{ fontSize: '0.88rem', color: '#0f172a' }}>
          🎯 Interaktywne kadrowanie okrągłego awatara
        </strong>
        <span style={{ fontSize: '0.8rem', color: '#475569', lineHeight: 1.4 }}>
          Chwyć zdjęcie w kółku po lewej i przeciągnij je myszką (lub palcem), aby wyśrodkować twarz. Przybliżaj kółkiem myszy lub przyciskami poniżej. W tabeli biografii zdjęcie nadal wyświetli się w pełnym prostokącie.
        </span>

        <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '0.45rem' }}>
          <button
            type="button"
            onClick={() => {
              adjustZoom(-0.2);
            }}
            style={{
              padding: '0.3rem 0.7rem',
              fontSize: '0.82rem',
              fontWeight: 700,
              borderRadius: '6px',
              border: '1px solid #cbd5e1',
              backgroundColor: '#ffffff',
              cursor: 'pointer',
            }}
          >
            🔍 − Oddal
          </button>
          <span
            style={{
              fontSize: '0.8rem',
              fontWeight: 700,
              color: '#1e293b',
              minWidth: '52px',
              textAlign: 'center',
            }}
          >
            {cropZoom.toFixed(1)}×
          </span>
          <button
            type="button"
            onClick={() => {
              adjustZoom(0.2);
            }}
            style={{
              padding: '0.3rem 0.7rem',
              fontSize: '0.82rem',
              fontWeight: 700,
              borderRadius: '6px',
              border: '1px solid #cbd5e1',
              backgroundColor: '#ffffff',
              cursor: 'pointer',
            }}
          >
            🔍 + Przybliż
          </button>
          <button
            type="button"
            onClick={() => {
              setCropX(50);
              setCropY(50);
              setCropZoom(1.0);
            }}
            style={{
              padding: '0.3rem 0.7rem',
              fontSize: '0.78rem',
              fontWeight: 600,
              borderRadius: '6px',
              border: '1px solid #cbd5e1',
              backgroundColor: '#ffffff',
              color: '#475569',
              cursor: 'pointer',
            }}
          >
            ↺ Resetuj kadr
          </button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', marginTop: '0.2rem' }}>
          <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748b' }}>
            Podgląd małej ikony w drzewie:
          </span>
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

      {/* Save / Cancel Actions */}
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            style={{
              padding: '0.45rem 0.9rem',
              fontSize: '0.82rem',
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
            padding: '0.48rem 1rem',
            fontSize: '0.84rem',
            fontWeight: 600,
            borderRadius: '8px',
            border: '1px solid #1d4ed8',
            backgroundColor: '#2563eb',
            color: '#ffffff',
            cursor: 'pointer',
          }}
        >
          ✓ Zapisz jako portret
        </button>
      </div>
    </div>
  );
}