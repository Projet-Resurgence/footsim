import { useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { toast } from '@/components/ui/Toast';

type Props = {
  value: string | null;
  onChange: (dataUrl: string) => void;
};

const SIZE = 150;

async function fileToResizedDataUrl(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas non supporté');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, 0, 0, SIZE, SIZE);
  return canvas.toDataURL('image/png');
}

export function FlagUpload({ value, onChange }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function pick(file: File) {
    setBusy(true);
    try {
      const url = await fileToResizedDataUrl(file);
      onChange(url);
    } catch (err) {
      toast('error', String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-4">
      <div
        className="flex h-[150px] w-[150px] items-center justify-center overflow-hidden rounded-md border border-border bg-bg"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const file = e.dataTransfer.files?.[0];
          if (file) pick(file);
        }}
      >
        {value ? (
          <img src={value} alt="Drapeau" className="h-full w-full object-cover" />
        ) : (
          <span className="text-xs text-muted">Glisse une image ici</span>
        )}
      </div>
      <div className="flex flex-col gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
        >
          {value ? 'Remplacer' : 'Choisir une image'}
        </Button>
        {value ? (
          <Button variant="ghost" size="sm" onClick={() => onChange('')}>
            Effacer
          </Button>
        ) : null}
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) pick(file);
            e.target.value = '';
          }}
        />
        <p className="max-w-[200px] text-xs text-muted">
          Auto-redimensionné à 150×150 PNG.
        </p>
      </div>
    </div>
  );
}
