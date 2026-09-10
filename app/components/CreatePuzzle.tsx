export interface CreatePuzzleProps {
  busy: boolean;
  onUpload: (file: File) => void;
  onPasteImage: () => void;
  onCreateManual: () => void;
}

export default function CreatePuzzle({
  busy,
  onUpload,
  onPasteImage,
  onCreateManual,
}: CreatePuzzleProps) {
  return (
    <section className="create-screen">
      <p className="eyebrow">ADD TO YOUR COLLECTION</p>
      <h1>A new puzzle.</h1>
      <p>Start with a photo, or enter the printed clues yourself.</p>
      <label
        className="upload"
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          const file = event.dataTransfer.files[0];
          if (file) onUpload(file);
        }}
      >
        <span aria-hidden="true">＋</span>
        <strong>{busy ? 'Reading your photo…' : 'Choose a Sudoku photo'}</strong>
        <small>or drop or paste an image · up to 20 MB</small>
        <input
          aria-label="Choose a Sudoku photo"
          type="file"
          accept="image/*"
          disabled={busy}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) onUpload(file);
            event.target.value = '';
          }}
        />
      </label>
      <div className="create-actions">
        <button disabled={busy} className="secondary" onClick={onPasteImage}>
          Paste image
        </button>
        <button disabled={busy} className="secondary" onClick={onCreateManual}>
          Enter clues by hand
        </button>
      </div>
      <p className="storage-note">Photos are processed and saved on your device.</p>
    </section>
  );
}
