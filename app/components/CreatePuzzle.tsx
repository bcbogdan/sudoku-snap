import { Button } from './Button';
import { Icon } from './Icon';
import { PhotoDropZone } from './PhotoDropZone';
import { ScanTips } from './ScanTips';

export interface CreatePuzzleProps {
  busy: boolean;
  onUpload: (file: File) => void;
  onPasteImage: () => void;
  onCreateManual: () => void;
  onCancel?: () => void;
}

export default function CreatePuzzle({
  busy,
  onUpload,
  onPasteImage,
  onCreateManual,
  onCancel,
}: CreatePuzzleProps) {
  return (
    <section className="create-screen">
      <p className="eyebrow">ADD TO YOUR COLLECTION</p>
      <h1>A new puzzle.</h1>
      <p>Start with a photo, or enter the printed clues yourself.</p>
      <PhotoDropZone busy={busy} onUpload={onUpload} />
      <div className="create-actions">
        {busy && onCancel && <Button onClick={onCancel}>Cancel reading</Button>}
        <Button disabled={busy} onClick={onPasteImage}>
          <Icon name="copy" /> Paste image
        </Button>
        <Button disabled={busy} onClick={onCreateManual}>
          <Icon name="pencil" /> Enter clues by hand
        </Button>
      </div>
      <p className="storage-note">Photos are processed and saved on your device.</p>
      <ScanTips />
    </section>
  );
}
