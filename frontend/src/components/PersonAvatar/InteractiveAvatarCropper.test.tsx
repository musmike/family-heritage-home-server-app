import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import InteractiveAvatarCropper from './InteractiveAvatarCropper';

describe('InteractiveAvatarCropper Component', () => {
  it('renders cropper viewport and saves coordinates', () => {
    const handleSaveCrop = vi.fn();
    const handleCancel = vi.fn();

    render(
      <InteractiveAvatarCropper
        mediaId={101}
        mediaType="IMAGE"
        initialCropX={40}
        initialCropY={60}
        initialCropZoom={1.5}
        onSaveCrop={handleSaveCrop}
        onCancel={handleCancel}
      />
    );

    expect(screen.getByTestId('avatar-cropper-box')).toBeInTheDocument();
    expect(screen.getByTestId('cropper-viewport-container')).toBeInTheDocument();
    expect(screen.getByTestId('cropper-circular-aperture')).toBeInTheDocument();

    const saveBtn = screen.getByTestId('save-cropped-avatar-button');
    fireEvent.click(saveBtn);
    expect(handleSaveCrop).toHaveBeenCalledWith(40, 60, 1.5);
  });

  it('resets crop coordinates and zoom to default', () => {
    const handleSaveCrop = vi.fn();

    render(
      <InteractiveAvatarCropper
        mediaId={102}
        mediaType="IMAGE"
        initialCropX={20}
        initialCropY={30}
        initialCropZoom={2.5}
        onSaveCrop={handleSaveCrop}
      />
    );

    const resetBtn = screen.getByText('↺ Resetuj');
    fireEvent.click(resetBtn);

    const saveBtn = screen.getByTestId('save-cropped-avatar-button');
    fireEvent.click(saveBtn);
    expect(handleSaveCrop).toHaveBeenCalledWith(50, 50, 1.0);
  });
});

