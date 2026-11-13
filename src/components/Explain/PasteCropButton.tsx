import React from 'react';
import { ImagePlus } from 'lucide-react';
import { checkPaste, getCrop, useCrop } from '../../services/cropStore';
import type { CropImage } from '../../services/imageCompress';

interface PasteCropButtonProps {
  onInsert: (img: CropImage) => void;
  className?: string;
  /** エディターのフォーカスを外さないために、押した瞬間のフォーカス移動を止める */
  keepFocus?: boolean;
}

/** PDFで切り抜いた画像を、いま編集している場所に貼り付けるボタン */
export const PasteCropButton: React.FC<PasteCropButtonProps> = ({ onInsert, className, keepFocus }) => {
  const crop = useCrop();

  const handle = () => {
    const img = getCrop();
    if (!img) return;
    const check = checkPaste(img);
    if (!check.ok) {
      window.alert(check.reason);
      return;
    }
    onInsert(img);
    if (check.warn) window.alert(check.warn);
  };

  return (
    <button
      type="button"
      disabled={!crop}
      onMouseDown={keepFocus ? (e) => e.preventDefault() : undefined}
      onClick={handle}
      title={
        crop
          ? `PDFで切り抜いた画像(${crop.width}×${crop.height}px・約${Math.round(crop.bytes / 1024)}KB)を、ここに貼り付けます`
          : 'PDFの「切り抜き」で範囲を選ぶと、ここから貼り付けられます'
      }
      className={
        className ??
        'flex items-center gap-1 px-1.5 py-1 rounded-md text-[11px] cursor-pointer disabled:opacity-30 text-sky-300 hover:bg-slate-700'
      }
    >
      <ImagePlus className="w-4 h-4" />
      切り抜きを貼り付け{crop ? `(${Math.round(crop.bytes / 1024)}KB)` : ''}
    </button>
  );
};

interface ImageSizeButtonsProps {
  current: number | null; // 選択中の画像の表示サイズ(%)。画像が選ばれていなければ null
  onChange: (pct: number) => void;
  keepFocus?: boolean;
}

const SIZES = [25, 50, 75, 100];

/** 選択中の画像の表示サイズ(本文の幅に対する%)を変える */
export const ImageSizeButtons: React.FC<ImageSizeButtonsProps> = ({ current, onChange, keepFocus }) => {
  if (current === null) return null;
  return (
    <span className="flex items-center gap-0.5 ml-1" aria-label="画像の表示サイズ">
      <span className="text-[10px] text-slate-400 mr-0.5">画像の大きさ</span>
      {SIZES.map((p) => (
        <button
          key={p}
          type="button"
          onMouseDown={keepFocus ? (e) => e.preventDefault() : undefined}
          onClick={() => onChange(p)}
          className={`px-1.5 py-0.5 rounded text-[10px] cursor-pointer ${
            current === p ? 'bg-sky-600 text-white' : 'text-slate-300 hover:bg-slate-700'
          }`}
        >
          {p}%
        </button>
      ))}
    </span>
  );
};
